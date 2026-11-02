import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../config/payment_config.dart';
import '../../core/providers/course_provider.dart';
import '../../core/providers/enrollment_provider.dart';
import '../../core/providers/payment_provider.dart';
import '../../shared/theme/colors.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  final String courseId;

  const CheckoutScreen({
    super.key,
    required this.courseId,
  });

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

/// Shape of a payment setback that the screen keeps around after the
/// Razorpay modal has gone, so the student has something to retry from
/// instead of a snackbar that times out.
///
/// `failed`      -- the gateway or the bank refused the charge; retry
///                  is safe, the Edge Function dedups a pending order
///                  for 15 min so the same Razorpay order reopens.
/// `unconfirmed` -- the charge may have gone through server-side but
///                  the verify call did not reach us. Do NOT invite a
///                  second attempt; send the student to support.
enum PaymentErrorKind { failed, unconfirmed }

class _PaymentError {
  final PaymentErrorKind kind;
  final String reason;
  const _PaymentError({required this.kind, required this.reason});
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  late Razorpay _razorpay;
  bool _isProcessing = false;
  String? _currentOrderId;
  String? _currentRazorpayOrderId;
  _PaymentError? _paymentError;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _handlePaymentSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _handlePaymentError);
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _handleExternalWallet);
  }

  @override
  void dispose() {
    _razorpay.clear();
    super.dispose();
  }

  Future<void> _initiatePayment() async {
    if (_isProcessing) return;
    setState(() {
      _isProcessing = true;
      _paymentError = null;
    });

    try {
      final service = ref.read(paymentServiceProvider);

      final enrolled = await service.isEnrolled(widget.courseId);
      if (enrolled && mounted) {
        _showSnackBar('You are already enrolled in this course!',
            isError: false);
        setState(() => _isProcessing = false);
        return;
      }

      final orderData = await service.createRazorpayOrder(
        courseId: widget.courseId,
      );

      _currentOrderId = orderData['order_id'] as String;
      _currentRazorpayOrderId = orderData['razorpay_order_id'] as String;
      final prefill = orderData['prefill'] as Map<String, dynamic>? ?? {};

      final options = {
        'key': orderData['key_id'] as String,
        'amount': ((orderData['amount'] as num).toDouble() * 100).toInt(),
        'currency': orderData['currency'] as String? ?? 'INR',
        'name': PaymentConfig.merchantName,
        'order_id': _currentRazorpayOrderId,
        'prefill': {
          'name': prefill['name'] ?? '',
          'email': prefill['email'] ?? '',
          'contact': prefill['contact'] ?? '',
        },
        'theme': {
          'color': '#F26A21',
        },
      };

      _razorpay.open(options);
    } catch (e) {
      if (mounted) {
        _showSnackBar('Failed to initiate payment. Please try again.');
        setState(() => _isProcessing = false);
      }
    }
  }

  Future<void> _handlePaymentSuccess(PaymentSuccessResponse response) async {
    try {
      final service = ref.read(paymentServiceProvider);

      await service.verifyPayment(
        orderId: _currentOrderId!,
        razorpayOrderId: _currentRazorpayOrderId!,
        razorpayPaymentId: response.paymentId ?? '',
        razorpaySignature: response.signature ?? '',
      );

      ref.invalidate(orderHistoryProvider);
      ref.invalidate(isEnrolledProvider(widget.courseId));
      ref.invalidate(courseEnrollmentProvider(widget.courseId));
      ref.invalidate(myEnrollmentsProvider);

      if (mounted) {
        _showSuccessDialog();
      }
    } catch (e) {
      // The charge may have landed server-side and only the verify call
      // dropped. The webhook or an admin can reconcile; the student
      // must NOT be invited to pay a second time.
      if (mounted) {
        setState(() {
          _paymentError = _PaymentError(
            kind: PaymentErrorKind.unconfirmed,
            reason: 'We could not confirm your payment with the gateway.',
          );
        });
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  void _handlePaymentError(PaymentFailureResponse response) {
    if (mounted) {
      setState(() {
        _paymentError = _PaymentError(
          kind: PaymentErrorKind.failed,
          reason:
              response.message ??
              'Your bank or card issuer declined the payment.',
        );
        _isProcessing = false;
      });
    }
  }

  void _handleExternalWallet(ExternalWalletResponse response) {
    if (mounted) {
      _showSnackBar('External wallet selected: ${response.walletName}',
          isError: false);
    }
  }

  void _showSnackBar(String message, {bool isError = true}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.error : AppColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  void _showSuccessDialog() {
    final courseAsync = ref.read(courseDetailProvider(widget.courseId));
    final courseName =
        courseAsync.valueOrNull?.title ?? 'your course';

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.check_circle_rounded,
                  color: AppColors.success, size: 48),
            ),
            const SizedBox(height: 20),
            Text(
              'Payment Successful!',
              style: GoogleFonts.playfairDisplay(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'You are now enrolled in $courseName',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.of(ctx).pop();
                  context.go('/');
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.orange,
                  foregroundColor: AppColors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: Text(
                  'Start Learning',
                  style: GoogleFonts.inter(
                      fontWeight: FontWeight.w600, fontSize: 16),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final courseAsync = ref.watch(courseDetailProvider(widget.courseId));

    return courseAsync.when(
      data: (course) {
        final price = course.price;
        final hasDiscount = course.hasDiscount;

        return Scaffold(
          backgroundColor: AppColors.surface,
          appBar: AppBar(
            title: Text(
              'Checkout',
              style: GoogleFonts.playfairDisplay(
                fontWeight: FontWeight.w700,
                fontSize: 20,
                color: AppColors.textPrimary,
              ),
            ),
            backgroundColor: AppColors.white,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            leading: IconButton(
              icon: const Icon(Icons.arrow_back_rounded,
                  color: AppColors.textPrimary),
              onPressed: () => context.pop(),
            ),
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        blurRadius: 10,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (course.thumbnailUrl != null)
                        ClipRRect(
                          borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(16)),
                          child: AspectRatio(
                            aspectRatio: 16 / 9,
                            child: Image.network(
                              course.thumbnailUrl!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => Container(
                                color:
                                    AppColors.darkBlue.withValues(alpha: 0.1),
                                child: const Icon(Icons.image_rounded,
                                    size: 48, color: AppColors.textSecondary),
                              ),
                            ),
                          ),
                        ),
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              course.title,
                              style: GoogleFonts.inter(
                                fontSize: 18,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Full course access with all lessons and materials',
                              style: GoogleFonts.inter(
                                fontSize: 13,
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Order Summary',
                  style: GoogleFonts.playfairDisplay(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        blurRadius: 10,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      _buildSummaryRow('Course Price',
                          '₹${(hasDiscount ? course.originalPrice! : course.price).toStringAsFixed(0)}'),
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Divider(height: 1),
                      ),
                      _buildSummaryRow(
                        'Discount',
                        hasDiscount
                            ? '-₹${(course.originalPrice! - course.price).toStringAsFixed(0)}'
                            : '₹0',
                        isSecondary: true,
                      ),
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Divider(height: 1),
                      ),
                      _buildSummaryRow(
                          'Total', '₹${price.toStringAsFixed(0)}',
                          isBold: true),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                if (_paymentError != null) ...[
                  _PaymentErrorPanel(error: _paymentError!),
                  const SizedBox(height: 16),
                ],
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.shield_rounded,
                          color: AppColors.success, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Payments are secured by Razorpay. Your card details are never stored.',
                          style: GoogleFonts.inter(
                              fontSize: 12, color: AppColors.textSecondary),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          bottomNavigationBar: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: SizedBox(
                height: 52,
                child: ElevatedButton(
                  // An `unconfirmed` payment MUST NOT be retried from this
                  // button: the gateway may have charged and the webhook is
                  // the right path to reconcile it. The button is disabled
                  // in that state and the panel above tells the student to
                  // reach support.
                  onPressed:
                      _isProcessing ||
                              _paymentError?.kind ==
                                  PaymentErrorKind.unconfirmed
                          ? null
                          : _initiatePayment,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.orange,
                    foregroundColor: AppColors.white,
                    disabledBackgroundColor:
                        AppColors.orange.withValues(alpha: 0.5),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                  ),
                  child: _isProcessing
                      ? const SizedBox(
                          height: 22,
                          width: 22,
                          child: CircularProgressIndicator(
                              strokeWidth: 2.5, color: AppColors.white),
                        )
                      : Text(
                          _paymentError?.kind == PaymentErrorKind.failed
                              ? 'Try payment again · ₹${price.toStringAsFixed(0)}'
                              : 'Pay ₹${price.toStringAsFixed(0)}',
                          style: GoogleFonts.inter(
                              fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                ),
              ),
            ),
          ),
        );
      },
      loading: () => Scaffold(
        backgroundColor: AppColors.surface,
        appBar: AppBar(
          title: Text('Checkout',
              style: GoogleFonts.playfairDisplay(
                  fontWeight: FontWeight.w700, fontSize: 20)),
          backgroundColor: AppColors.white,
        ),
        body: const Center(
          child: CircularProgressIndicator(color: AppColors.orange),
        ),
      ),
      error: (_, _) => Scaffold(
        backgroundColor: AppColors.surface,
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: () => context.pop(),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline_rounded,
                  size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              Text(
                'Could not load course details',
                style: GoogleFonts.inter(
                    fontSize: 16, color: AppColors.textPrimary),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () =>
                    ref.invalidate(courseDetailProvider(widget.courseId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSummaryRow(String label, String value,
      {bool isBold = false, bool isSecondary = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: isBold ? FontWeight.w600 : FontWeight.w400,
            color:
                isSecondary ? AppColors.textSecondary : AppColors.textPrimary,
          ),
        ),
        Text(
          value,
          style: GoogleFonts.inter(
            fontSize: isBold ? 18 : 14,
            fontWeight: isBold ? FontWeight.w700 : FontWeight.w500,
            color: isBold
                ? AppColors.orange
                : (isSecondary
                    ? AppColors.textSecondary
                    : AppColors.textPrimary),
          ),
        ),
      ],
    );
  }
}

/// Persistent panel for a payment that failed or finished without being
/// confirmed. Lives in the body so it survives a scroll and offers an
/// explicit next step -- a snackbar times out and leaves the student
/// looking at a page that acts like nothing happened.
class _PaymentErrorPanel extends StatelessWidget {
  final _PaymentError error;

  const _PaymentErrorPanel({required this.error});

  @override
  Widget build(BuildContext context) {
    final isFailed = error.kind == PaymentErrorKind.failed;
    final accent = isFailed ? AppColors.error : AppColors.warning;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accent.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            isFailed
                ? Icons.error_outline_rounded
                : Icons.pending_outlined,
            color: accent,
            size: 22,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isFailed
                      ? 'Payment failed'
                      : 'Payment pending confirmation',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  error.reason,
                  style: GoogleFonts.inter(
                    fontSize: 12.5,
                    color: AppColors.textPrimary.withValues(alpha: 0.85),
                    height: 1.4,
                  ),
                ),
                if (!isFailed) ...[
                  const SizedBox(height: 8),
                  Text(
                    'If money left your account, please contact support '
                    'before paying again — it may still be on its way.',
                    style: GoogleFonts.inter(
                      fontSize: 11.5,
                      color: AppColors.textSecondary,
                      height: 1.4,
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
