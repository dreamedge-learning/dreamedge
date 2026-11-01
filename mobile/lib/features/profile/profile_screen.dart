import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/constants.dart';
import '../../core/offline/byte_format.dart';
import '../../core/offline/download_settings.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/offline_provider.dart';
import '../../core/providers/supabase_provider.dart';
import '../../core/utils/extensions.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final fullName =
        user?.userMetadata?['full_name'] as String? ?? 'Student';
    final email = user?.email ?? '';
    final initials = fullName.initials;

    return ListView(
        children: [
          const SizedBox(height: 24),
          Center(
            child: CircleAvatar(
              radius: 44,
              backgroundColor: AppColors.orange.withValues(alpha: 0.12),
              child: Text(
                initials,
                style: AppTypography.heading2.copyWith(color: AppColors.orange),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text(fullName, style: AppTypography.heading3),
          ),
          const SizedBox(height: 4),
          Center(
            child: Text(
              email,
              style:
                  AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
            ),
          ),
          const SizedBox(height: 32),
          const Divider(height: 1),
          const _DownloadsSection(),
          const Divider(height: 1),
          _MenuItem(
            icon: Icons.person_outline,
            title: 'Edit Profile',
            onTap: () {},
          ),
          _MenuItem(
            icon: Icons.receipt_long_outlined,
            title: 'Payment History',
            onTap: () => context.push('/payment-history'),
          ),
          _MenuItem(
            icon: Icons.emoji_events_outlined,
            title: 'My Certificates',
            onTap: () {},
          ),
          _MenuItem(
            icon: Icons.help_outline,
            title: 'Help & Support',
            onTap: () async {
              final uri = Uri(
                scheme: 'mailto',
                path: AppConstants.supportEmail,
                queryParameters: {'subject': 'Support Request - Dream Edge App'},
              );
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri);
              }
            },
          ),
          _MenuItem(
            icon: Icons.info_outline,
            title: 'About',
            subtitle: 'Version 1.0.0',
            onTap: () {},
          ),
          const Divider(height: 1),
          _MenuItem(
            icon: Icons.logout,
            title: 'Logout',
            titleColor: AppColors.error,
            onTap: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Logout'),
                  content: const Text('Are you sure you want to logout?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text('Cancel'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Logout'),
                    ),
                  ],
                ),
              );
              if (confirmed == true) {
                // The cache and the downloads belong to this account. Leaving
                // them for whoever signs in next would show one student
                // another student's lessons.
                await ref.read(offlineStoreProvider).clearAll();
                await ref.read(authServiceProvider).logout();
              }
            },
          ),
          const SizedBox(height: 32),
        ],
      );
  }
}

/// Download preferences, and what they currently cost in storage.
///
/// Both settings exist for the same reason: mobile data in Kalmeshwar is
/// bought by the gigabyte, and a 700 MB lesson that helps itself to a data
/// pack is a complaint rather than a feature. Wi-Fi-only is therefore on
/// until the student turns it off.
class _DownloadsSection extends ConsumerWidget {
  const _DownloadsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(downloadSettingsProvider);
    final used = ref.watch(downloadedBytesProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 4),
          child: Text(
            'DOWNLOADS',
            style: AppTypography.caption.copyWith(
              color: AppColors.gray,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
            ),
          ),
        ),
        SwitchListTile(
          value: settings.wifiOnly,
          onChanged: settings.setWifiOnly,
          activeTrackColor: AppColors.orange,
          title: Text('Download over Wi-Fi only', style: AppTypography.bodyMedium),
          subtitle: Text(
            'Downloads pause when Wi-Fi drops and carry on when it returns.',
            style: AppTypography.caption,
          ),
        ),
        ListTile(
          leading: const Icon(Icons.high_quality_outlined,
              color: AppColors.textSecondary),
          title: Text('Video quality', style: AppTypography.bodyMedium),
          subtitle: Text(settings.quality.label, style: AppTypography.caption),
          trailing: const Icon(Icons.chevron_right, color: AppColors.gray),
          onTap: () => _pickQuality(context, settings),
        ),
        ListTile(
          leading: const Icon(Icons.sd_storage_outlined,
              color: AppColors.textSecondary),
          title: Text('Storage used', style: AppTypography.bodyMedium),
          subtitle: Text(
            '${formatBytes(used)} of saved lessons',
            style: AppTypography.caption,
          ),
        ),
      ],
    );
  }

  Future<void> _pickQuality(
    BuildContext context,
    DownloadSettings settings,
  ) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 4),
              child: Text('Download quality', style: AppTypography.heading3),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
              child: Text(
                'Applies to new downloads. On mobile data the highest setting '
                'is capped at 480p.',
                style: AppTypography.bodySmall,
              ),
            ),
            for (final quality in DownloadQuality.values)
              ListTile(
                dense: true,
                title: Text(quality.label, style: AppTypography.bodyMedium),
                trailing: quality == settings.quality
                    ? const Icon(Icons.check_rounded,
                        color: AppColors.orange, size: 20)
                    : null,
                onTap: () {
                  settings.setQuality(quality);
                  Navigator.of(sheetContext).pop();
                },
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Color? titleColor;
  final VoidCallback onTap;

  const _MenuItem({
    required this.icon,
    required this.title,
    this.subtitle,
    this.titleColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: titleColor ?? AppColors.textSecondary),
      title: Text(
        title,
        style: AppTypography.bodyLarge.copyWith(color: titleColor),
      ),
      subtitle: subtitle != null
          ? Text(subtitle!, style: AppTypography.caption)
          : null,
      trailing: titleColor == null
          ? const Icon(Icons.chevron_right, color: AppColors.gray)
          : null,
      onTap: onTap,
    );
  }
}
