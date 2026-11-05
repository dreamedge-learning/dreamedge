import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/enrollment.dart';
import '../../core/providers/enrollment_provider.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../../shared/widgets/shimmer_box.dart';
import 'leaderboard_providers.dart';
import 'leaderboard_service.dart';
import 'models/leaderboard_entry.dart';

/// Weekly leaderboard for one of the student's enrolled courses.
///
/// Reachable from the Home screen and the end-of-test results panel; opened
/// with an optional `initialCourseId` to seed the course picker on the
/// results route (where the course is already known).
class LeaderboardScreen extends ConsumerStatefulWidget {
  final String? initialCourseId;

  const LeaderboardScreen({super.key, this.initialCourseId});

  @override
  ConsumerState<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends ConsumerState<LeaderboardScreen> {
  String? _courseId;
  LeaderboardWeek _week = LeaderboardWeek.thisWeek;

  @override
  void initState() {
    super.initState();
    _courseId = widget.initialCourseId;
  }

  @override
  Widget build(BuildContext context) {
    final enrollmentsAsync = ref.watch(myEnrollmentsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        title: Text('Leaderboard',
            style: AppTypography.bodyLarge
                .copyWith(fontWeight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: enrollmentsAsync.when(
          data: (enrollments) {
            // The same rule the server uses to let a student see a board:
            // an active enrolment that has not expired. A null validUntil is
            // lifetime access. Listing an expired course here would only
            // ever show an empty board.
            final now = DateTime.now();
            final active = enrollments
                .where((e) =>
                    e.isActive &&
                    e.course != null &&
                    (e.validUntil == null || e.validUntil!.isAfter(now)))
                .toList(growable: false);
            if (active.isEmpty) {
              return _EmptyState(
                icon: Icons.school_outlined,
                title: 'No enrolled course yet',
                detail:
                    'Enrol in a course to see how you rank against your '
                    'classmates each week.',
              );
            }
            final chosenId = _resolveCourseId(active);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (active.length > 1)
                  _CoursePicker(
                    enrollments: active,
                    selectedId: chosenId,
                    onChanged: (id) => setState(() => _courseId = id),
                  )
                else
                  _SingleCourseHeader(enrollment: active.first),
                const SizedBox(height: 4),
                _WeekToggle(
                  value: _week,
                  onChanged: (w) => setState(() => _week = w),
                ),
                const SizedBox(height: 4),
                Expanded(
                  child: _LeaderboardBody(courseId: chosenId, week: _week),
                ),
              ],
            );
          },
          loading: () => const _ListSkeleton(),
          error: (_, _) => _EmptyState(
            icon: Icons.wifi_off_rounded,
            title: 'Could not load your courses',
            detail: 'Pull down to try again, or come back when the connection '
                'is better.',
          ),
        ),
      ),
    );
  }

  String _resolveCourseId(List<Enrollment> active) {
    final stored = _courseId;
    if (stored != null && active.any((e) => e.courseId == stored)) {
      return stored;
    }
    // Default to the first enrolment. Setting state in build is unsafe, so
    // save the resolved id to the field after the frame.
    final next = active.first.courseId;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_courseId != next) setState(() => _courseId = next);
    });
    return next;
  }
}

// =============================================================================
// Course picker + single-course header
// =============================================================================

class _CoursePicker extends StatelessWidget {
  final List<Enrollment> enrollments;
  final String selectedId;
  final ValueChanged<String> onChanged;

  const _CoursePicker({
    required this.enrollments,
    required this.selectedId,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            isExpanded: true,
            value: selectedId,
            dropdownColor: AppColors.surfaceElevated,
            iconEnabledColor: AppColors.textSecondary,
            style: AppTypography.bodyMedium,
            items: [
              for (final e in enrollments)
                DropdownMenuItem<String>(
                  value: e.courseId,
                  child: Text(
                    e.course?.title ?? 'Course',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (id) {
              if (id != null) onChanged(id);
            },
          ),
        ),
      ),
    );
  }
}

class _SingleCourseHeader extends StatelessWidget {
  final Enrollment enrollment;

  const _SingleCourseHeader({required this.enrollment});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Row(
        children: [
          Icon(Icons.emoji_events_outlined,
              color: AppColors.orange, size: 22),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              enrollment.course?.title ?? 'Your course',
              style: AppTypography.heading3,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// This week / Last week toggle
// =============================================================================

class _WeekToggle extends StatelessWidget {
  final LeaderboardWeek value;
  final ValueChanged<LeaderboardWeek> onChanged;

  const _WeekToggle({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: _toggleButton('This week', LeaderboardWeek.thisWeek),
            ),
            Expanded(
              child: _toggleButton('Last week', LeaderboardWeek.lastWeek),
            ),
          ],
        ),
      ),
    );
  }

  Widget _toggleButton(String label, LeaderboardWeek which) {
    final selected = value == which;
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: selected ? null : () => onChanged(which),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.orange : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: AppTypography.bodyMedium.copyWith(
            color: selected ? AppColors.white : AppColors.textSecondary,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// Body: shimmer / list / error / empty
// =============================================================================

class _LeaderboardBody extends ConsumerWidget {
  final String courseId;
  final LeaderboardWeek week;

  const _LeaderboardBody({required this.courseId, required this.week});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = LeaderboardQuery(courseId: courseId, week: week);
    final async = ref.watch(leaderboardProvider(query));
    return RefreshIndicator(
      color: AppColors.orange,
      onRefresh: () async {
        ref.invalidate(leaderboardProvider(query));
        await ref.read(leaderboardProvider(query).future);
      },
      child: async.when(
        data: (entries) {
          if (entries.isEmpty) {
            return _EmptyScrollable(
              icon: Icons.emoji_events_outlined,
              title: week == LeaderboardWeek.thisWeek
                  ? 'No tests taken this week yet'
                  : 'No tests were taken last week',
              detail:
                  'Attempt a test from your course and come back here to see '
                  'where you stand.',
            );
          }

          final split = LeaderboardSplit.of(entries);
          final visible = split.top;
          final outside = split.pinned;

          return Column(
            children: [
              Expanded(
                child: ListView.separated(
                  // A short list does not scroll on its own, and without
                  // this the pull-to-refresh above it would never fire.
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding:
                      EdgeInsets.fromLTRB(16, 8, 16, outside == null ? 24 : 8),
                  itemCount: visible.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) =>
                      _LeaderboardRow(entry: visible[index]),
                ),
              ),
              if (outside != null)
                _PinnedSelfRow(entry: outside),
            ],
          );
        },
        loading: () => const _ListSkeleton(),
        error: (_, _) => _EmptyScrollable(
          icon: Icons.error_outline,
          title: 'Could not load the leaderboard',
          detail:
              'Pull down to try again, or come back when the connection is '
              'better.',
        ),
      ),
    );
  }
}

