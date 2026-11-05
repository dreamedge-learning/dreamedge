import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pdfrx/pdfrx.dart';

import '../../core/models/content.dart';
import '../../core/models/lesson_file.dart';
import '../../core/providers/attachments_provider.dart';
import '../../core/providers/content_provider.dart';
import '../../core/providers/document_provider.dart';
import '../../core/services/document_service.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';

/// Reads a lesson's files: PDFs, notes, past papers, and the images attached
/// beside them.
///
/// A lesson can carry several files. When it does, they sit in a row of chips
/// under the title and the student moves between them without leaving the
/// screen; a lesson with one file looks exactly as the reader always did.
///
/// A downloaded copy is preferred over the network every time. It is already
/// paid for and already on the phone, so fetching it again would spend the
/// student's data for nothing.
class PdfReaderScreen extends ConsumerStatefulWidget {
  final String contentId;

  /// Which attachment to open first, when the student picked one from a
  /// list. The first of them otherwise.
  final String? initialFileId;

  const PdfReaderScreen({
    super.key,
    required this.contentId,
    this.initialFileId,
  });

  @override
  ConsumerState<PdfReaderScreen> createState() => _PdfReaderScreenState();
}

class _PdfReaderScreenState extends ConsumerState<PdfReaderScreen> {
  /// The attachment on screen, by [LessonAttachment.key].
  String? _selectedKey;

  /// One open per attachment, kept so moving back to a file already opened
  /// does not ask the server for it again.
  final Map<String, Future<_ReaderSource>> _sources = {};

  int _page = 1;
  int _pageCount = 0;

  // No PdfViewerController is held, deliberately. In pdfrx 2.x it is a
  // `ValueListenable<Matrix4>` with nothing to dispose, and the page number
  // arrives through the viewer's callbacks; each file gets a fresh viewer
  // keyed on the file, so one document's state never leaks into the next.

  /// When each remote file's address was signed. The route signs for ten
  /// minutes, so going back to a file opened longer ago than [_signedFor]
  /// fetches a fresh address rather than handing a new viewer a dead one.
  ///
  /// Checked only when the student switches files. Checking on every build
  /// would swap the address under a document being read -- every page turn
  /// rebuilds -- and throw the student back to page one.
  final Map<String, DateTime> _signedAt = {};
  static const Duration _signedFor = Duration(minutes: 8);

  Future<_ReaderSource> _open(LessonAttachment file) {
    return _sources.putIfAbsent(file.key, () async {
      final path = file.localPath;
      if (path != null) return _ReaderSource.local(path);

      final document = await ref
          .read(documentServiceProvider)
          .getSource(widget.contentId, fileId: file.fileId);
      _signedAt[file.key] = DateTime.now();
      return _ReaderSource.remote(document.url);
    });
  }

  void _retry(LessonAttachment? file) {
    setState(() {
      if (file != null) {
        _sources.remove(file.key);
        _signedAt.remove(file.key);
      }
    });
    if (file == null) {
      ref.invalidate(lessonAttachmentsProvider(widget.contentId));
    }
  }

  void _select(LessonAttachment file) {
    if (file.key == _selectedKey) return;

    final signed = _signedAt[file.key];
    if (signed != null && DateTime.now().difference(signed) > _signedFor) {
      _sources.remove(file.key);
      _signedAt.remove(file.key);
    }

    setState(() {
      _selectedKey = file.key;
      _page = 1;
      _pageCount = 0;
    });
  }

  LessonAttachment _current(List<LessonAttachment> files) {
    final wanted = _selectedKey ?? widget.initialFileId;
    for (final file in files) {
      if (file.key == wanted || file.fileId == wanted) return file;
    }
    return files.first;
  }

