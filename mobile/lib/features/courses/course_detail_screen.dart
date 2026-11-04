import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/course.dart';
import '../../core/models/subject.dart';
import '../../core/models/topic.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/content_provider.dart';
import '../../core/providers/course_provider.dart';
import '../../core/providers/enrollment_provider.dart';
import '../../core/services/enrollment_service.dart';
import '../../core/utils/extensions.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../../shared/widgets/shimmer_box.dart';

class CourseDetailScreen extends ConsumerWidget {
  final String courseId;

  const CourseDetailScreen({super.key, required this.courseId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final courseAsync = ref.watch(courseDetailProvider(courseId));
    final subjectsAsync = ref.watch(subjectsProvider(courseId));
    final isAuthenticated = ref.watch(isAuthenticatedProvider);

    return courseAsync.when(
      data: (course) => Scaffold(
        backgroundColor: AppColors.background,
        body: CustomScrollView(
          slivers: [
            SliverAppBar(
              expandedHeight: 200,
              pinned: true,
              backgroundColor: AppColors.darkBlue,
              leading: IconButton(
                icon: const Icon(Icons.arrow_back, color: AppColors.white),
                onPressed: () => context.pop(),
              ),
              flexibleSpace: FlexibleSpaceBar(
                background: course.thumbnailUrl != null
                    ? CachedNetworkImage(
                        imageUrl: course.thumbnailUrl!,
                        fit: BoxFit.cover,
                        placeholder: (_, _) => _headerPlaceholder(),
                        errorWidget: (_, _, _) => _headerPlaceholder(),
                      )
                    : _headerPlaceholder(),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.orange.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'Class ${course.targetClass}',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.orange,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        if (course.isFeatured) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.golden.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'Featured',
                              style: AppTypography.caption.copyWith(
                                color: AppColors.golden,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(course.title, style: AppTypography.heading2),
                    if (course.subtitle != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        course.subtitle!,
                        style: AppTypography.bodyMedium
                            .copyWith(color: AppColors.textSecondary),
                      ),
                    ],
                    const SizedBox(height: 16),
                    _buildStatsRow(course),
                    const SizedBox(height: 20),
                    _buildPriceSection(course),
                    const SizedBox(height: 20),
                    _EnrollButton(
                      courseId: courseId,
                      isAuthenticated: isAuthenticated,
                      courseName: course.title,
                      price: course.price,
                      thumbnailUrl: course.thumbnailUrl,
                    ),
                    if (course.description != null &&
                        course.description!.isNotEmpty) ...[
                      const SizedBox(height: 24),
                      Text('About this course', style: AppTypography.heading3),
                      const SizedBox(height: 8),
                      Text(
                        course.description!,
                        style: AppTypography.bodyMedium
                            .copyWith(color: AppColors.textSecondary, height: 1.6),
                      ),
                    ],
                    const SizedBox(height: 24),
                    Text('Syllabus', style: AppTypography.heading3),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),
            subjectsAsync.when(
              data: (subjects) {
                if (subjects.isEmpty) {
                  return SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Text(
                        'Syllabus will be updated soon',
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
                      (context, index) =>
                          _SubjectTile(subject: subjects[index], ref: ref),
                      childCount: subjects.length,
                    ),
                  ),
                );
              },
              loading: () => SliverToBoxAdapter(
                child: ShimmerList(itemCount: 3, itemHeight: 60),
              ),
              error: (_, _) => SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text(
                    'Could not load syllabus',
                    style: AppTypography.bodyMedium
                        .copyWith(color: AppColors.error),
                  ),
                ),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 32)),
          ],
        ),
      ),
      loading: () => Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.pop(),
          ),
        ),
        body: const Center(
          child: CircularProgressIndicator(color: AppColors.orange),
        ),
      ),
      error: (error, _) => Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.pop(),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Could not load course',
                style: AppTypography.bodyLarge
                    .copyWith(color: AppColors.error),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => ref.invalidate(courseDetailProvider(courseId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _headerPlaceholder() {
    return Container(
      color: AppColors.darkBlue,
      child: Center(
        child: Icon(
          Icons.play_circle_outline,
          size: 56,
          color: AppColors.white.withValues(alpha: 0.3),
        ),
      ),
    );
  }

  Widget _buildStatsRow(Course course) {
    return Row(
      children: [
        const Icon(Icons.people_outline, size: 18, color: AppColors.gray),
        const SizedBox(width: 4),
        Text('${course.enrollmentCount} students',
            style: AppTypography.caption),
        const SizedBox(width: 16),
        const Icon(Icons.play_lesson_outlined, size: 18, color: AppColors.gray),
        const SizedBox(width: 4),
        Text('${course.totalLessons} lessons', style: AppTypography.caption),
        const SizedBox(width: 16),
        const Icon(Icons.access_time, size: 18, color: AppColors.gray),
        const SizedBox(width: 4),
        Text(course.formattedDuration, style: AppTypography.caption),
      ],
    );
  }

  Widget _buildPriceSection(Course course) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (course.hasDiscount) ...[
          Text(
            course.formattedPrice,
            style: AppTypography.heading1.copyWith(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 8),
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              course.formattedOriginalPrice,
              style: AppTypography.bodyLarge.copyWith(
                decoration: TextDecoration.lineThrough,
                color: AppColors.gray,
              ),
            ),
          ),
        ] else
          Text(
            course.formattedPrice,
            style: AppTypography.heading1.copyWith(
              color: AppColors.textPrimary,
              fontWeight: FontWeight.w800,
            ),
          ),
      ],
    );
  }
}

