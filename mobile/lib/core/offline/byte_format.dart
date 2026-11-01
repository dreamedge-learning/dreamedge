/// Sizes, written the way a student reads them.
///
/// Megabytes rather than mebibytes, and one decimal place at most: "712.4 MB"
/// is useful when deciding whether a lesson fits on the phone, "712,431,104
/// bytes" is not.
String formatBytes(int bytes) {
  if (bytes <= 0) return '0 MB';
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
  if (bytes < 1024 * 1024 * 1024) {
    return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  }
  return '${(bytes / 1024 / 1024 / 1024).toStringAsFixed(2)} GB';
}

/// How long until a licence lapses, in the terms the student cares about.
///
/// A date would be precise and useless; "3 days left" is what tells them
/// whether to find a signal before the weekend.
String formatLicenceRemaining(DateTime? expiresAt) {
  if (expiresAt == null) return 'No expiry';

  final remaining = expiresAt.difference(DateTime.now());
  if (remaining.isNegative) return 'Expired';

  if (remaining.inDays >= 1) {
    final days = remaining.inDays;
    return '$days ${days == 1 ? 'day' : 'days'} left';
  }
  if (remaining.inHours >= 1) {
    final hours = remaining.inHours;
    return '$hours ${hours == 1 ? 'hour' : 'hours'} left';
  }
  return 'Less than an hour left';
}
