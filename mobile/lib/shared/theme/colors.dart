import 'package:flutter/material.dart';

/// Dream Edge is a dark-only product. There is no light theme on the app, the
/// website or the admin panel.
///
/// The semantic names below (background, surface, textPrimary, border, ...)
/// therefore hold dark values. They kept their names on purpose: around forty
/// screens refer to them, and repointing the tokens turns the whole app dark
/// in one place instead of touching every file and missing some.
class AppColors {
  AppColors._();

  // Brand tokens. Same values as the website and the admin panel.
  //
  // `white` is a literal white and stays one -- it is the colour of label text
  // on an orange button and of icons on the player's scrim, which are correct
  // on a dark screen. It is not a surface.
  static const orange = Color(0xFFF26A21);
  static const orangeDark = Color(0xFFD95D1B);
  static const black = Color(0xFF0D0D0D);
  static const white = Color(0xFFFFFFFF);
  static const darkBlue = Color(0xFF16223B);
  static const golden = Color(0xFFC9A84C);
  static const gray = Color(0xFF8892A0);

  // Surfaces.
  //
  // Background is the brand black. Surface lifts off it just enough for a card
  // to read as a card without going grey, and the border sits a step above
  // that: on an OLED phone a pure-black card on a pure-black page is
  // invisible, which is the usual way a dark screen goes wrong.
  static const background = black;
  static const surface = Color(0xFF161A22);
  static const surfaceElevated = Color(0xFF1D222C);
  static const border = Color(0xFF2A303C);

  // Text.
  static const textPrimary = Color(0xFFF5F6F8);
  static const textSecondary = gray;

  // Status. Lightened from the web palette, because the light-mode reds and
  // greens fail contrast against a near-black background.
  static const error = Color(0xFFF87171);
  static const success = Color(0xFF4ADE80);
  static const warning = Color(0xFFFBBF24);

  // Kept so the few call sites that named the dark variants explicitly keep
  // compiling. They are the same values as above.
  static const backgroundDark = background;
  static const surfaceDark = surface;
  static const surfaceDarkElevated = surfaceElevated;
  static const textPrimaryDark = textPrimary;
  static const textSecondaryDark = textSecondary;
  static const borderDark = border;
  static const errorDark = error;
  static const successDark = success;
  static const warningDark = warning;
}
