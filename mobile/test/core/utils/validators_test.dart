import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/validators.dart';

void main() {
  group('newPassword', () {
    test('matches the website: eight characters is the floor', () {
      expect(Validators.newPassword('1234567'), isNotNull);
      expect(Validators.newPassword('12345678'), isNull);
    });

    test('an empty field asks for a password', () {
      expect(Validators.newPassword(''), 'Password is required');
      expect(Validators.newPassword(null), 'Password is required');
    });
  });

  group('password (sign in)', () {
    test('a short existing password can still be submitted', () {
      // Accounts made while the app allowed six characters must not be
      // locked out of the form; the server decides whether it matches.
      expect(Validators.password('abc123'), isNull);
    });

    test('an empty field is still refused', () {
      expect(Validators.password(''), 'Password is required');
    });
  });
}
