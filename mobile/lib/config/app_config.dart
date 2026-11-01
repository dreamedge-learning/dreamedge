class AppConfig {
  AppConfig._();

  /// Where the website's API routes live.
  ///
  /// Documents are signed by /api/content/[id]/file rather than by an Edge
  /// Function, so that the website and the app fetch a PDF through one door
  /// and one entitlement check. The app sends its Supabase access token as a
  /// bearer header, since it holds no cookie for this domain.
  ///
  /// This must match the deployment the students actually use. Pointing it at
  /// a preview URL would work right up until that deployment is replaced.
  static const apiBaseUrl = 'https://dreamedge.online';

  static const supabaseUrl = 'https://ubymqjdmeknoblkrlgrf.supabase.co';
  static const supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVieW1xamRtZWtub2Jsa3JsZ3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0Njg4ODEsImV4cCI6MjEwOTA0NDg4MX0.NDcYGQIm0Qquw-rpnc_ANt-h0dmrVtbNJvnKynNGcYQ';
}
