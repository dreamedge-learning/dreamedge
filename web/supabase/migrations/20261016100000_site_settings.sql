create table if not exists site_settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references admin_users(id)
);

insert into site_settings (key, value) values
  ('platform_name', '"Dream Edge Online"'),
  ('tagline', '"Foundation Courses for Classes 6-10"'),
  ('support_email', '"supportteam@dreamedgelearning.com"'),
  ('support_phone', '"+91-XXXXXXXXXX"'),
  ('social_links', '{"youtube":"","instagram":"","telegram":"","whatsapp":""}'),
  ('maintenance_mode', 'false'),
  ('student_registration_open', 'true'),
  ('razorpay_enabled', 'true'),
  ('manual_payment_enabled', 'true'),
  ('referral_system_enabled', 'true'),
  ('free_trial_days', '7'),
  ('max_devices_per_student', '2'),
  ('video_quality_default', '"720p"'),
  ('watermark_enabled', 'true')
on conflict (key) do nothing;

alter table site_settings enable row level security;

create policy "Admins can read site_settings" on site_settings
  for select using (
    exists (
      select 1 from admin_users au
      join roles r on au.role_id = r.id
      where au.user_id = auth.uid() and au.is_active = true
    )
  );

create policy "Super admin and technical can update site_settings" on site_settings
  for update using (
    exists (
      select 1 from admin_users au
      join roles r on au.role_id = r.id
      where au.user_id = auth.uid()
        and au.is_active = true
        and r.name in ('super_admin', 'technical')
    )
  );

create policy "Super admin and technical can insert site_settings" on site_settings
  for insert with check (
    exists (
      select 1 from admin_users au
      join roles r on au.role_id = r.id
      where au.user_id = auth.uid()
        and au.is_active = true
        and r.name in ('super_admin', 'technical')
    )
  );
