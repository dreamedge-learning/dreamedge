class AppConfig {
  AppConfig._();

  /// Where the website's API routes live.
  ///
  /// Documents are signed by /api/content/[id]/file rather than by an Edge
  /// Function, so that the website and the app fetch a PDF through one door
  /// and one entitlement check. The app sends its Supabase access token as a
  /// bearer header, since it holds no cookie for this domain.
  ///
  /// `www` deliberately, and not the apex: the apex answers 308 and redirects
  /// here, and a document fetch should not depend on Dio following a redirect
  /// with its Authorization header intact on every single PDF.
  ///
  /// It is not `dreamedge.online`, the domain this project was first
  /// registered under. That one is parked on Hostinger now and answers from
  /// LiteSpeed with a 404, so pointing the app at it sent every PDF, note and
  /// past paper to a host that has never heard of us.
  static const apiBaseUrl = 'https://www.dreamedgelearning.com';

  static const supabaseUrl = 'https://ubymqjdmeknoblkrlgrf.supabase.co';
  static const supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVieW1xamRtZWtub2Jsa3JsZ3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0Njg4ODEsImV4cCI6MjEwOTA0NDg4MX0.NDcYGQIm0Qquw-rpnc_ANt-h0dmrVtbNJvnKynNGcYQ';
}
