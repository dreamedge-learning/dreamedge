import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers/attachments_provider.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';
import '../../reader/pdf_reader_screen.dart';

/// The notes, worksheets and diagrams attached to a video lesson.
///
/// Renders nothing while the list loads, when there is none, and when it
/// cannot be fetched: under a video, a missing worksheet list is not worth an
/// error the student has to read past to reach the next lesson.
class LessonAttachmentsSection extends ConsumerWidget {
  final String contentId;

  const LessonAttachmentsSection({super.key, required this.contentId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final files = [
      for (final file in ref.watch(lessonAttachmentsProvider(contentId)).valueOrNull ??
          const <LessonAttachment>[])
        // The route's unnamed default is the lesson's document when it has no
        // listed files; a video lesson has none of its own to show.
        if (file.fileId != null) file,
    ];
    if (files.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            files.length == 1 ? 'Attachment' : 'Attachments (${files.length})',
            style: AppTypography.bodyLarge.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 10),
          DecoratedBox(
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: [
                for (var index = 0; index < files.length; index++) ...[
                  if (index > 0)
                    const Divider(height: 1, color: AppColors.border),
                  _AttachmentTile(
                    file: files[index],
                    onTap: () => context.push(
                      routeForAttachment(contentId, files[index].fileId!),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AttachmentTile extends StatelessWidget {
  final LessonAttachment file;
  final VoidCallback onTap;

  const _AttachmentTile({required this.file, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      dense: true,
      leading: Icon(attachmentIcon(file.kind), color: AppColors.orange),
      title: Text(
        file.name,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: AppTypography.bodyMedium,
      ),
      subtitle: file.isLocal
          ? Text(
              'Saved on this phone',
              style: AppTypography.caption.copyWith(color: AppColors.success),
            )
          : null,
      trailing: const Icon(
        Icons.chevron_right_rounded,
        color: AppColors.gray,
      ),
    );
  }
}
