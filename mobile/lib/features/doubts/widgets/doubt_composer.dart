import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/logging/app_log.dart';
import '../../../core/services/doubt_service.dart';
import '../../../shared/theme/colors.dart';
import '../../../shared/theme/typography.dart';

/// Sends the text and optional photo. Returns an error to show, or null when
/// it went through.
typedef DoubtSubmit = Future<String?> Function(String body, DoubtPhoto? photo);

/// The text-and-photo box for asking a doubt and for following one up.
///
/// The error is shown under the field rather than in a snack bar: the box
/// usually sits in a bottom sheet, and a snack bar would appear behind it.
class DoubtComposer extends StatefulWidget {
  final String hint;
  final String submitLabel;
  final int minLength;
  final int maxLength;
  final DoubtSubmit onSubmit;
  final bool autofocus;

  const DoubtComposer({
    super.key,
    required this.hint,
    required this.submitLabel,
    required this.minLength,
    this.maxLength = 2000,
    required this.onSubmit,
    this.autofocus = false,
  });

  @override
  State<DoubtComposer> createState() => _DoubtComposerState();
}

class _DoubtComposerState extends State<DoubtComposer> {
  final TextEditingController _controller = TextEditingController();
  final ImagePicker _picker = ImagePicker();
  DoubtPhoto? _photo;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onChanged);
  }

  @override
  void dispose() {
    _controller.removeListener(_onChanged);
    _controller.dispose();
    super.dispose();
  }

  void _onChanged() => setState(() {});

  int get _length => _controller.text.trim().length;

  bool get _canSend =>
      !_busy && _length >= widget.minLength && _length <= widget.maxLength;

  /// The picker scales the photo down as it hands it over. 1600 px keeps
  /// handwriting legible and turns a 6 MB camera shot into a few hundred
  /// kilobytes, which is what a student on mobile data pays for.
  Future<void> _pick(ImageSource source) async {
    try {
      final file = await _picker.pickImage(
        source: source,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 85,
      );
      if (file == null) return;

      final bytes = await file.readAsBytes();
      if (!mounted) return;
      setState(() {
        _error = null;
        _photo = DoubtPhoto(
          bytes: bytes,
          extension: DoubtPhoto.extensionOf(file.name),
        );
      });
    } catch (e) {
      logDebug('doubts', 'Picking a photo failed: ${e.runtimeType}');
      if (!mounted) return;
      setState(() => _error = source == ImageSource.camera
          ? 'The camera could not be opened.'
          : 'That photo could not be opened.');
    }
  }

  Future<void> _choosePhoto() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.of(sheetContext).pop(ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source != null) await _pick(source);
  }

  Future<void> _submit() async {
    if (!_canSend) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });

    final error = await widget.onSubmit(_controller.text.trim(), _photo);
    if (!mounted) return;

    setState(() {
      _busy = false;
      _error = error;
      if (error == null) {
        _controller.clear();
        _photo = null;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final photo = _photo;
    final tooShort = _length > 0 && _length < widget.minLength;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        TextField(
          controller: _controller,
          enabled: !_busy,
          autofocus: widget.autofocus,
          minLines: 2,
          maxLines: 6,
          maxLength: widget.maxLength,
          textCapitalization: TextCapitalization.sentences,
          style: AppTypography.bodyMedium,
          decoration: InputDecoration(
            hintText: widget.hint,
            counterText: '',
          ),
        ),
        if (photo != null) ...[
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.memory(
                    photo.bytes,
                    height: 110,
                    fit: BoxFit.cover,
                  ),
                ),
                Positioned(
                  right: -8,
                  top: -8,
                  child: Material(
                    color: AppColors.textPrimary,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: _busy ? null : () => setState(() => _photo = null),
                      child: const Padding(
                        padding: EdgeInsets.all(4),
                        child: Icon(
                          Icons.close_rounded,
                          size: 16,
                          color: AppColors.background,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(
            _error!,
            style: AppTypography.bodySmall.copyWith(color: AppColors.error),
          ),
        ],
        const SizedBox(height: 10),
        Row(
          children: [
            OutlinedButton.icon(
              onPressed: _busy ? null : _choosePhoto,
              icon: const Icon(Icons.add_a_photo_outlined, size: 18),
              label: Text(photo == null ? 'Photo' : 'Change'),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                tooShort
                    ? 'At least ${widget.minLength} characters'
                    : '$_length/${widget.maxLength}',
                style: AppTypography.caption,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            FilledButton.icon(
              onPressed: _canSend ? _submit : null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.orange,
                foregroundColor: AppColors.white,
              ),
              icon: _busy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.white,
                      ),
                    )
                  : const Icon(Icons.send_rounded, size: 18),
              label: Text(widget.submitLabel),
            ),
          ],
        ),
      ],
    );
  }
}
