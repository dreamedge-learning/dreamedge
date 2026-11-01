-- Public-facing settings are read by the student site while unauthenticated.
-- Without a policy for anon the footer silently rendered empty social links and
-- the support contact fell back to hardcoded copy.

alter table site_settings
  add column if not exists is_public boolean not null default false;

update site_settings
   set is_public = true
 where key in (
   'platform_name',
   'tagline',
   'support_email',
   'support_phone',
   'social_links',
   'maintenance_mode',
   'student_registration_open'
 );

update site_settings
   set value = '"supportteam@dreamedgelearning.com"', updated_at = now()
 where key = 'support_email';

update site_settings
   set value = '"+91 96375 47539"', updated_at = now()
 where key = 'support_phone';

drop policy if exists "Public settings are readable by anyone" on site_settings;

create policy "Public settings are readable by anyone" on site_settings
  for select using (is_public = true);
