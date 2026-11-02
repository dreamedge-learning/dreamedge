class AppConfig {
  AppConfig._();

  /// Where the website's API routes live.
  ///
  /// Documents are signed by /api/content/[id]/file rather than by an Edge
  /// Function, so that the website and the app fetch a PDF through one door
  /// and one entitlement check. The app sends its Supabase access token as a
  /// bearer header, since it holds no cookie for this domain.
  ///
  /// This must name the deployment that actually serves those routes, and it
  /// is the Vercel production alias until the custom domain is pointed at it.
  /// `dreamedgelearning.com` does not resolve yet, and `dreamedge.online` --
  /// the domain this project was first registered under -- now answers from
  /// LiteSpeed with a 404, so either one here would send every PDF the app
  /// opens to a host that has never heard of us.
  ///
  /// This is the alias rather than a per-deployment preview URL, so it follows
  /// production rather than going stale on the next deploy. Change it to
  /// `https://dreamedgelearning.com` the day that domain is live.
  static const apiBaseUrl = 'https://dreamedge-sand.vercel.app';

  static const supabaseUrl = 'https://ubymqjdmeknoblkrlgrf.supabase.co';
  static const supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVieW1xamRtZWtub2Jsa3JsZ3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0Njg4ODEsImV4cCI6MjEwOTA0NDg4MX0.NDcYGQIm0Qquw-rpnc_ANt-h0dmrVtbNJvnKynNGcYQ';
}
