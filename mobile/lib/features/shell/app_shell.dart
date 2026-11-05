import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/providers/course_rating_provider.dart';
import '../../core/providers/offline_provider.dart';
import '../../shared/theme/colors.dart';
import '../courses/courses_screen.dart';
import '../downloads/downloads_screen.dart';
import '../home/home_screen.dart';
import '../learning/my_learning_screen.dart';
import '../notifications/widgets/notification_bell.dart';
import '../profile/profile_screen.dart';
import 'widgets/offline_banner.dart';

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell>
    with WidgetsBindingObserver {
  int _currentIndex = 0;

  static const _titles = [
    'Dream Edge',
    'Courses',
    'My Learning',
    'Downloads',
    'Profile',
  ];

  final _screens = const [
    HomeScreen(),
    CoursesScreen(),
    MyLearningScreen(),
    DownloadsScreen(),
    ProfileScreen(),
  ];

  StreamSubscription<void>? _syncMessages;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    // The shell is the first thing alive on every launch, so it is where the
    // reconnect work is kicked off: queued positions sent, licences checked,
    // the download queue picked back up.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final sync = ref.read(offlineSyncProvider);
      unawaited(sync.run());
      _listenForOutcomes();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _syncMessages?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;

    // A phone that was asleep in a tunnel comes back without the interface
    // ever changing, so coming to the foreground is its own reason to look.
    unawaited(ref.read(connectivityServiceProvider).refresh());
    unawaited(ref.read(offlineSyncProvider).run());
  }

  /// Says so when a reconnect took something away.
  ///
  /// A download disappearing without explanation reads as the app losing it.
  /// Saying that an enrolment ended turns it into something the student can
  /// act on.
  void _listenForOutcomes() {
    _syncMessages = ref.read(offlineSyncProvider).outcomes.listen((outcome) {
      if (!mounted || outcome.licencesRevoked == 0) return;

      final count = outcome.licencesRevoked;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            count == 1
                ? '1 download is no longer available offline.'
                : '$count downloads are no longer available offline.',
          ),
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _titles[_currentIndex],
          style: GoogleFonts.playfairDisplay(
            fontWeight: FontWeight.w700,
            fontSize: 20,
            color: AppColors.textPrimary,
          ),
        ),
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        actions: const [NotificationBell(), SizedBox(width: 4)],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: IndexedStack(index: _currentIndex, children: _screens),
          ),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          // My Learning stays mounted in the stack, so its ratings would
          // otherwise keep saying "finish a lesson to rate" after the student
          // has gone and finished one. Re-reading on the way in is one call.
          if (index == 2 && _currentIndex != 2) {
            ref.invalidate(myCourseRatingsProvider);
          }
          setState(() => _currentIndex = index);
        },
        type: BottomNavigationBarType.fixed,
        selectedItemColor: AppColors.orange,
        unselectedItemColor: AppColors.gray,
        selectedFontSize: 11,
        unselectedFontSize: 11,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home_rounded),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.menu_book_rounded),
            label: 'Courses',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.school_rounded),
            label: 'My Learning',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.download_rounded),
            label: 'Downloads',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person_rounded),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}
