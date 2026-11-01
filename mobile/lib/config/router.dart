import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/providers/supabase_provider.dart';
import '../core/services/storage_service.dart';
import '../features/auth/forgot_password_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/register_screen.dart';
import '../features/courses/course_detail_screen.dart';
import '../features/lessons/lessons_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/live/live_class_detail_screen.dart';
import '../features/live/live_schedule_screen.dart';
import '../features/notifications/notification_inbox_screen.dart';
import '../features/payments/checkout_screen.dart';
import '../features/payments/payment_history_screen.dart';
import '../features/player/video_player_screen.dart';
import '../features/reader/pdf_reader_screen.dart';
import '../features/shell/app_shell.dart';
import '../features/splash/splash_screen.dart';

final storageServiceProvider = Provider<StorageService>((ref) {
  throw UnimplementedError('StorageService must be overridden at startup');
});

final routerProvider = Provider<GoRouter>((ref) {
  final session = ref.watch(currentSessionProvider);
  final storage = ref.read(storageServiceProvider);

  return GoRouter(
    initialLocation: '/splash',
    debugLogDiagnostics: false,
    redirect: (context, state) {
      final isAuthenticated = session != null;
      final isSplash = state.matchedLocation == '/splash';
      final isAuth = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register' ||
          state.matchedLocation == '/forgot';
      final isOnboarding = state.matchedLocation == '/onboarding';

      if (isSplash) return null;

      if (!isAuthenticated) {
        if (!storage.onboardingSeen && !isOnboarding) {
          return '/onboarding';
        }
        if (!isAuth && !isOnboarding) {
          return '/login';
        }
        return null;
      }

      if (isAuth || isOnboarding) {
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
});
