"use server";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/lib/auth-guard";
import { passwordSetupEmail, sendEmail } from "@/lib/email";
import { normalizeIndianPhone } from "@/lib/phone";
import { SITE_URL } from "@/lib/site";
import {
  createStudentProfile,
  findStudentByEmail,
} from "@/lib/students/create-student";
import { syntheticEmailForPhone } from "@/lib/students/identity";
import { profileColumns } from "@/lib/students/profile-columns";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { describeFailure, firstIssue } from "@/lib/validations/form";
import {
  hasEnrolment,
  offlineRegistrationInput,
  offlineRegistrationSchema,
} from "@/lib/validations/offline-registration";
import { recordManualPayment } from "../../revenue/actions";

/**
 * Registering a student at the Kalmeshwar centre.
 *
 * The shape of the problem: a student walks in, pays cash, fills in a printed
 * sheet, and an admin types it into this screen. By the time anything can go
 * wrong the money is already in the drawer, so nothing here is allowed to
 * refuse a registration over something recoverable — a missing email in
 * particular.
 *
 * `students.user_id` is NOT NULL against `auth.users` and was hardened that
 * way deliberately, so this path creates the auth user rather than loosening
 * the column. Three cases get explicit handling because they are the ones
 * that will actually happen:
 *
 *   - the student signed up online first, so the email already has an auth
 *     user, a student row, or both;
 *   - the student has no email at all;
 *   - the student will sign in with Google later using the same address.
 *
 * The third is handled in the OAuth callback rather than here: it resolves an
 * existing student by email before inserting, so a second profile for the
 * same person cannot be created there.
 */

const REGISTER_ROLES = ["super_admin", "support_staff"] as const;

interface ActionResult<T> {
  data?: T;
  error?: string;
}

export interface OfflineRegistrationResult {
  studentId: string;
  studentCode: string | null;
  fullName: string;
  email: string;
  /** True when the address was invented because the student had none. */
  emailIsPlaceholder: boolean;
  /** The set-your-password link, to hand over or send on WhatsApp. */
  passwordLink: string | null;
  /** Whether the same link also went out by email. */
  emailed: boolean;
  /** Set when the auth account already existed and was reused. */
  reusedExistingAccount: boolean;
  enrolment?: { orderId: string; courseTitle: string; amount: number };
  /** Set when the enrolment failed but the student was still created. */
  enrolmentError?: string;
}

export interface ExistingStudentMatch {
  studentId: string;
  studentCode: string | null;
  fullName: string;
  email: string;
}

/**
 * The address the record will carry.
 *
 * `students.email` is NOT NULL and unique, and plenty of students at the
 * centre have no email. The same synthetic shape the phone-OTP path already
 * uses keeps the column honest; the record is flagged in the panel so a real
 * address can be collected later.
 */
function resolveEmail(values: {
  email?: string;
  phone?: string;
  parent_phone: string;
}): { email: string; isPlaceholder: boolean } {
  const given = values.email?.trim();
  if (given) return { email: given.toLowerCase(), isPlaceholder: false };

  const phone =
    normalizeIndianPhone(values.phone ?? null) ??
    normalizeIndianPhone(values.parent_phone);

  // The profile schema requires a parent's number, so there is always one.
  return {
    email: syntheticEmailForPhone(phone ?? ""),
    isPlaceholder: true,
  };
}

/**
 * Finds the auth user behind an email, and the password link in one go.
 *
 * `generateLink` with type `recovery` returns the user when one exists and
 * fails when it does not, which is exactly the question being asked — and it
 * returns the link that has to be handed over either way. Listing users and
 * filtering client-side would mean paging the whole table.
 */
