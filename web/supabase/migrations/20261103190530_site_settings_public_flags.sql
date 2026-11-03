-- Two settings the signed-out site has to be able to read.
--
-- `site_settings` is readable by anon only where `is_public` is true. The
-- course page shows a Buy button to visitors who have not signed in, and the
-- register form shows a referral field to the same people, so both flags have
-- to cross to an anonymous reader or the page falls back to its default and
-- the switch does nothing for exactly the audience it is aimed at.
--
-- Neither is a secret: they say what the platform offers, which the page
-- itself already tells you. `manual_payment_enabled` stays private because
-- only the panel ever consults it, and `free_trial_days`,
-- `max_devices_per_student`, `video_quality_default` and `watermark_enabled`
-- stay private because nothing consults them at all yet.

update public.site_settings
   set is_public = true
 where key in ('razorpay_enabled', 'referral_system_enabled');

comment on column public.site_settings.is_public is
  'Whether anon may read this row. A setting consulted on a signed-out page must be public, or the page silently falls back to its compiled default.';
