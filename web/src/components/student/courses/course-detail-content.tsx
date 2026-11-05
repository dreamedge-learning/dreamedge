"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Clock,
  BookOpen,
  BarChart3,
  Globe,
  Award,
  Star,
  Users,
  Share2,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";
import { formatRelativeTime } from "@/lib/format";
import { loadRazorpay } from "@/lib/razorpay";
import { useAuth } from "@/lib/hooks/use-auth";
import {
  enrollFree,
  createPaymentOrder,
  verifyPayment,
} from "@/app/(student)/courses/[slug]/actions";
import type { Course } from "@/types/course";
import {
  CourseSyllabus,
  type SyllabusSubject,
} from "@/components/student/courses/course-syllabus";
import { CourseReviews } from "@/components/student/courses/course-reviews";
import type { PublicReviewPage } from "@/lib/ratings";

interface CourseDetailContentProps {
  course: Course;
  isEnrolled?: boolean;
  /**
   * From `get_course_syllabus`, which returns titles, types, durations and
   * posters and nothing playable -- the table itself is unreadable to anyone
   * without an active enrolment.
   */
  syllabus?: SyllabusSubject[];
  /** The first page of written reviews, from `course_reviews`. */
  reviews?: PublicReviewPage;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  intermediate: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  advanced: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function CourseDetailContent({
  course,
  isEnrolled = false,
  syllabus = [],
  reviews = { reviews: [], total: 0 },
}: CourseDetailContentProps) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // A persistent panel for a failed or unconfirmed payment. The old shape
  // showed a toast and left the student at the pre-click state, which
  // disappeared the moment the toast timed out and left them with no
  // record of what went wrong. The panel below carries a reason and an
  // explicit Retry button that re-runs the enrol path -- the Edge
  // Function dedups a pending order for 15 min, so a quick retry reuses
  // the same Razorpay order rather than creating a second one.
  const [paymentError, setPaymentError] = useState<{
    kind: "failed" | "unconfirmed";
    reason: string;
  } | null>(null);

  const discount =
    course.original_price && course.original_price > course.price
      ? Math.round(((course.original_price - course.price) / course.original_price) * 100)
      : null;

  const longText = course.long_description || course.description || "";
  const isLong = longText.length > 500;

  async function handleFreeEnroll() {
    setEnrolling(true);
    try {
      const result = await enrollFree(course.id);
      if (result.error) {
        if (result.error === "Please log in to continue") {
          router.push("/login");
          return;
        }
        toast.error(result.error);
        return;
      }
      toast.success("Enrolled successfully!", {
        description: "You can now access this course.",
      });
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setEnrolling(false);
    }
  }

  async function handlePaidEnroll() {
    setEnrolling(true);
    setPaymentError(null);

    // The server action calls the create-razorpay-order Edge Function, which
    // re-derives the price from the database, creates the `orders` row and
    // returns the Razorpay key and amount. Nothing here is priced client-side.
    const orderResult = await createPaymentOrder(course.id);

    if (orderResult.error || !orderResult.data) {
      if (orderResult.error === "Please log in to continue") {
        router.push("/login");
        return;
      }
      toast.error(orderResult.error ?? "Could not start checkout. Please try again.");
      setEnrolling(false);
      return;
    }

    const order = orderResult.data;

    const loaded = await loadRazorpay();
    const Razorpay = typeof window !== "undefined" ? window.Razorpay : undefined;
    if (!loaded || !Razorpay) {
      toast.error("Could not load payment gateway. Please try again.");
      setEnrolling(false);
      return;
    }

    // Every figure below comes from the server's order response.
    const options: Record<string, unknown> = {
      key: order.key,
      amount: order.amountInPaise,
      currency: order.currency,
      order_id: order.razorpayOrderId,
      name: "Dream Edge Online",
      description: course.title,
      theme: { color: "#F26A21" },
      prefill: {
        name: order.prefill.name,
        email: order.prefill.email,
        contact: order.prefill.contact,
      },
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        setVerifying(true);
        try {
          const verifyResult = await verifyPayment({
            // Internal orders.id — the server resolves the student, course and
            // expected amount from that row, so the browser cannot pick them.
            orderId: order.orderId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            courseId: course.id,
          });

          if (verifyResult.error || !verifyResult.data) {
            // The payment may have gone through server-side while our
            // confirm call failed. Do NOT invite the student to pay
            // again -- send them to support and let the webhook or an
            // admin reconcile.
            setPaymentError({
              kind: "unconfirmed",
              reason:
                verifyResult.error ??
                "We could not confirm your payment with the gateway.",
            });
            return;
          }

          setPaymentError(null);
          toast.success("Payment successful!", {
            description: "You are now enrolled in this course.",
          });
          router.refresh();
        } catch (err) {
          setPaymentError({
            kind: "unconfirmed",
            reason:
              err instanceof Error
                ? err.message
                : "We could not confirm your payment with the gateway.",
          });
        } finally {
          setVerifying(false);
          setEnrolling(false);
        }
      },
      modal: {
        ondismiss: () => {
          setEnrolling(false);
        },
      },
    };