  @override
  Widget build(BuildContext context) {
    final contentAsync = ref.watch(contentDetailProvider(widget.contentId));
    final filesAsync = ref.watch(lessonAttachmentsProvider(widget.contentId));

    final files = filesAsync.valueOrNull ?? const <LessonAttachment>[];
    final current = files.isEmpty ? null : _current(files);
    final showsPages = current?.kind == LessonFileKind.pdf && _pageCount > 0;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => context.pop(),
        ),
        title: Text(
          contentAsync.valueOrNull?.title ?? 'Reading',
          style: AppTypography.bodyLarge.copyWith(fontWeight: FontWeight.w600),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        centerTitle: false,
        actions: [
          if (showsPages)
            Padding(
              padding: const EdgeInsets.only(right: 14),
              child: Center(
                child: Text(
                  '$_page / $_pageCount',
                  style: AppTypography.caption,
                ),
              ),
            ),
        ],
        bottom: files.length > 1 && current != null
            ? _FileChips(
                files: files,
                selected: current,
                onSelected: _select,
              )
            : null,
      ),
      body: filesAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.orange),
        ),
        error: (error, _) => _ReaderError(
          message: error is DocumentException
              ? error.message
              : 'Could not open this lesson.',
          onRetry: () => _retry(null),
        ),
        data: (_) {
          if (current == null) {
            return const _ReaderError(
              message: 'This lesson has no file attached.',
            );
          }
          return _buildFile(current);
        },
      ),
    );
  }

  Widget _buildFile(LessonAttachment file) {
    return FutureBuilder<_ReaderSource>(
      key: ValueKey('source-${file.key}'),
      future: _open(file),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(
            child: CircularProgressIndicator(color: AppColors.orange),
          );
        }

        final error = snapshot.error;
        if (error != null) {
          return _ReaderError(
            message: error is DocumentException
                ? error.message
                : 'Could not open this file.',
            // A paywall or a missing file is not worth a retry button; a
            // connection that dropped is.
            onRetry: error is DocumentException &&
                    (error.failure == DocumentFailure.notEntitled ||
                        error.failure == DocumentFailure.missing)
                ? null
                : () => _retry(file),
          );
        }

        final source = snapshot.requireData;
        return file.kind == LessonFileKind.image
            ? _ImageView(
                key: ValueKey('image-${file.key}'),
                source: source,
                onRetry: () => _retry(file),
              )
            : _buildPdf(file, source);
      },
    );
  }

  Widget _buildPdf(LessonAttachment file, _ReaderSource source) {
    final params = PdfViewerParams(
      backgroundColor: AppColors.surface,
      onPageChanged: (page) {
        if (page == null) return;
        setState(() => _page = page);
      },
      onDocumentChanged: (document) {
        setState(() => _pageCount = document?.pages.length ?? 0);
      },
      loadingBannerBuilder: (context, bytes, total) => const Center(
        child: CircularProgressIndicator(color: AppColors.orange),
      ),
      errorBannerBuilder: (context, error, stack, documentRef) => _ReaderError(
        message: 'Could not open this file.',
        onRetry: () => _retry(file),
      ),
    );

    final key = ValueKey('pdf-${file.key}-${source.location.hashCode}');

    if (source.isLocal) {
      return PdfViewer.file(source.location, key: key, params: params);
    }

    return PdfViewer.uri(
      Uri.parse(source.location),
      key: key,
      params: params,
      // A past paper can be tens of megabytes. Range access fetches the pages
      // being read rather than the whole file before showing anything.
      preferRangeAccess: true,
    );
  }
}

class _ReaderSource {
  final String location;
  final bool isLocal;

  const _ReaderSource.local(this.location) : isLocal = true;
  const _ReaderSource.remote(this.location) : isLocal = false;
}

/// The lesson's files as a scrolling row of chips under the title.
class _FileChips extends StatelessWidget implements PreferredSizeWidget {
  final List<LessonAttachment> files;
  final LessonAttachment selected;
  final ValueChanged<LessonAttachment> onSelected;

  const _FileChips({
    required this.files,
    required this.selected,
    required this.onSelected,
  });

  @override
  Size get preferredSize => const Size.fromHeight(52);

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: preferredSize.height,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
        itemCount: files.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final file = files[index];
          final isSelected = file.key == selected.key;
          return ChoiceChip(
            selected: isSelected,
            onSelected: (_) => onSelected(file),
            showCheckmark: false,
            avatar: Icon(
              attachmentIcon(file.kind),
              size: 16,
              color: isSelected ? AppColors.white : AppColors.gray,
            ),
            label: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 180),
              child: Text(
                file.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            labelStyle: AppTypography.caption.copyWith(
              color: isSelected ? AppColors.white : AppColors.textPrimary,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
            ),
            selectedColor: AppColors.orange,
            backgroundColor: AppColors.surfaceElevated,
            side: BorderSide(
              color: isSelected ? AppColors.orange : AppColors.border,
            ),
          );
        },
      ),
    );
  }
}

/// An attached image, full screen, with pinch to zoom.
class _ImageView extends StatelessWidget {
  final _ReaderSource source;
  final VoidCallback onRetry;

  const _ImageView({super.key, required this.source, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    Widget error(BuildContext context, Object error, StackTrace? stack) =>
        _ReaderError(message: 'Could not open this image.', onRetry: onRetry);

    final image = source.isLocal
        ? Image.file(
            File(source.location),
            fit: BoxFit.contain,
            errorBuilder: error,
          )
        : Image.network(
            source.location,
            fit: BoxFit.contain,
            errorBuilder: error,
            loadingBuilder: (context, child, progress) {
              if (progress == null) return child;
              final total = progress.expectedTotalBytes;
              return Center(
                child: CircularProgressIndicator(
                  color: AppColors.orange,
                  value: total == null || total == 0
                      ? null
                      : progress.cumulativeBytesLoaded / total,
                ),
              );
            },
          );

    return InteractiveViewer(
      minScale: 1,
      maxScale: 6,
      child: SizedBox.expand(child: image),
    );
  }
}

class _ReaderError extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;

  const _ReaderError({required this.message, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.description_outlined,
                size: 48, color: AppColors.gray),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: AppTypography.bodyMedium,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.orange,
                ),
                onPressed: onRetry,
                child: const Text('Try again'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The icon for an attachment of [kind], shared with the lesson screens.
IconData attachmentIcon(LessonFileKind kind) {
  switch (kind) {
    case LessonFileKind.pdf:
      return Icons.picture_as_pdf_outlined;
    case LessonFileKind.image:
      return Icons.image_outlined;
    case LessonFileKind.other:
      return Icons.insert_drive_file_outlined;
  }
}

/// Where a lesson tap should go, now that the app can open both kinds.
///
/// Lives here rather than in the lessons screen because the player and the
/// reader are the two destinations and this is the file that knows what a
/// readable item is.
String routeForContent(Content content) {
  if (content.isVideo) return '/player/${content.id}';
  return '/reader/${content.id}';
}

/// The reader opened on one particular attachment of a lesson.
String routeForAttachment(String contentId, String fileId) =>
    '/reader/$contentId?file=${Uri.encodeQueryComponent(fileId)}';