class _EnrollButton extends ConsumerStatefulWidget {
  final String courseId;
  final bool isAuthenticated;
  final String courseName;
  final double price;
  final String? thumbnailUrl;

  const _EnrollButton({
    required this.courseId,
    required this.isAuthenticated,
    required this.courseName,
    required this.price,
    this.thumbnailUrl,
  });

  @override
  ConsumerState<_EnrollButton> createState() => _EnrollButtonState();
}

class _EnrollButtonState extends ConsumerState<_EnrollButton> {
  bool _working = false;

  /// Free enrolment is server-side; this surfaces the real reason when the
  /// endpoint is missing instead of failing silently.
  Future<void> _enroll() async {
    setState(() => _working = true);

    try {
      await ref.read(enrollmentServiceProvider).enrollInCourse(widget.courseId);
      ref.invalidate(myEnrollmentsProvider);
      ref.invalidate(courseEnrollmentProvider(widget.courseId));
      if (mounted) {
        context.showSnackBar('Successfully enrolled!');
      }
    } on MissingBackendEndpointException catch (e) {
      if (mounted) {
        context.showSnackBar(e.message, isError: true);
      }
    } catch (e) {
      if (mounted) {
        context.showSnackBar(
          'Could not enroll. Please try again.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  /// Opens the first playable lesson of the course, falling back to the
  /// lesson list of the first folder that has content.
  ///
  /// Folders nest, so a top-level folder may hold only subfolders. The search
  /// goes depth first in the order the lesson list shows things -- a folder's
  /// subfolders, then its own lessons -- which is also the order the website
  /// steps through with Next.
  Future<void> _continueLearning() async {
    setState(() => _working = true);

    try {
      final courseService = ref.read(courseServiceProvider);
      final contentService = ref.read(contentServiceProvider);

      Future<bool> openFirstIn(Topic folder) async {
        final subfolders = await courseService.getSubfolders(folder.id);
        for (final child in subfolders) {
          if (await openFirstIn(child)) return true;
        }

        final contents = await contentService.getContentsByTopic(folder.id);
        if (contents.isEmpty) return false;
        if (!mounted) return true;

        final playable = contents.where((c) => c.hasVideo).toList();
        if (playable.isNotEmpty) {
          context.push('/player/${playable.first.id}');
        } else {
          context.push('/lessons/${folder.id}', extra: folder.name);
        }
        return true;
      }

      final subjects = await courseService.getSubjects(widget.courseId);
      for (final subject in subjects) {
        final topics = await courseService.getTopics(subject.id);
        for (final topic in topics) {
          if (await openFirstIn(topic)) return;
        }
      }

      if (mounted) {
        context.showSnackBar('No lessons have been published yet.');
      }
    } catch (e) {
      if (mounted) {
        context.showSnackBar(
          'Could not open this course. Please try again.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Widget _spinner() {
    return const SizedBox(
      height: 20,
      width: 20,
      child: CircularProgressIndicator(
        strokeWidth: 2,
        valueColor: AlwaysStoppedAnimation<Color>(AppColors.white),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isAuthenticated) {
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: () => context.go('/login'),
          child: const Text('Login to Enroll'),
        ),
      );
    }

    final enrollmentAsync =
        ref.watch(courseEnrollmentProvider(widget.courseId));

    return enrollmentAsync.when(
      data: (enrollment) {
        if (enrollment != null) {
          return SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _working ? null : _continueLearning,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.success,
              ),
              child: _working ? _spinner() : const Text('Continue Learning'),
            ),
          );
        }

        if (widget.price > 0) {
          return SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                context.push('/checkout/${widget.courseId}');
              },
              child: Text('Buy Now — ₹${widget.price.toInt()}'),
            ),
          );
        }

        return SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _working ? null : _enroll,
            child:
                _working ? _spinner() : const Text('Enroll Now — Free'),
          ),
        );
      },
      loading: () => SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: null,
          child: _spinner(),
        ),
      ),
      error: (_, _) => SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: widget.price > 0
              ? () {
                  context.push('/checkout/${widget.courseId}');
                }
              : (_working ? null : _enroll),
          child: widget.price > 0
              ? Text('Buy Now — ₹${widget.price.toInt()}')
              : const Text('Enroll Now — Free'),
        ),
      ),
    );
  }
}

