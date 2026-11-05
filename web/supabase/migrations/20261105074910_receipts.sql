-- Receipts and GST tax invoices for every paid order.
--
-- `orders` has carried invoice_number and invoice_url since the first schema,
-- and nothing ever filled them: a student who paid got no paper for it. This
-- issues one the moment an order completes, whichever path completed it --
-- the Razorpay verify call, the webhook, or an admin keying in a cash payment.
--
-- Whether the paper is a plain receipt or a GST tax invoice is one switch in
-- `billing_profile`, off until the business is registered. Coaching for school
-- students is taxable at 18% under SAC 999293; registration becomes compulsory
-- above Rs 20 lakh of turnover in a financial year. Below that the business
-- must not charge GST at all, which is why the default is a receipt.
--
-- Each order keeps a snapshot of what was printed on it -- seller, buyer, tax
-- split -- taken when it was issued. Editing the business address next year
-- must not rewrite a receipt a parent already filed.

create table if not exists public.billing_profile (
  id              boolean primary key default true check (id),
  legal_name      text not null default 'Dream Edge',
  address         text not null default '',
  state           text not null default 'Maharashtra',
  state_code      text not null default '27' check (state_code ~ '^[0-9]{2}$'),
  gst_registered  boolean not null default false,
  gstin           text,
  gst_rate        numeric(5,2) not null default 18
                    check (gst_rate >= 0 and gst_rate <= 40),
  sac_code        text not null default '999293',
  receipt_prefix  text not null default 'DE'
                    check (receipt_prefix ~ '^[A-Z0-9]{1,4}$'),
  footer_note     text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.admin_users(id) on delete set null,
  -- A tax invoice without a valid GSTIN is not a tax invoice. The switch
  -- cannot be turned on until one is entered.
  constraint billing_gstin_when_registered check (
    not gst_registered
    or (gstin is not null
        and gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
  )
);

comment on table public.billing_profile is
  'The one row of seller details printed on receipts and tax invoices. Super admin edits; finance reads.';

insert into public.billing_profile (id, legal_name, address)
values (
  true,
  'Dream Edge',
  'Dream IIT, Near Bharat Gas, Saoner-Kalmeshwar Road, Kalmeshwar, Nagpur, Maharashtra 441501'
)
on conflict (id) do nothing;

alter table public.billing_profile enable row level security;

create policy "Finance admins read the billing profile"
  on public.billing_profile for select
  using (public.has_admin_role(array['super_admin', 'accountant', 'support_staff']::public.user_role[]));

create policy "Super admin edits the billing profile"
  on public.billing_profile for update
  using (public.has_admin_role(array['super_admin']::public.user_role[]))
  with check (public.has_admin_role(array['super_admin']::public.user_role[]));

revoke all on public.billing_profile from anon;

create or replace trigger billing_profile_set_updated_at
  before update on public.billing_profile
  for each row execute function public.update_updated_at();


-- One counter per financial year. Numbers run consecutively from 1 each
-- April, as a GST series must. Nobody reads or writes this but the trigger.
create table if not exists public.receipt_sequences (
  financial_year text primary key,
  last_number    integer not null default 0
);

alter table public.receipt_sequences enable row level security;
revoke all on public.receipt_sequences from anon, authenticated;


alter table public.orders
  add column if not exists invoice_issued_at timestamptz,
  add column if not exists invoice_snapshot  jsonb;

comment on column public.orders.invoice_snapshot is
  'What the receipt says, frozen when it was issued: kind, seller, buyer, course, amounts and tax split.';


-- The Indian financial year an instant falls in, as '26-27', read on the
-- Kolkata calendar so a payment at 00:30 IST on 1 April lands in the new year.
create or replace function public.indian_financial_year(p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when extract(month from (p_at at time zone 'Asia/Kolkata')) >= 4 then
      to_char(p_at at time zone 'Asia/Kolkata', 'YY') || '-' ||
      to_char((p_at at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
    else
      to_char((p_at at time zone 'Asia/Kolkata') - interval '1 year', 'YY') || '-' ||
      to_char(p_at at time zone 'Asia/Kolkata', 'YY')
  end
$$;


create or replace function public.issue_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile    public.billing_profile%rowtype;
  v_student    record;
  v_course     text;
  v_fy         text;
  v_number     integer;
  v_registered boolean;
  v_rate       numeric;
  v_total      numeric;
  v_taxable    numeric;
  v_tax        numeric;
  v_cgst       numeric := 0;
  v_sgst       numeric := 0;
  v_igst       numeric := 0;
  v_supply     text;
  v_intra      boolean;
begin
  -- Only money that arrived gets paper, and only once. A refund later changes
  -- the status, not the receipt.
  if new.status not in ('completed', 'refunded') or new.invoice_number is not null then
    return new;
  end if;

  select * into v_profile from public.billing_profile where id;
  if not found then
    v_profile.legal_name     := 'Dream Edge';
    v_profile.address        := '';
    v_profile.state          := 'Maharashtra';
    v_profile.state_code     := '27';
    v_profile.gst_registered := false;
    v_profile.gst_rate       := 18;
    v_profile.sac_code       := '999293';
    v_profile.receipt_prefix := 'DE';
  end if;

  select s.full_name, s.student_code, s.email, s.phone, s.city, s.state
    into v_student
    from public.students s
   where s.id = new.student_id;

  select c.title into v_course from public.courses c where c.id = new.course_id;

  v_fy := public.indian_financial_year(now());

  insert into public.receipt_sequences as seq (financial_year, last_number)
  values (v_fy, 1)
  on conflict (financial_year)
    do update set last_number = seq.last_number + 1
  returning last_number into v_number;

  -- 'DE/26-27/00001' is fourteen characters; with a four-letter prefix it is
  -- sixteen, the most a GST invoice number may have.
  new.invoice_number := coalesce(nullif(v_profile.receipt_prefix, ''), 'DE')
                        || '/' || v_fy || '/' || lpad(v_number::text, 5, '0');
  new.invoice_issued_at := now();
  new.invoice_url := '/receipt/' || new.id::text;

  v_registered := v_profile.gst_registered and coalesce(v_profile.gstin, '') <> '';
  v_total := new.final_amount;

  -- Place of supply for a student is where they live, when we know it;
  -- otherwise the supplier's own state. Same state: CGST and SGST in halves.
  -- Another state: IGST.
  v_supply := coalesce(nullif(trim(v_student.state), ''), v_profile.state);
  v_intra := lower(v_supply) = lower(trim(v_profile.state));

  if v_registered then
    v_rate := v_profile.gst_rate;
    -- Course prices are shown to students inclusive of tax, so the tax is
    -- carved out of what was paid rather than added on top of it.
    v_taxable := round(v_total * 100 / (100 + v_rate), 2);
    v_tax := v_total - v_taxable;
    if v_intra then
      v_cgst := round(v_tax / 2, 2);
      v_sgst := v_tax - v_cgst;
    else
      v_igst := v_tax;
    end if;
  else
    v_rate := 0;
    v_taxable := v_total;
    v_tax := 0;
  end if;

  new.invoice_snapshot := jsonb_build_object(
    'kind', case when v_registered then 'tax_invoice' else 'receipt' end,
    'seller', jsonb_build_object(
      'legal_name', v_profile.legal_name,
      'address', v_profile.address,
      'state', v_profile.state,
      'state_code', v_profile.state_code,
      'gstin', case when v_registered then v_profile.gstin end
    ),
    'buyer', jsonb_build_object(
      'name', v_student.full_name,
      'student_code', v_student.student_code,
      'email', v_student.email,
      'phone', v_student.phone,
      'city', v_student.city,
      'state', v_student.state
    ),
    'course_title', v_course,
    'sac_code', v_profile.sac_code,
    'place_of_supply', v_supply,
    'intra_state', v_intra,
    'gst_rate', v_rate,
    'list_price', new.amount,
    'discount', new.discount_amount,
    'taxable_value', v_taxable,
    'cgst', v_cgst,
    'sgst', v_sgst,
    'igst', v_igst,
    'total', v_total,
    'footer_note', v_profile.footer_note
  );

  return new;
end;
$$;

revoke all on function public.issue_receipt() from public, anon, authenticated;

create or replace trigger orders_issue_receipt
  before insert or update of status on public.orders
  for each row execute function public.issue_receipt();
