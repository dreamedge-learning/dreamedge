-- One search box behind the admin panel's Cmd+K palette.
--
-- The palette calls this once per keystroke (debounced) and groups the rows it
-- gets back by entity_type. Everything the panel can jump to from search lives
-- here -- students, courses, lessons, tests and orders -- so the five queries
-- share one round trip and one permission check.
--
-- Security definer because the five tables each carry their own row-level
-- security, and a plain query would hand back only the slice the caller's role
-- already reaches. That is almost right, but it is not the rule the panel
-- enforces: a teacher can open the students list yet must never see a phone
-- number, and an accountant has no business in the content tree at all. So the
-- function runs as owner, gates itself on is_admin(), and then decides branch
-- by branch which role may see which entity -- the same role lists the panel's
-- navigation and the export registry already use:
--
--   students : super_admin, teacher, support_staff   (contact columns only
--              for super_admin + support_staff, as CONTACT_ROLES)
--   courses  : super_admin, content_creator
--   lessons  : super_admin, content_creator
--   tests    : super_admin, content_creator
--   orders   : super_admin, accountant
--
-- A role that is cleared for none of the above still clears is_admin(); it
-- simply gets an empty set back, which is what the palette shows it.

create or replace function public.admin_global_search(
  p_query text,
  p_limit integer default 8
)
returns table (
  entity_type text,
  id          uuid,
  title       text,
  subtitle    text,
  url         text
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_term    text;
  v_pattern text;
  v_limit   integer;
  v_students boolean;
  v_contact  boolean;
  v_content  boolean;
  v_finance  boolean;
begin
  -- Refuse anyone who is not a signed-in admin before a single table is read.
  -- is_admin() answers false for a signed-out caller, so this also covers anon.
  if not public.is_admin() then
    raise exception 'Only an administrator can run a global search.'
      using errcode = '42501';
  end if;

  -- A single character matches most of the database and is never what the
  -- typist meant yet; wait for the second one.
  v_term := btrim(coalesce(p_query, ''));
  if length(v_term) < 2 then
    return;
  end if;

  -- Keep the per-group ceiling inside a sane band whatever the client asks for.
  v_limit := least(greatest(coalesce(p_limit, 8), 1), 20);

  -- The term is dropped into an ILIKE pattern, so its own wildcards have to be
  -- neutralised first or a query of "50%" would match every row. Backslash is
  -- the escape, so it is escaped before the characters that lean on it.
  v_pattern := '%' ||
    replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') ||
    '%';

  v_students := public.has_admin_role(
    array['super_admin', 'teacher', 'support_staff']::public.user_role[]
  );
  v_contact := public.has_admin_role(
    array['super_admin', 'support_staff']::public.user_role[]
  );
  v_content := public.has_admin_role(
    array['super_admin', 'content_creator']::public.user_role[]
  );
  v_finance := public.has_admin_role(
    array['super_admin', 'accountant']::public.user_role[]
  );

  -- Students. The subtitle carries the counter code and class, which identify
  -- a student without disclosing anything; a phone number is appended only for
  -- the roles CONTACT_ROLES clears, and only those roles may match on phone or
  -- email in the first place -- otherwise a teacher could confirm a number
  -- belongs to a student just by typing it.
  if v_students then
    return query
      select
        'student'::text,
        s.id,
        s.full_name,
        concat_ws(' · ',
          nullif(s.student_code, ''),
          case when nullif(s.class, '') is not null then 'Class ' || s.class end,
          case when v_contact then nullif(s.phone, '') end
        ),
        '/admin/students?student=' || s.id::text
      from public.students s
      where s.full_name ilike v_pattern escape '\'
         or s.student_code ilike v_pattern escape '\'
         or (v_contact and (
              s.phone ilike v_pattern escape '\'
              or s.email ilike v_pattern escape '\'
            ))
      order by s.full_name
      limit v_limit;
  end if;

  -- Courses.
  if v_content then
    return query
      select
        'course'::text,
        c.id,
        c.title,
        concat_ws(' · ',
          case when nullif(c.class, '') is not null then 'Class ' || c.class end,
          nullif(c.subject, ''),
          case when c.is_published then 'Published' else 'Draft' end
        ),
        '/admin/content/courses/' || c.id::text || '/edit'
      from public.courses c
      where c.title ilike v_pattern escape '\'
         or c.subject ilike v_pattern escape '\'
      order by c.title
      limit v_limit;
  end if;

  -- Lessons (content items). The palette sends the reader to the course's
  -- content tree, which is the only place a single item is addressable, so the
  -- row has to resolve its course through its topic and subject.
  if v_content then
    return query
      select
        'lesson'::text,
        ci.id,
        ci.title,
        concat_ws(' · ', co.title, initcap(ci.type::text)),
        '/admin/content/manager?course=' || co.id::text
      from public.content_items ci
      join public.topics   t  on t.id = ci.topic_id
      join public.subjects sub on sub.id = t.subject_id
      join public.courses  co on co.id = sub.course_id
      where ci.title ilike v_pattern escape '\'
      order by ci.title
      limit v_limit;
  end if;

  -- Tests.
  if v_content then
    return query
      select
        'test'::text,
        tst.id,
        tst.name,
        concat_ws(' · ', co.title, initcap(tst.status::text)),
        '/admin/content/tests/' || tst.id::text || '/edit'
      from public.tests tst
      left join public.courses co on co.id = tst.course_id
      where tst.name ilike v_pattern escape '\'
      order by tst.name
      limit v_limit;
  end if;

  -- Orders. Matched on the references a person actually quotes down the phone
  -- -- the invoice number and the gateway's order and payment ids -- plus the
  -- short head of the internal id for a row that has no invoice yet.
  if v_finance then
    return query
      select
        'order'::text,
        o.id,
        coalesce(nullif(o.invoice_number, ''),
                 'Order ' || upper(substr(o.id::text, 1, 8))),
        concat_ws(' · ', '₹' || o.final_amount, initcap(o.status::text), co.title),
        '/admin/revenue?tab=orders'
      from public.orders o
      left join public.courses co on co.id = o.course_id
      where o.invoice_number ilike v_pattern escape '\'
         or o.razorpay_order_id ilike v_pattern escape '\'
         or o.razorpay_payment_id ilike v_pattern escape '\'
         or o.id::text ilike v_pattern escape '\'
      order by o.created_at desc
      limit v_limit;
  end if;
end;
$fn$;

comment on function public.admin_global_search(text, integer) is
  'Admin command-palette search across students, courses, lessons, tests and orders. Gated on is_admin(); each entity branch is further limited to the roles that own it, and student contact columns are shown only to CONTACT_ROLES.';

-- Signed-in admins only. A signed-out caller would be refused by the is_admin()
-- check anyway, so anon loses EXECUTE outright rather than paying for a query
-- that can only raise.
revoke all on function public.admin_global_search(text, integer) from public;
revoke execute on function public.admin_global_search(text, integer) from anon;
grant execute on function public.admin_global_search(text, integer) to authenticated;
