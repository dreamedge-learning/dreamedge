import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/live_class_provider.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';
import '../../shared/widgets/shimmer_box.dart';
import 'widgets/live_class_card.dart';

class LiveScheduleScreen extends ConsumerWidget {
  const LiveScheduleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: Text('Live Classes', style: AppTypography.heading3),
          backgroundColor: AppColors.background,
          foregroundColor: AppColors.textPrimary,
          elevation: 0,
          bottom: TabBar(
            labelColor: AppColors.orange,
            unselectedLabelColor: AppColors.textSecondary,
            indicatorColor: AppColors.orange,
            indicatorWeight: 3,
            labelStyle: AppTypography.bodyMedium
                .copyWith(fontWeight: FontWeight.w600),
            unselectedLabelStyle: AppTypography.bodyMedium,
            tabs: const [
              Tab(text: 'Upcoming'),
              Tab(text: 'Past'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _UpcomingTab(),
            _PastTab(),
          ],
        ),
      ),
    );
  }
}

class _UpcomingTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final upcoming = ref.watch(upcomingClassesProvider);

    return RefreshIndicator(
      color: AppColors.orange,
      onRefresh: () async {
        ref.invalidate(upcomingClassesProvider);
      },
      child: upcoming.when(
        data: (classes) {
          if (classes.isEmpty) {
            return ListView(
              children: [
                const SizedBox(height: 80),
                Center(
                  child: Column(
                    children: [
                      Icon(Icons.event_outlined,
                          size: 64,
                          color: AppColors.gray.withValues(alpha: 0.4)),
                      const SizedBox(height: 16),
                      Text(
                        'No upcoming classes',
                        style: AppTypography.bodyLarge
                            .copyWith(color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Check back later for new sessions',
                        style: AppTypography.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(20),
            itemCount: classes.length,
            itemBuilder: (context, index) =>
                LiveClassCard(liveClass: classes[index]),
          );
        },
        loading: () => Padding(
          padding: const EdgeInsets.all(20),
          child: ShimmerList(itemCount: 4, itemHeight: 180),
        ),
        error: (error, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'Could not load classes',
                style: AppTypography.bodyMedium
                    .copyWith(color: AppColors.error),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(upcomingClassesProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PastTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final past = ref.watch(pastClassesProvider);

    return RefreshIndicator(
      color: AppColors.orange,
      onRefresh: () async {
        ref.invalidate(pastClassesProvider);
      },
      child: past.when(
        data: (classes) {
          if (classes.isEmpty) {
            return ListView(
              children: [
                const SizedBox(height: 80),
                Center(
                  child: Column(
                    children: [
                      Icon(Icons.history_outlined,
                          size: 64,
                          color: AppColors.gray.withValues(alpha: 0.4)),
                      const SizedBox(height: 16),
                      Text(
                        'No past classes yet',
                        style: AppTypography.bodyLarge
                            .copyWith(color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(20),
            itemCount: classes.length,
            itemBuilder: (context, index) =>
                LiveClassCard(liveClass: classes[index]),
          );
        },
        loading: () => Padding(
          padding: const EdgeInsets.all(20),
          child: ShimmerList(itemCount: 4, itemHeight: 180),
        ),
        error: (error, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'Could not load classes',
                style: AppTypography.bodyMedium
                    .copyWith(color: AppColors.error),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(pastClassesProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
