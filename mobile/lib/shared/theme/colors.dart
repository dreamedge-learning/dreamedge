import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  // Brand tokens. These are the same values the website and the admin panel
  // use, and they do not change between light and dark.
  static const orange = Color(0xFFF26A21);
  static const orangeDark = Color(0xFFD95D1B);
  static const black = Color(0xFF0D0D0D);
  static const white = Color(0xFFFFFFFF);
  static const darkBlue = Color(0xFF16223B);
  static const golden = Color(0xFFC9A84C);
  static const gray = Color(0xFF8892A0);

  // Light surfaces.
  static const background = white;
  static const surface = Color(0xFFF8F9FA);
  static const textPrimary = Color(0xFF1A1A2E);
  static const textSecondary = Color(0xFF6B7280);
  static const border = Color(0xFFE5E7EB);

  // Dark surfaces.
  //
  // Background is the brand black. Surface lifts off it just enough for a card
  // to read as a card without becoming grey, and the border sits one step
  // above that -- on an OLED phone a pure-black card on a pure-black page is
  // invisible, which is the usual way a dark theme goes wrong.
  static const backgroundDark = black;
  static const surfaceDark = Color(0xFF161A22);
  static const surfaceDarkElevated = Color(0xFF1D222C);
  static const textPrimaryDark = Color(0xFFF5F6F8);
  static const textSecondaryDark = gray;
  static const borderDark = Color(0xFF2A303C);

  // Status colours. The dark variants are lightened because the light-mode
  // reds and greens fail contrast against a near-black background.
  static const error = Color(0xFFDC2626);
  static const success = Color(0xFF16A34A);
  static const warning = Color(0xFFD97706);

  static const errorDark = Color(0xFFF87171);
  static const successDark = Color(0xFF4ADE80);
  static const warningDark = Color(0xFFFBBF24);
}
