import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pdfrx/pdfrx.dart';

import '../../core/models/content.dart';
import '../../core/offline/local_library.dart';
import '../../core/providers/content_provider.dart';
import '../../core/providers/document_provider.dart';
import '../../core/services/document_service.dart';
import '../../shared/theme/colors.dart';
import '../../shared/theme/typography.dart';

/// Reads a PDF, note, past paper or ebook.
///
/// The app had no reader at all, which was the gap offline mode could not
/// have: half of what is downloadable is booklets and past papers, and a
/// download nothing can open is not a feature.
///
/// A downloaded copy is preferred over the network every time. It is already
/// paid for and already on the phone, so fetching it again would spend the
/// student's data for nothing.
class PdfReaderScreen extends ConsumerStatefulWidget {
  final String contentId;

  const PdfReaderScreen({super.key, required this.contentId});

  @override
  ConsumerState<PdfReaderScreen> createState() => _PdfReaderScreenState();
}

class _PdfReaderScreenState extends ConsumerState<PdfReaderScreen> {
  final PdfViewerController _viewer = PdfViewerController();

  Future<_ReaderSource>? _source;
  int _page = 1;
  int _pageCount = 0;

  @override
  void initState() {
    super.initState();
    _source = _resolve();
  }

  // No dispose() for _viewer, deliberately. In pdfrx 2.x PdfViewerController
  // is a `ValueListenable<Matrix4>`, not a ChangeNotifier, and has no dispose
  // to call -- it holds no resources of its own. PdfViewer._attach(null) runs
  // from the viewer's own dispose and takes the controller's listener off the
  // transformation controller with it, so nothing is retained once this route
  // goes. Adding a dispose() here would not compile.

  Future<_ReaderSource> _resolve() async {
    final local = await ref.read(localLibraryProvider).find(widget.contentId);
    if (local != null) {
      return _ReaderSource.local(local.path);
    }

    final document =
        await ref.read(documentServiceProvider).getSource(widget.contentId);
    return _ReaderSource.remote(document.url);
  }

  void _reload() {
    setState(() => _source = _resolve());
  }

  @override
  Widget build(BuildContext context) {
    final contentAsync = ref.watch(contentDetailProvider(widget.contentId));

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        backgroundColor: AppColors.white,
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
          if (_pageCount > 0)
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
      ),
      body: FutureBuilder<_ReaderSource>(
        future: _source,
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
                  : _reload,
            );
          }

          final source = snapshot.requireData;
          return _buildViewer(source);
        },
      ),
    );
  }

  Widget _buildViewer(_ReaderSource source) {
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
        onRetry: _reload,
      ),
    );

    if (source.isLocal) {
      return PdfViewer.file(
        source.location,
        controller: _viewer,
        params: params,
      );
    }

    return PdfViewer.uri(
      Uri.parse(source.location),
      controller: _viewer,
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

/// Where a lesson tap should go, now that the app can open both kinds.
///
/// Lives here rather than in the lessons screen because the player and the
/// reader are the two destinations and this is the file that knows what a
/// readable item is.
String routeForContent(Content content) {
  if (content.isVideo) return '/player/${content.id}';
  return '/reader/${content.id}';
}
