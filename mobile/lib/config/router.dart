import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/providers/student_provider.dart';
import '../core/providers/supabase_provider.dart';
import '../core/services/notification_service.dart';
import '../core/services/storage_service.dart';
import '../features/auth/forgot_password_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/register_screen.dart';
import '../features/certificates/certificates_screen.dart';
import '../features/courses/course_detail_screen.dart';
import '../features/lessons/lessons_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/live/live_class_detail_screen.dart';
import '../features/live/live_schedule_screen.dart';
import '../features/notifications/notification_inbox_screen.dart';
import '../features/payments/checkout_screen.dart';
import '../features/payments/payment_history_screen.dart';
import '../features/player/video_player_screen.dart';
import '../features/profile/edit_profile_screen.dart';
import '../features/profile_setup/profile_setup_screen.dart';
import '../features/reader/pdf_reader_screen.dart';
import '../features/tests/test_run_screen.dart';
import '../features/shell/app_shell.dart';
import '../features/splash/splash_screen.dart';

final storageServiceProvider = Provider<StorageService>((ref) {
  throw UnimplementedError('StorageService must be overridden at startup');
});

/// Bridges Riverpod state changes into `GoRouter.refreshListenable`.
///
/// Watching a provider inside the `routerProvider` body meant that every
/// state change rebuilt a fresh `GoRouter`, which `MaterialApp.router` then
/// re-read for `initialLocation` ('/splash') -- the stack was discarded on
/// every profile change. The profile-setup screen set a flag to show the
/// "you're all set, here is your student code" view at exactly the moment
/// the tree underneath it was being torn down, so the student never saw
/// their code. Same shape for edit-profile and for every launch after the
/// first (the student provider resolving triggered the rebuild).
///
/// A single `ChangeNotifier` on the two providers that matter tells the one
/// router to re-run its redirect without replacing itself, which is what
/// `refreshListenable` is for.
class _AuthGateRefresh extends ChangeNotifier {
  _AuthGateRefresh(Ref ref) {
    ref.listen<Object?>(currentSessionProvider, (_, _) => notifyListeners());
    ref.listen<Object?>(currentStudentProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthGateRefresh(ref);
  ref.onDispose(refresh.dispose);

  final storage = ref.read(storageServiceProvider);

  late final GoRouter router;

  // A notification tap sets `pendingRouteNotifier`; we listen here so the
  // deep-link reaches the router whether the tap happened on a cold start
  // (consumed below as initialMessage) or while the app was running. The
  // route is only pushed once the student is signed in and the profile is
  // complete -- a push targeting `/dashboard/notifications` must not shove
  // a logged-out user past the login screen.
  final notifications = NotificationService();
  void drainPendingRoute() {
    final route = notifications.consumePendingRoute();
    if (route == null) return;
    final session = ref.read(currentSessionProvider);
    final student = ref.read(currentStudentProvider).valueOrNull;
    if (session == null || student == null || !student.profileCompleted) {
      // Not ready yet. Put it back; the next refresh will drain again.
      notifications.pendingRouteNotifier.value = route;
      return;
    }
    router.push(route);
  }

  notifications.pendingRouteNotifier.addListener(drainPendingRoute);
  ref.listen<Object?>(currentSessionProvider, (_, _) => drainPendingRoute());
  ref.listen<Object?>(currentStudentProvider, (_, _) => drainPendingRoute());
  ref.onDispose(() {
    notifications.pendingRouteNotifier.removeListener(drainPendingRoute);
  });

  router = GoRouter(
    initialLocation: '/splash',
    debugLogDiagnostics: false,
    refreshListenable: refresh,
    redirect: (context, state) {
      // Read inside the callback, not above the builder: watching here is
      // what tore the router down. The listenable above makes sure the
      // redirect runs again whenever either value changes.
      //
      // currentStudentProvider is an AsyncValue, so while it is loading the
      // redirect has nothing to decide on and lets the student through; the
      // provider resolving fires the listenable and the redirect runs again.
      // Erring that way is deliberate: holding every route until a network
      // call finishes would turn a slow connection into a locked app.
      final session = ref.read(currentSessionProvider);
      final student = ref.read(currentStudentProvider).valueOrNull;
      final isAuthenticated = session != null;
      final isSplash = state.matchedLocation == '/splash';
      final isAuth = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register' ||
          state.matchedLocation == '/forgot';
      // `/onboarding` is the three-slide intro tour, shown before sign-in.
      // `/profile-setup` is the mandatory profile form, shown after it. Two
      // different things that both get called onboarding in conversation.
      final isTour = state.matchedLocation == '/onboarding';
      final isProfileSetup = state.matchedLocation == '/profile-setup';

      if (isSplash) return null;

      if (!isAuthenticated) {
        if (!storage.onboardingSeen && !isTour) {
          return '/onboarding';
        }
        if (!isAuth && !isTour) {
          return '/login';
        }
        return null;
      }

      // A student record without a class, a board or a parent's number is of
      // no use to the centre and of little use to the student, and a Google
      // sign-in supplies none of them. The form has to be a wall rather than
      // a banner, or it never gets filled in.
      if (student != null && !student.profileCompleted) {
        return isProfileSetup ? null : '/profile-setup';
      }

      if (isAuth || isTour || isProfileSetup) {
        return '/';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      GoRoute(
        path: '/profile-setup',
        builder: (context, state) => const ProfileSetupScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/forgot',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/',
        builder: (context, state) => const AppShell(),
      ),
      GoRoute(
        path: '/course/:id',
        builder: (context, state) => CourseDetailScreen(
          courseId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/lessons/:topicId',
        builder: (context, state) {
          final topicId = state.pathParameters['topicId']!;
          final topicName = state.extra as String? ?? 'Lessons';
          return LessonsScreen(topicId: topicId, topicName: topicName);
        },
      ),
      GoRoute(
        path: '/player/:contentId',
        builder: (context, state) => VideoPlayerScreen(
          contentId: state.pathParameters['contentId']!,
        ),
      ),
      GoRoute(
        path: '/reader/:contentId',
        builder: (context, state) => PdfReaderScreen(
          contentId: state.pathParameters['contentId']!,
        ),
      ),
      GoRoute(
        path: '/tests/:id/run',
        builder: (context, state) => TestRunScreen(
          testId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/notifications',
        builder: (context, state) => const NotificationInboxScreen(),
      ),
      GoRoute(
        path: '/checkout/:courseId',
        builder: (context, state) => CheckoutScreen(
          courseId: state.pathParameters['courseId']!,
        ),
      ),
      GoRoute(
        path: '/payment-history',
        builder: (context, state) => const PaymentHistoryScreen(),
      ),
      GoRoute(
        path: '/profile/edit',
        builder: (context, state) => const EditProfileScreen(),
      ),
      GoRoute(
        path: '/certificates',
        builder: (context, state) => const CertificatesScreen(),
      ),
      // The "certificate issued" inbox message carries the website's path,
      // because one notification row serves both platforms. Tapping it in the
      // app lands here.
      GoRoute(
        path: '/dashboard/certificates',
        redirect: (context, state) => '/certificates',
      ),
      GoRoute(
        path: '/live',
        builder: (context, state) => const LiveScheduleScreen(),
      ),
      GoRoute(
        path: '/live/:id',
        builder: (context, state) => LiveClassDetailScreen(
          classId: state.pathParameters['id']!,
        ),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Text('Page not found: ${state.error}'),
      ),
    ),
  );
  return router;
});