class _SubjectTile extends StatefulWidget {
  final Subject subject;
  final WidgetRef ref;

  const _SubjectTile({required this.subject, required this.ref});

  @override
  State<_SubjectTile> createState() => _SubjectTileState();
}

class _SubjectTileState extends State<_SubjectTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final topics = widget.ref.watch(topicsProvider(widget.subject.id));

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(10),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  Icon(
                    _expanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    color: AppColors.gray,
                    size: 22,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      widget.subject.name,
                      style: AppTypography.bodyMedium
                          .copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  // Counts every folder in the subject, at any depth -- which
                  // is what the embedded count returns, so the label says so.
                  Text(
                    '${widget.subject.topicCount} '
                    '${widget.subject.topicCount == 1 ? 'folder' : 'folders'}',
                    style: AppTypography.caption,
                  ),
                ],
              ),
            ),
          ),
          if (_expanded)
            topics.when(
              data: (list) => Column(
                children: list
                    .map(
                      (topic) => InkWell(
                        onTap: () => context.push(
                          '/lessons/${topic.id}',
                          extra: topic.name,
                        ),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(48, 0, 16, 12),
                          child: Row(
                            children: [
                              const Icon(Icons.folder_outlined,
                                  size: 16, color: AppColors.orange),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  topic.name,
                                  style: AppTypography.bodySmall
                                      .copyWith(color: AppColors.textPrimary),
                                ),
                              ),
                              const Icon(Icons.chevron_right_rounded,
                                  size: 18, color: AppColors.gray),
                            ],
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
              loading: () => const Padding(
                padding: EdgeInsets.all(16),
                child: SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.orange),
                ),
              ),
              error: (_, _) => Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  'Could not load folders',
                  style: AppTypography.caption.copyWith(color: AppColors.error),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