// =============================================================================
// Row
// =============================================================================

class _LeaderboardRow extends StatelessWidget {
  final LeaderboardEntry entry;

  const _LeaderboardRow({required this.entry});

  @override
  Widget build(BuildContext context) {
    final podium = _podiumColor(entry.rank);
    final highlight = entry.isMe;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: highlight ? AppColors.orange.withValues(alpha: 0.12) : AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: highlight ? AppColors.orange : AppColors.border,
          width: highlight ? 1.5 : 1,
        ),
      ),
      child: Row(
        children: [
          _RankBadge(rank: entry.rank, podium: podium),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        entry.displayName,
                        style: AppTypography.bodyLarge.copyWith(
                          fontWeight: FontWeight.w600,
                          color: highlight
                              ? AppColors.orange
                              : AppColors.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (highlight) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.orange,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text('you',
                            style: AppTypography.caption.copyWith(
                                color: AppColors.white,
                                fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${entry.testsTaken} '
                  '${entry.testsTaken == 1 ? 'test' : 'tests'}',
                  style: AppTypography.caption,
                ),
              ],
            ),
          ),
          Text(
            _formatScore(entry.totalScore),
            style: AppTypography.bodyLarge.copyWith(
              fontWeight: FontWeight.w700,
              color: highlight ? AppColors.orange : AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }

  static Color? _podiumColor(int rank) {
    switch (rank) {
      case 1:
        return AppColors.golden;
      case 2:
        return const Color(0xFFC0C6D1); // silver
      case 3:
        return const Color(0xFFCE8946); // bronze
      default:
        return null;
    }
  }

  static String _formatScore(double v) {
    if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(1);
  }
}

class _RankBadge extends StatelessWidget {
  final int rank;
  final Color? podium;

  const _RankBadge({required this.rank, required this.podium});

  @override
  Widget build(BuildContext context) {
    if (podium != null) {
      return Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: podium!.withValues(alpha: 0.18),
          shape: BoxShape.circle,
          border: Border.all(color: podium!, width: 1.4),
        ),
        alignment: Alignment.center,
        child: Icon(Icons.emoji_events_rounded, size: 18, color: podium),
      );
    }
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.border),
      ),
      alignment: Alignment.center,
      child: Text(
        '$rank',
        style: AppTypography.bodyMedium.copyWith(
          fontWeight: FontWeight.w700,
          color: AppColors.textSecondary,
        ),
      ),
    );
  }
}

// =============================================================================
// Pinned self row (shown below the list when the caller is outside the top).
// =============================================================================

class _PinnedSelfRow extends StatelessWidget {
  final LeaderboardEntry entry;

  const _PinnedSelfRow({required this.entry});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.background,
        border: Border(
          top: BorderSide(color: AppColors.border),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 6),
            child: Text(
              'Your position',
              style: AppTypography.caption,
            ),
          ),
          _LeaderboardRow(entry: entry),
        ],
      ),
    );
  }
}

// =============================================================================
// Loading / empty
// =============================================================================

class _ListSkeleton extends StatelessWidget {
  const _ListSkeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        children: [
          for (int i = 0; i < 8; i++) ...[
            const ShimmerBox(
              width: double.infinity,
              height: 64,
              borderRadius: 12,
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String detail;

  const _EmptyState({
    required this.icon,
    required this.title,
    required this.detail,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.surface,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.border),
              ),
              child: Icon(icon, size: 36, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 16),
            Text(title,
                textAlign: TextAlign.center,
                style: AppTypography.heading3),
            const SizedBox(height: 8),
            Text(
              detail,
              textAlign: TextAlign.center,
              style: AppTypography.bodyMedium
                  .copyWith(color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

/// Same look as `_EmptyState` but inside a scrollable so the RefreshIndicator
/// upstream can still pull-to-reload.
class _EmptyScrollable extends StatelessWidget {
  final IconData icon;
  final String title;
  final String detail;

  const _EmptyScrollable({
    required this.icon,
    required this.title,
    required this.detail,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: SizedBox(
          height: constraints.maxHeight,
          child: _EmptyState(icon: icon, title: title, detail: detail),
        ),
      ),
    );
  }
}