async function recoveryLinkFor(email: string): Promise<{
  userId: string | null;
  link: string | null;
  unexpectedError?: string;
}> {
  const service = createServiceClient();

  const { data, error } = await service.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${SITE_URL}/auth/reset-password` },
  });

  if (error) {
    const message = error.message.toLowerCase();
    const notFound =
      error.status === 404 ||
      message.includes("not found") ||
      message.includes("no user");

    if (notFound) return { userId: null, link: null };

    console.error("[offline registration] generateLink failed:", error);
    return { userId: null, link: null, unexpectedError: error.message };
  }

  return {
    userId: data.user?.id ?? null,
    link: data.properties?.action_link ?? null,
  };
}

export async function registerStudentOffline(
  formData: FormData
): Promise<
  ActionResult<OfflineRegistrationResult> & { existing?: ExistingStudentMatch }
> {
  try {
    const { adminUser } = await assertAdmin([...REGISTER_ROLES]);

    const parsed = offlineRegistrationSchema.safeParse(
      offlineRegistrationInput(formData)
    );
    if (!parsed.success) {
      return { error: firstIssue(parsed.error) };
    }

    const values = parsed.data;
    const { email, isPlaceholder } = resolveEmail(values);

    // Duplicate student records are the most likely real-world failure of
    // this whole feature: the student signed up online last week and has
    // forgotten. Offer the existing record rather than refusing or, worse,
    // creating a second one.
    const existing = await findStudentByEmail(email);
    if (existing) {
      return {
        existing: {
          studentId: existing.id,
          studentCode: existing.student_code,
          fullName: existing.full_name,
          email: existing.email,
        },
      };
    }

    const service = createServiceClient();

    // An auth user without a student row happens: a signup that failed
    // halfway, or a student who only ever got as far as the OTP screen. Link
    // to it rather than erroring on an address that is already taken.
    const recovery = await recoveryLinkFor(email);
    if (recovery.unexpectedError) {
      return { error: "Could not check that email address. Please try again." };
    }

    let userId = recovery.userId;
    let passwordLink = recovery.link;
    const reusedExistingAccount = userId !== null;

    if (!userId) {
      const { data: created, error: createError } =
        await service.auth.admin.createUser({
          email,
          // A random password nobody is told; the student sets their own
          // through the link below. Leaving the account passwordless would
          // make the recovery link the only way in forever.
          password: crypto.randomUUID(),
          email_confirm: true,
        });

      if (createError || !created.user) {
        console.error("[offline registration] createUser failed:", createError);
        return { error: "Could not create the student's account. Please try again." };
      }

      userId = created.user.id;

      const fresh = await recoveryLinkFor(email);
      passwordLink = fresh.link;
    }

    const registrationDate = values.registration_date
      ? new Date(values.registration_date).toISOString()
      : undefined;

    const created = await createStudentProfile({
      userId,
      source: "admin_offline",
      registeredBy: adminUser.id,
      authEmail: email,
      fields: {
        ...profileColumns(values as unknown as Record<string, unknown>),
        email,
        gender: values.gender ?? null,
        admin_notes: values.admin_notes ?? null,
        // The admin just filled every required field in, so there is nothing
        // for the onboarding gate to collect.
        profile_completed: true,
        created_at: registrationDate ?? null,
      },
    });

    if (created.error || !created.data) {
      // The auth user is left in place on purpose when it already existed —
      // it is not ours to delete. One we just made is rolled back, so the
      // address is free for another attempt.
      if (!reusedExistingAccount) {
        await service.auth.admin.deleteUser(userId);
      }
      return { error: created.error ?? "Could not create the student record." };
    }

    const student = created.data;

    let enrolment: OfflineRegistrationResult["enrolment"];
    let enrolmentError: string | undefined;

    if (hasEnrolment(values)) {
      const outcome = await recordEnrolment(values, student.id, registrationDate);
      enrolment = outcome.enrolment;
      enrolmentError = outcome.error;
    }

    const emailed = await notifyStudent({
      email,
      isPlaceholder,
      fullName: student.full_name,
      studentCode: student.student_code,
      link: passwordLink,
    });

    const supabase = await createClient();
    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "student_registered_offline",
      entity_type: "student",
      entity_id: student.id,
      new_data: {
        student_code: student.student_code,
        registered_by: adminUser.full_name,
        email_is_placeholder: isPlaceholder,
        reused_existing_account: reusedExistingAccount,
        registration_date: registrationDate ?? null,
      },
      metadata: enrolment
        ? {
            course_id: values.course_id,
            amount: enrolment.amount,
            payment_method: values.payment_method,
            receipt_number: values.receipt_number ?? null,
            order_id: enrolment.orderId,
          }
        : null,
    });

    revalidatePath("/admin/students");
    revalidatePath("/admin/revenue");

    return {
      data: {
        studentId: student.id,
        studentCode: student.student_code,
        fullName: student.full_name,
        email,
        emailIsPlaceholder: isPlaceholder,
        passwordLink,
        emailed,
        reusedExistingAccount,
        enrolment,
        enrolmentError,
      },
    };
  } catch (err) {
    console.error("registerStudentOffline failed:", err);
    return { error: describeFailure(err) };
  }
}

/**
 * The enrolment and the cash, through the existing manual-payment action.
 *
 * Reused rather than rewritten: that action is the one definition of what a
 * manual payment does — the order row, the enrolment row, the validity and
 * the audit entry — and a second implementation here is how the revenue
 * figures would come to disagree with the enrolments.
 *
 * A failure does not fail the registration. The student exists and the cash
 * is collected; the admin can record the payment from the Revenue tab, and
 * the panel tells them to.
 */
async function recordEnrolment(
  values: {
    course_id?: string;
    amount?: string;
    payment_method?: "manual_cash" | "manual_upi" | "manual_bank";
    receipt_number?: string;
    validity_days?: string;
  },
  studentId: string,
  registrationDate: string | undefined
): Promise<{
  enrolment?: OfflineRegistrationResult["enrolment"];
  error?: string;
}> {
  if (!values.course_id) return {};

  if (!values.amount || !values.payment_method) {
    return {
      error:
        "The student was registered, but the payment needs an amount and a payment mode. Record it from Revenue.",
    };
  }

  const payment = new FormData();
  payment.set("student_id", studentId);
  payment.set("course_id", values.course_id);
  payment.set("amount", values.amount);
  payment.set("payment_method", values.payment_method);
  if (values.receipt_number) payment.set("reference", values.receipt_number);
  if (values.validity_days) payment.set("validity_days", values.validity_days);
  payment.set("remarks", "Registered at the Kalmeshwar centre");
  if (registrationDate) payment.set("payment_date", registrationDate);

  const result = await recordManualPayment(payment);

  if (result.error || !result.orderId) {
    return {
      error: `The student was registered, but the payment was not recorded: ${
        result.error ?? "unknown reason"
      }`,
    };
  }

  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("title")
    .eq("id", values.course_id)
    .maybeSingle();

  return {
    enrolment: {
      orderId: result.orderId,
      courseTitle: course?.title ?? "Course",
      amount: Number(values.amount),
    },
  };
}

/**
 * Emails the password link, when there is somewhere to send it.
 *
 * The link is shown in the panel regardless, because the student is usually
 * standing at the counter and WhatsApp reaches them before email does.
 */
async function notifyStudent(options: {
  email: string;
  isPlaceholder: boolean;
  fullName: string;
  studentCode: string | null;
  link: string | null;
}): Promise<boolean> {
  if (options.isPlaceholder || !options.link) return false;

  const message = passwordSetupEmail({
    fullName: options.fullName,
    studentCode: options.studentCode,
    link: options.link,
  });

  const outcome = await sendEmail({ to: options.email, ...message });
  return outcome.sent;
}

/** Courses an admin can enrol a walk-in student into. */
export async function fetchCoursesForRegistration() {
  try {
    await assertAdmin([...REGISTER_ROLES, "accountant"]);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("courses")
      .select("id, title, price, validity_days")
      .eq("is_published", true)
      .order("title");

    if (error) {
      console.error("fetchCoursesForRegistration failed:", error);
      return { data: [], error: "Could not load the course list." };
    }

    return { data: data ?? [] };
  } catch (err) {
    console.error("fetchCoursesForRegistration failed:", err);
    return { data: [], error: describeFailure(err) };
  }
}
