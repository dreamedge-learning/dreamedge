class AppConstants {
  AppConstants._();

  static const appName = 'Dream Edge';
  static const appTagline = 'Basic Concept Se Top Result TK';
  static const appTaglineHindi = 'मजबूत नींव, शानदार भविष्य';

  static const onboardingSeenKey = 'onboarding_seen';
  static const authTokenKey = 'auth_token';

  /// The address the Help & Support link opens a mail draft to.
  ///
  /// `site_settings.support_email` is the real source of truth -- an admin
  /// edits it under Settings > Platform -- so this copy has to be changed with
  /// it. It is held here rather than fetched because a mail link should not
  /// wait on a request, and the previous value,
  /// `support@dreamedge.online`, had quietly stopped working: that domain has
  /// no MX record at all, so every support mail a student sent bounced.
  static const supportEmail = 'supportteam@dreamedgelearning.com';

  /// Shown to students and opened in a browser, so the apex is right here even
  /// though it redirects to `www`. Requests the app makes go to
  /// [AppConfig.apiBaseUrl], which names the canonical host so that no
  /// document fetch depends on following a redirect.
  static const websiteUrl = 'https://dreamedgelearning.com';

  static const minPasswordLength = 6;
  static const otpLength = 6;

  static const splashDuration = Duration(seconds: 2);

  static const classes = ['6', '7', '8', '9', '10'];

  static const boards = ['CBSE', 'State', 'ICSE', 'Other'];

  /// Value and label, because the column stores the code and the form shows
  /// the words.
  static const genders = <String, String>{
    'male': 'Male',
    'female': 'Female',
  };

  /// States and union territories, in the same order as the website's list so
  /// the two dropdowns read identically.
  static const indianStates = [
    'Andhra Pradesh',
    'Arunachal Pradesh',
    'Assam',
    'Bihar',
    'Chhattisgarh',
    'Goa',
    'Gujarat',
    'Haryana',
    'Himachal Pradesh',
    'Jharkhand',
    'Karnataka',
    'Kerala',
    'Madhya Pradesh',
    'Maharashtra',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Odisha',
    'Punjab',
    'Rajasthan',
    'Sikkim',
    'Tamil Nadu',
    'Telangana',
    'Tripura',
    'Uttar Pradesh',
    'Uttarakhand',
    'West Bengal',
    'Andaman and Nicobar Islands',
    'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi',
    'Jammu and Kashmir',
    'Ladakh',
    'Lakshadweep',
    'Puducherry',
  ];
}
