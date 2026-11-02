import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/course_provider.dart';
import '../../core/providers/offline_provider.dart';
import '../downloads/widgets/offline_content_view.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../../shared/widgets/shimmer_box.dart';
import '../home/widgets/course_list_tile.dart';
import 'widgets/course_filters.dart';

class CoursesScreen extends ConsumerStatefulWidget {
  const CoursesScreen({super.key});

  @override
  ConsumerState<CoursesScreen> createState() => _CoursesScreenState();
}

class _CoursesScreenState extends ConsumerState<CoursesScreen> {
  final _searchController = TextEditingController();
  Timer? _debounce;
  String? _selectedCategory;
  String? _selectedClass;
  String _searchQuery = '';

  CourseFilter get _filter => CourseFilter(
        categoryId: _selectedCategory,
        targetClass: _selectedClass,
        searchQuery: _searchQuery.isEmpty ? null : _searchQuery,
      );

  @override
  void dispose() {
    _searchController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      setState(() => _searchQuery = value.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    // With nothing reachable there is no point drawing a screen whose every
    // section needs the network. The downloads are what the student can
    // actually use, so they are what is shown.
    if (ref.watch(isOfflineProvider)) {
      return const OfflineContentView(insteadOf: 'Browsing courses');
    }

    final courses = ref.watch(coursesProvider(_filter));

    return Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: TextField(
              controller: _searchController,
              onChanged: _onSearchChanged,
              decoration: InputDecoration(
                hintText: 'Search courses...',
                prefixIcon:
                    const Icon(Icons.search, color: AppColors.gray, size: 22),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 20),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _searchQuery = '');
                        },
                      )
                    : null,
              ),
            ),
          ),
          const SizedBox(height: 12),
          CourseFilters(
            selectedClass: _selectedClass,
            selectedCategory: _selectedCategory,
            onClassChanged: (val) =>
                setState(() => _selectedClass = val),
            onCategoryChanged: (val) =>
                setState(() => _selectedCategory = val),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.orange,
              onRefresh: () async {
                ref.invalidate(coursesProvider(_filter));
              },
              child: courses.when(
                data: (list) {
                  if (list.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.search_off_rounded,
                            size: 64,
                            color: AppColors.gray.withValues(alpha: 0.4),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'No courses found',
                            style: AppTypography.bodyLarge
                                .copyWith(color: AppColors.textSecondary),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Try adjusting your filters',
                            style: AppTypography.bodySmall,
                          ),
                        ],
                      ),
                    );
                  }
                  return ListView.builder(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 8),
                    itemCount: list.length,
                    itemBuilder: (context, index) => CourseListTile(
                      course: list[index],
                      onTap: () =>
                          context.push('/course/${list[index].id}'),
                    ),
                  );
                },
                loading: () => const ShimmerList(itemCount: 5, itemHeight: 100),
                error: (error, _) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Could not load courses',
                        style: AppTypography.bodyMedium
                            .copyWith(color: AppColors.error),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () =>
                            ref.invalidate(coursesProvider(_filter)),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      );
  }
}
