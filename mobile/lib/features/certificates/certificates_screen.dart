import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shimmer/shimmer.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_config.dart';
import '../../core/models/certificate.dart';
import '../../core/providers/certificate_provider.dart';
import '../../shared/theme/colors.dart';

/// The student's course certificates.
///
/// An issued certificate opens on the website rather than in the app: the
/// certificate page is public, is what the student shares anyway, and is laid
/// out for printing and "Save as PDF", which a phone's browser already does
/// well and an in-app renderer would only imitate.
class CertificatesScreen extends ConsumerWidget {
  const CertificatesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final certificatesAsync = ref.watch(certificatesProvider);

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: Text(
          'My Certificates',
          style: GoogleFonts.playfairDisplay(
            fontWeight: FontWeight.w700,
            fontSize: 20,
            color: AppColors.textPrimary,
          ),
        ),
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      body: certificatesAsync.when(
        loading: () => const _LoadingList(),
        error: (error, _) => _ErrorState(
          onRetry: () => ref.invalidate(certificatesProvider),
        ),
        data: (certificates) {
          if (certificates.isEmpty) return const _EmptyState();

          return RefreshIndicator(
            color: AppColors.orange,
            onRefresh: () => ref.refresh(certificatesProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: certificates.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, index) =>
                  _CertificateTile(certificate: certificates[index]),
            ),
          );
        },
      ),
    );
  }
}

class _CertificateTile extends StatelessWidget {
  final Certificate certificate;

  const _CertificateTile({required this.certificate});

  Future<void> _open(BuildContext context) async {
    final uri = certificate.pageUri(AppConfig.apiBaseUrl);
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the certificate')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final issued = certificate.isIssued;
    final color = _statusColor(certificate.status);

    return Material(
      color: AppColors.surfaceElevated,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: issued ? () => _open(context) : null,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: issued
                  ? AppColors.golden.withValues(alpha: 0.45)
                  : AppColors.border,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(_statusIcon(certificate.status),
                        color: color, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          certificate.courseTitle,
                          style: GoogleFonts.inter(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          _subtitle(certificate),
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      certificate.status.label,
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: color,
                      ),
                    ),
                  ),
                ],
              ),
              if (certificate.status == CertificateStatus.rejected &&
                  (certificate.rejectedReason ?? '').isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Text(
                    certificate.rejectedReason!,
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
              ],
              if (issued) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => _open(context),
                    icon: const Icon(Icons.open_in_new_rounded, size: 18),
                    label: const Text('View, print or share'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.orange,
                      side: const BorderSide(color: AppColors.orange),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static String _subtitle(Certificate certificate) {
    switch (certificate.status) {
      case CertificateStatus.issued:
        final number = certificate.certificateNumber;
        return number == null
            ? 'Issued ${certificate.displayDate}'
            : '$number  •  ${certificate.displayDate}';
      case CertificateStatus.pending:
        return 'Course completed ${certificate.displayDate}. '
            'Waiting for the centre to approve it.';
      case CertificateStatus.rejected:
        return 'The centre did not approve this certificate:';
      case CertificateStatus.revoked:
        return 'Withdrawn ${certificate.displayDate}. '
            'Contact the centre if this is a mistake.';
    }
  }

  static Color _statusColor(CertificateStatus status) {
    switch (status) {
      case CertificateStatus.issued:
        return AppColors.golden;
      case CertificateStatus.pending:
        return AppColors.warning;
      case CertificateStatus.rejected:
        return AppColors.error;
      case CertificateStatus.revoked:
        return AppColors.textSecondary;
    }
  }

  static IconData _statusIcon(CertificateStatus status) {
    switch (status) {
      case CertificateStatus.issued:
        return Icons.workspace_premium_rounded;
      case CertificateStatus.pending:
        return Icons.schedule_rounded;
      case CertificateStatus.rejected:
        return Icons.cancel_rounded;
      case CertificateStatus.revoked:
        return Icons.block_rounded;
    }
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.workspace_premium_outlined,
                size: 64,
                color: AppColors.textSecondary.withValues(alpha: 0.4)),
            const SizedBox(height: 16),
            Text(
              'No certificates yet',
              style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Finish every lesson in a course and its certificate is '
              'requested for you automatically.',
              textAlign: TextAlign.center,
              style:
                  GoogleFonts.inter(fontSize: 14, color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final VoidCallback onRetry;

  const _ErrorState({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded,
                size: 48, color: AppColors.error),
            const SizedBox(height: 16),
            Text(
              'Failed to load your certificates',
              style: GoogleFonts.inter(fontSize: 16, color: AppColors.textPrimary),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: onRetry,
              child: Text(
                'Retry',
                style: GoogleFonts.inter(
                    color: AppColors.orange, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadingList extends StatelessWidget {
  const _LoadingList();

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: AppColors.surfaceElevated,
      highlightColor: AppColors.border,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: 4,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, _) => Container(
          height: 80,
          decoration: BoxDecoration(
            color: AppColors.surfaceElevated,
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}
