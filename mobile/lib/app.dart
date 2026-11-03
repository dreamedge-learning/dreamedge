import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config/router.dart';
import 'config/theme.dart';

class DreamEdgeApp extends ConsumerWidget {
  const DreamEdgeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    // Dark only, with no themeMode and no light ThemeData to fall back to:
    // the phone's own light setting must not be able to reach this app.
    return MaterialApp.router(
      title: 'Dream Edge',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      routerConfig: router,
    );
  }
}
