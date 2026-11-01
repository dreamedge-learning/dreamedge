import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/models/test.dart';
import '../../core/models/test_attempt.dart';
import '../../core/providers/course_provider.dart';
import '../../core/providers/test_provider.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../../shared/widgets/shimmer_box.dart';

class TestListScreen extends ConsumerStatefulWidget {
  const TestListScreen({super.key});

  @override
  ConsumerState<TestListScreen> createState() => _TestListScreenState();
}

class _TestListScreenState extends ConsumerState<TestListScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final testsAsync = ref.watch(testListProvider);
    final attemptsAsync = ref.watch(myTestAttemptsProvider);

    return Scaffold(
      backgroundColor: AppColors.white,
      body: Column(
        children: [
          Container(
            color: AppColors.white,
            child: TabBar(
              controller: _tabs,
              indicatorColor: AppColors.orange,
              labelColor: AppColors.orange,
              unselectedLabelColor: AppColors.textSecondary,
              labelStyle: AppTypography.bodyMedium
                  .copyWith(fontWeight: FontWeight.w600),
              tabs: const [
                Tab(text: 'Upcoming'),
                Tab(text: 'History'),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: [
                _buildUpcoming(testsAsync, attemptsAsync),
                _buildHistory(testsAsync, attemptsAsync),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUpcoming(
    AsyncValue<List<Test>> testsAsync,
    AsyncValue<List<TestAttempt>> attemptsAsync,
  ) {
    return RefreshIndicator(
      color: AppColors.orange,
      onRefresh: () async {
        ref.invalidate(testListProvider);
        ref.invalidate(myTestAttemptsProvider);
      },
      child: testsAsync.when(
        loading: () => ShimmerList(itemCount: 4, itemHeight: 110),
        error: (e, _) => _buildError(() => ref.invalidate(testListProvider)),
        data: (tests) {
          final attempts = attemptsAsync.valueOrNull ?? const <TestAttempt>[];
          final attemptsByTest = <String, List<TestAttempt>>{};
          for (final a in attempts) {
            attemptsByTest.putIfAbsent(a.testId, () => []).add(a);
          }
          final available = tests.where((t) {
            final count = attemptsByTest[t.id]?.length ?? 0;
            return !t.isExpired && count < t.maxAttempts;
          }).toList();

          if (available.isEmpty) {
            return _buildEmpty(
              icon: Icons.quiz_outlined,
              title: 'No upcoming tests',
              message:
                  'You are all caught up. New tests will appear here once your mentor publishes them.',
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            itemCount: available.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, i) {
              final t = available[i];
              final count = attemptsByTest[t.id]?.length ?? 0;
              return _UpcomingTestCard(
                test: t,
                attemptsUsed: count,
                onTap: () => context.push('/tests/${t.id}/run'),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildHistory(
    AsyncValue<List<Test>> testsAsync,
    AsyncValue<List<TestAttempt>> attemptsAsync,
  ) {
    return RefreshIndicator(
      color: AppColors.orange,
      onRefresh: () async {
        ref.invalidate(myTestAttemptsProvider);
        ref.invalidate(testListProvider);
      },
      child: attemptsAsync.when(
        loading: () => ShimmerList(itemCount: 4, itemHeight: 110),
        error: (e, _) =>
            _buildError(() => ref.invalidate(myTestAttemptsProvider)),
        data: (attempts) {
          if (attempts.isEmpty) {
            return _buildEmpty(
              icon: Icons.history_rounded,
              title: 'No tests taken yet',
              message:
                  'Your past attempts and scores will show up here after you take your first test.',
            );
          }
          final tests = {for (final t in testsAsync.valueOrNull ?? []) t.id: t};
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            itemCount: attempts.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, i) {
              final a = attempts[i];
              return _AttemptCard(
                attempt: a,
                test: tests[a.testId],
                onTap: () => context.push('/tests/attempt/${a.id}'),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildEmpty({
    required IconData icon,
    required String title,
    required String message,
  }) {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      children: [
        const SizedBox(height: 120),
        Icon(icon, size: 64, color: AppColors.gray.withValues(alpha: 0.5)),
        const SizedBox(height: 16),
        Text(title,
            textAlign: TextAlign.center,
            style: AppTypography.heading3
                .copyWith(color: AppColors.textPrimary)),
        const SizedBox(height: 8),
        Text(message,
            textAlign: TextAlign.center,
            style:
                AppTypography.bodySmall.copyWith(color: AppColors.gray)),
      ],
    );
  }

  Widget _buildError(VoidCallback onRetry) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Could not load tests',
              style: AppTypography.bodyLarge
                  .copyWith(color: AppColors.error)),
          const SizedBox(height: 12),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

class _UpcomingTestCard extends ConsumerWidget {
  final Test test;
  final int attemptsUsed;
  final VoidCallback onTap;

  const _UpcomingTestCard({
    required this.test,
    required this.attemptsUsed,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final remaining = test.maxAttempts - attemptsUsed;
    // `tests.course_id` is nullable, so there may be no course to name.
    final courseId = test.courseId;
    final courseAsync = courseId == null
        ? null
        : ref.watch(courseDetailProvider(courseId));
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.orange.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.assignment_outlined,
                      color: AppColors.orange),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(test.name,
                          style: AppTypography.bodyLarge.copyWith(
                              fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      if (courseAsync != null)
                        courseAsync.when(
                          data: (c) => Text(c.title,
                              style: AppTypography.bodySmall),
                          loading: () => const SizedBox(
                              height: 14,
                              width: 80,
                              child: ShimmerBox(width: 80, height: 10)),
                          error: (_, _) => const SizedBox.shrink(),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _InfoChip(
                    icon: Icons.timer_outlined,
                    label: '${test.durationMinutes} min'),
                _InfoChip(
                    icon: Icons.star_outline,
                    label: '${test.totalMarks.toStringAsFixed(0)} marks'),
                _InfoChip(
                    icon: Icons.repeat_rounded,
                    label:
                        '$remaining of ${test.maxAttempts} attempts left'),
                if (test.startTime != null)
                  _InfoChip(
                      icon: Icons.event_outlined,
                      label: DateFormat('d MMM, h:mm a')
                          .format(test.startTime!.toLocal())),
              ],
            ),
            const SizedBox(height: 14),
            Align(
              alignment: Alignment.centerRight,
              child: ElevatedButton(
                onPressed: onTap,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.orange,
                  foregroundColor: AppColors.white,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 20, vertical: 10),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Start test'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttemptCard extends StatelessWidget {
  final TestAttempt attempt;
  final Test? test;
  final VoidCallback onTap;

  const _AttemptCard(
      {required this.attempt, required this.test, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final pct = test?.passPercentage ?? 33;
    final passed = attempt.passedAt(pct);
    final color = passed ? AppColors.success : AppColors.error;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Text('${attempt.percentage.toStringAsFixed(0)}%',
                  style: AppTypography.bodyMedium.copyWith(
                      color: color, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(test?.name ?? 'Test attempt',
                      style: AppTypography.bodyLarge.copyWith(
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(
                      '${attempt.score.toStringAsFixed(1)} / ${attempt.totalMarks.toStringAsFixed(0)}  •  ${attempt.formattedTimeTaken}',
                      style: AppTypography.bodySmall),
                  const SizedBox(height: 4),
                  Text(
                      'Attempt #${attempt.attemptNumber} · ${DateFormat('d MMM yyyy').format(attempt.submittedAt.toLocal())}',
                      style:
                          AppTypography.caption.copyWith(color: AppColors.gray)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(passed ? 'Passed' : 'Failed',
                  style: AppTypography.caption.copyWith(
                      color: color, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _InfoChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: AppColors.textSecondary),
          const SizedBox(width: 6),
          Text(label,
              style: AppTypography.caption
                  .copyWith(color: AppColors.textPrimary)),
        ],
      ),
    );
  }
}
