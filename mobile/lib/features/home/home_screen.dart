import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/course_provider.dart';
import '../../core/providers/live_class_provider.dart';
import '../../core/providers/student_provider.dart';
import '../../core/providers/supabase_provider.dart';
import '../../core/providers/offline_provider.dart';
import '../downloads/widgets/offline_content_view.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../../shared/widgets/shimmer_box.dart';
import 'widgets/category_chips.dart';
import 'widgets/course_list_tile.dart';
import 'widgets/featured_courses_section.dart';
import 'widgets/greeting_header.dart';
import 'widgets/search_bar_widget.dart';
import 'widgets/today_classes_section.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // With nothing reachable there is no point drawing a screen whose every
    // section needs the network. The downloads are what the student can
    // actually use, so they are what is shown.
    if (!ref.watch(isOnlineProvider)) {
      return const OfflineContentView(insteadOf: 'Home');
    }

    final studentAsync = ref.watch(currentStudentProvider);
    final user = ref.watch(currentUserProvider);
    final displayName = studentAsync.whenOrNull(
          data: (student) => student?.fullName.split(' ').first,
        ) ??
        (user?.userMetadata?['full_name'] as String?)?.split(' ').first ??
        'there';
    final allCourses = ref.watch(allCoursesProvider);

    return SafeArea(
      child: RefreshIndicator(
          color: AppColors.orange,
          onRefresh: () async {
            ref.invalidate(featuredCoursesProvider);
            ref.invalidate(allCoursesProvider);
            ref.invalidate(categoriesProvider);
            ref.invalidate(todayClassesProvider);
          },
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: GreetingHeader(displayName: displayName),
              ),
              SliverToBoxAdapter(
                child: SearchBarWidget(
                  onTap: () {
                    final shell = context.findAncestorStateOfType<State>();
                    if (shell != null) {
                      DefaultTabController.of(context);
                    }
                  },
                ),
              ),
              const SliverToBoxAdapter(child: TodayClassesSection()),
              const SliverToBoxAdapter(child: CategoryChips()),
              const SliverToBoxAdapter(child: SizedBox(height: 24)),
              const SliverToBoxAdapter(child: FeaturedCoursesSection()),
              const SliverToBoxAdapter(child: SizedBox(height: 28)),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Continue Learning', style: AppTypography.heading3),
                    ],
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 12)),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      children: [
                        Icon(
                          Icons.school_outlined,
                          size: 48,
                          color: AppColors.gray.withValues(alpha: 0.5),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'No courses yet',
                          style: AppTypography.bodyMedium
                              .copyWith(color: AppColors.textSecondary),
                        ),
                        const SizedBox(height: 12),
                        TextButton(
                          onPressed: () {},
                          child: const Text('Browse Courses'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 28)),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text('Popular Courses', style: AppTypography.heading3),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 12)),
              allCourses.when(
                data: (courses) {
                  if (courses.isEmpty) {
                    return SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Text(
                          'No courses available yet',
                          style: AppTypography.bodyMedium
                              .copyWith(color: AppColors.textSecondary),
                        ),
                      ),
                    );
                  }
                  return SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, index) => CourseListTile(
                          course: courses[index],
                          onTap: () =>
                              context.push('/course/${courses[index].id}'),
                        ),
                        childCount: courses.length,
                      ),
                    ),
                  );
                },
                loading: () => SliverToBoxAdapter(
                  child: ShimmerList(itemCount: 3, itemHeight: 100),
                ),
                error: (error, _) => SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      children: [
                        Text(
                          'Could not load courses',
                          style: AppTypography.bodyMedium
                              .copyWith(color: AppColors.error),
                        ),
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: () => ref.invalidate(allCoursesProvider),
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 24)),
            ],
          ),
        ),
      );
  }
}