    try {
      const rzp = new Razorpay(options) as unknown as {
        on: (
          event: "payment.failed",
          handler: (response: { error?: { description?: string } }) => void
        ) => void;
        open: () => void;
      };
      rzp.on("payment.failed", (response) => {
        setPaymentError({
          kind: "failed",
          reason:
            response.error?.description ||
            "Your bank or card issuer declined the payment.",
        });
        setEnrolling(false);
      });
      rzp.open();
      // Leave `enrolling` set: the modal's ondismiss / handler clears it.
      // (The old code reset it in a `finally`, which runs on `return` too, so
      // the button went live again while the checkout modal was still open.)
    } catch (err) {
      toast.error("Could not open the payment window.", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
      setEnrolling(false);
    }
  }

  function handleEnroll() {
    if (course.price === 0) {
      handleFreeEnroll();
    } else {
      handlePaidEnroll();
    }
  }

  async function handleShare() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    } catch {
      toast.error("Could not copy link");
    }
  }

  function renderEnrollButton() {
    if (isEnrolled) {
      return (
        <Link
          href={`/courses/${course.slug}/learn`}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700"
        >
          <CheckCircle2 className="h-4 w-4" />
          Continue Learning
        </Link>
      );
    }

    if (!authLoading && !user) {
      return (
        <Link
          href="/login"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-orange py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
        >
          Login to Enroll
        </Link>
      );
    }

    const label =
      course.price === 0
        ? "Enroll Now — Free"
        : `Enroll Now — ${formatINR(course.price)}`;

    return (
      <button
        onClick={handleEnroll}
        disabled={enrolling || verifying || authLoading}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-orange py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark disabled:opacity-70"
      >
        {enrolling || verifying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {verifying ? "Confirming payment…" : "Processing…"}
          </>
        ) : (
          label
        )}
      </button>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/" className="transition-colors hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/courses" className="transition-colors hover:text-foreground">
          Courses
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate text-foreground">{course.title}</span>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        {/* Left Column */}
        <div className="lg:col-span-2">
          {/* Header */}
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{course.title}</h1>
          {course.description && (
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {course.description}
            </p>
          )}

          {/* Meta row */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {course.teacher_name && (
              <span className="text-sm font-medium">{course.teacher_name}</span>
            )}
            {course.class && (
              <Badge variant="secondary">{course.class}</Badge>
            )}
            {course.subject && (
              <Badge variant="outline">{course.subject}</Badge>
            )}
            {course.rating_avg != null && course.rating_avg > 0 && (
              <span className="flex items-center gap-1 text-sm">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {course.rating_avg.toFixed(1)}
                <a href="#course-reviews-heading" className="text-muted-foreground hover:underline">
                  ({course.rating_count.toLocaleString("en-IN")}{" "}
                  {course.rating_count === 1 ? "rating" : "ratings"})
                </a>
              </span>
            )}
            {course.student_count > 0 && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                {course.student_count.toLocaleString("en-IN")} students
              </span>
            )}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Last updated {formatRelativeTime(course.updated_at)}
          </p>

          {/* Thumbnail / Preview */}
          <div className="relative mt-8 aspect-video w-full overflow-hidden rounded-xl bg-gradient-to-br from-brand-orange/20 to-brand-blue/20">
            {course.thumbnail_url ? (
              <Image
                src={course.thumbnail_url}
                alt={course.title}
                fill
                sizes="(max-width: 1024px) 100vw, 66vw"
                priority
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="text-5xl font-bold text-brand-orange/30">DE</span>
              </div>
            )}
            {course.preview_video_url && (
              <a
                href={course.preview_video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/40"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg">
                  <Play className="h-7 w-7 fill-brand-orange text-brand-orange" />
                </div>
              </a>
            )}
          </div>

          {/* About */}
          {syllabus.length > 0 && (
            <div className="mt-10">
              <CourseSyllabus
                subjects={syllabus}
                isEnrolled={isEnrolled}
                onEnrol={handleEnroll}
              />
            </div>
          )}

          {longText && (
            <div className="mt-10">
              <h2 className="text-xl font-semibold">About This Course</h2>
              <div
                className={`mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground ${
                  !expanded && isLong ? "line-clamp-6" : ""
                }`}
              >
                {longText}
              </div>
              {isLong && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="mt-2 text-sm font-medium text-brand-orange hover:text-brand-orange-dark"
                >
                  {expanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          )}

          {/* Tags */}
          {course.tags && course.tags.length > 0 && (
            <div className="mt-10">
              <h2 className="text-xl font-semibold">What You&apos;ll Learn</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {course.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="capitalize">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <CourseReviews
            courseId={course.id}
            ratingAvg={course.rating_avg}
            ratingCount={course.rating_count}
            initial={reviews}
          />
        </div>

        {/* Right Column — Enrollment Card */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {/* Card thumbnail */}
            <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-brand-orange/20 to-brand-blue/20">
              {course.thumbnail_url ? (
                <Image
                  src={course.thumbnail_url}
                  alt={course.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="text-3xl font-bold text-brand-orange/30">DE</span>
                </div>
              )}
            </div>

            <div className="p-5">
              {/* Price */}
              <div className="flex items-baseline gap-2">
                {course.price === 0 ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Free
                  </Badge>
                ) : (
                  <>
                    <span className="text-2xl font-bold text-brand-orange">
                      {formatINR(course.price)}
                    </span>
                    {course.original_price != null && course.original_price > course.price && (
                      <>
                        <span className="text-sm text-muted-foreground line-through">
                          {formatINR(course.original_price)}
                        </span>
                        {discount && (
                          <Badge variant="secondary" className="text-green-600 dark:text-green-400">
                            {discount}% off
                          </Badge>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              {paymentError && (
                <div
                  role="alert"
                  className={
                    "mt-4 rounded-lg border p-3 text-sm " +
                    (paymentError.kind === "failed"
                      ? "border-rose-500/40 bg-rose-500/5"
                      : "border-amber-500/40 bg-amber-500/5")
                  }
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle
                      className={
                        "mt-0.5 h-4 w-4 shrink-0 " +
                        (paymentError.kind === "failed"
                          ? "text-rose-600"
                          : "text-amber-600")
                      }
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="font-semibold">
                        {paymentError.kind === "failed"
                          ? "Payment failed"
                          : "Payment pending confirmation"}
                      </p>
                      <p className="break-words text-xs text-foreground/80">
                        {paymentError.reason}
                      </p>
                      {paymentError.kind === "unconfirmed" && (
                        <p className="text-xs text-muted-foreground">
                          If money left your account, please contact support
                          before paying again — it may still be on its way.
                        </p>
                      )}
                      {paymentError.kind === "failed" && (
                        <button
                          type="button"
                          onClick={handlePaidEnroll}
                          disabled={enrolling || verifying}
                          className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-rose-600/30 bg-background px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-500/10 disabled:opacity-60 dark:text-rose-400"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Try payment again
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* CTA */}
              {renderEnrollButton()}
              <button
                onClick={handleShare}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Share2 className="h-4 w-4" />
                Share this course
              </button>

              {/* Course info */}
              <ul className="mt-6 space-y-3 text-sm">
                {course.duration_hours != null && (
                  <li className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" /> Duration
                    </span>
                    <span className="font-medium">{course.duration_hours} hours</span>
                  </li>
                )}
                {course.total_lessons > 0 && (
                  <li className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <BookOpen className="h-4 w-4" /> Lessons
                    </span>
                    <span className="font-medium">{course.total_lessons}</span>
                  </li>
                )}
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <BarChart3 className="h-4 w-4" /> Difficulty
                  </span>
                  <Badge
                    variant="secondary"
                    className={`capitalize ${DIFFICULTY_COLORS[course.difficulty] ?? ""}`}
                  >
                    {course.difficulty}
                  </Badge>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Globe className="h-4 w-4" /> Language
                  </span>
                  <span className="font-medium">English + Hindi</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Award className="h-4 w-4" /> Certificate
                  </span>
                  <span className="font-medium">Yes</span>
                </li>
              </ul>

              {/* Trust strip */}
              <div className="mt-6 rounded-lg border border-border bg-muted/40 p-3 dark:bg-white/[0.02]">
                <ul className="space-y-2 text-xs">
                  <li className="flex items-start gap-2 text-foreground/80">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      <strong className="text-foreground">7-day refund</strong> if less than 20% consumed
                    </span>
                  </li>
                  <li className="flex items-start gap-2 text-foreground/80">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      <strong className="text-foreground">Live classes</strong> + rewatch recordings
                    </span>
                  </li>
                  <li className="flex items-start gap-2 text-foreground/80">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      Learn on <strong className="text-foreground">mobile, laptop, tablet</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2 text-foreground/80">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      <strong className="text-foreground">UPI, cards, net banking</strong> &mdash; secure via Razorpay
                    </span>
                  </li>
                </ul>
              </div>

              {/* Teacher */}
              {course.teacher_name && (
                <div className="mt-6 border-t border-border pt-4">
                  <div className="flex items-center gap-3">
                    {course.teacher_avatar_url ? (
                      <Image
                        src={course.teacher_avatar_url}
                        alt={course.teacher_name}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-blue text-sm font-semibold text-white">
                        {course.teacher_name
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{course.teacher_name}</p>
                      <p className="text-xs text-muted-foreground">Instructor</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
