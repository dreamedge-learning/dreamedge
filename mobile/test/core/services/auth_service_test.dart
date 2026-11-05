import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/config/app_config.dart';
import 'package:mobile/core/services/auth_service.dart';

void main() {
  test('the reset email lands on the website hand-over page', () {
    // Supabase redirects only to allow-listed addresses. The website is on
    // that list and the app scheme is not, so the link must point here and
    // let the page pass the code on to the app.
    final uri = Uri.parse(AuthService.passwordResetRedirect);
    expect(uri.scheme, 'https');
    expect(uri.host, Uri.parse(AppConfig.apiBaseUrl).host);
    expect(uri.path, '/auth/open-app');
    expect(uri.queryParameters['to'], 'reset-password');
  });
}
