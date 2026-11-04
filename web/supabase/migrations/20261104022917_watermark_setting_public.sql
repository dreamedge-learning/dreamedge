-- `watermark_enabled` stops being inert.
--
-- It was one of four switches gating a feature that did not exist. The
-- runtime watermark now reads it, so it has to cross to an anonymous reader:
-- the video route serves the Flutter app over a bearer token with no cookie
-- session, and a private row would fall back to the compiled default there
-- while working on the website -- the switch half-working being worse than
-- not working at all.
--
-- Not a secret: the watermark is the student's own name, drawn on screen in
-- front of them.

update public.site_settings
   set is_public = true
 where key = 'watermark_enabled';
