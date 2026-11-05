import 'package:flutter/foundation.dart';

/// Whether this build of the app may sell anything.
///
/// The iOS app does not sell. Apple requires its own in-app purchase for
/// digital courses, and rejects an app that sends students to a payment page
/// elsewhere. Students enrol on the website and the app unlocks whatever they
/// own. So on iOS every price, buy button, checkout route and payment record
/// is absent, not merely disabled -- a reviewer who reaches a hidden checkout
/// through a deep link rejects the build just the same.
///
/// Free courses are not a sale and stay enrollable everywhere.
///
/// Read from [defaultTargetPlatform] rather than dart:io so tests can run both
/// stores with debugDefaultTargetPlatformOverride.
abstract final class Storefront {
  static bool get canSell =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
}
