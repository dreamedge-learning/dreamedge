"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Printer,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INDIAN_STATES } from "@/lib/constants/indian-states";
import { formatINR } from "@/lib/format";
import {
  GENDER_OPTIONS,
  STUDENT_BOARDS,
  STUDENT_CLASSES,
} from "@/lib/validations/onboarding";
import {
  registerStudentOffline,
  type ExistingStudentMatch,
  type OfflineRegistrationResult,
} from "@/app/admin/(panel)/students/new/actions";

/**
 * Counter registration, on one screen.
 *
 * Not a wizard, unlike the student-facing form: an admin copying from a
 * printed sheet wants every field in front of them and a tab order that
 * follows the paper line by line. The field order here, on the printed sheet
 * and in the online form are the same three orders, so the admin can type
 * without looking up what maps to what.
 */

interface Course {
  id: string;
  title: string;
  price: number;
  validity_days: number | null;
}

interface Props {
  courses: Course[];
  canRecordPayment: boolean;
  adminName: string;
}

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm " +
  "outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 " +
  "focus-visible:ring-ring/50 disabled:opacity-50";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OfflineRegistrationForm({
  courses,
  canRecordPayment,
  adminName,
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [pending, setPending] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [amount, setAmount] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [result, setResult] = useState<OfflineRegistrationResult | null>(null);
  const [duplicate, setDuplicate] = useState<ExistingStudentMatch | null>(null);
  // Set from the collision panel's "This is a different student" button. The
  // next submit sends it; the action skips the pre-insert duplicate check for
  // one submission, so the admin can register a sibling who shares an email
  // without the first registration blocking them.
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === courseId) ?? null,
    [courseId, courses]
  );

  function pickCourse(id: string) {
    setCourseId(id);
    const course = courses.find((candidate) => candidate.id === id);

    // Prefilled from the course and overridable, because what the student
    // actually hands over at the counter is often a rounded figure.
    setAmount(course ? String(course.price) : "");
    setValidityDays(course?.validity_days ? String(course.validity_days) : "");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    if (overrideDuplicate) {
      formData.set("confirm_different_student", "1");
    }
    setPending(true);
    setDuplicate(null);

    const outcome = await registerStudentOffline(formData);
    setPending(false);

    if (outcome.existing) {
      setDuplicate(outcome.existing);
      return;
    }

    if (outcome.error || !outcome.data) {
      toast.error(outcome.error ?? "Could not register the student.");
      return;
    }

    // Reset the override so a later unrelated submit cannot carry it over.
    setOverrideDuplicate(false);
    setResult(outcome.data);
  }

  function registerAnother() {
    setResult(null);
    setDuplicate(null);
    setOverrideDuplicate(false);
    setCourseId("");
    setAmount("");
    setValidityDays("");
    formRef.current?.reset();
    window.scrollTo({ top: 0 });
  }

  function confirmDifferentStudent() {
    setOverrideDuplicate(true);
    setDuplicate(null);
    // Re-submit through the normal form path so every field is re-validated.
    formRef.current?.requestSubmit();
  }

  if (result) {
    return (
      <RegistrationComplete
        result={result}
        onRegisterAnother={registerAnother}
        onOpenStudent={() => router.push("/admin/students")}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" render={<Link href="/admin/students" />}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Register a student</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              For a student registering at the centre. The fields follow the
              printed form, top to bottom.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/admin/students/registration-form" />}
        >
          <Printer className="mr-1.5 h-4 w-4" />
          Printable forms
        </Button>
      </div>

      {duplicate && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-2 text-sm">
              <p className="font-medium">A student with this email is already on file.</p>
              <p className="text-muted-foreground">
                {duplicate.fullName}
                {duplicate.studentCode ? ` (${duplicate.studentCode})` : ""} is
                registered on {duplicate.email}. If this is the same person,
                open the existing record rather than creating a second one — a
                duplicate splits their enrolments from their progress. If a
                sibling or a parent is sharing the address, confirm it is a
                different student and the registration will go through.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/admin/students" />}
                >
                  Open the existing record
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={confirmDifferentStudent}
                >
                  This is a different student
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        <Section title="Student" blurb="As written on the form.">
          <Field id="full_name" label="Full name" required className="sm:col-span-2">
            <Input
              id="full_name"
              name="full_name"
              required
              maxLength={120}
              autoComplete="off"
              autoFocus
            />
          </Field>

          <Field id="date_of_birth" label="Date of birth">
            <Input id="date_of_birth" name="date_of_birth" type="date" />
          </Field>

          <Field id="gender" label="Gender">
            <select id="gender" name="gender" className={SELECT_CLASS} defaultValue="">
              <option value="">Not stated</option>
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="School" blurb="What they are studying this year.">
          <Field id="class" label="Current class" required>
            <select id="class" name="class" className={SELECT_CLASS} defaultValue="" required>
              <option value="">Select class</option>
              {STUDENT_CLASSES.map((option) => (
                <option key={option} value={option}>
                  Class {option}
                </option>
              ))}
            </select>
          </Field>

          <Field id="board" label="Board" required>
            <select id="board" name="board" className={SELECT_CLASS} defaultValue="" required>
              <option value="">Select board</option>
              {STUDENT_BOARDS.map((option) => (
                <option key={option} value={option}>
                  {option === "State" ? "State Board" : option}
                </option>
              ))}
            </select>
          </Field>

          <Field id="school_name" label="School name" required className="sm:col-span-2">
            <Input id="school_name" name="school_name" required maxLength={160} />
          </Field>
        </Section>

        <Section
          title="Contact"
          blurb="A parent or guardian's number is required. The email is not — many students at the centre have none."
        >
          <Field id="phone" label="Student's mobile number">
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              maxLength={13}
              placeholder="9876543210"
            />
          </Field>

          <Field id="email" label="Email">
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              placeholder="Leave blank if they have none"
            />
          </Field>

          <Field id="parent_name" label="Parent or guardian name" required>
            <Input id="parent_name" name="parent_name" required maxLength={120} />
          </Field>

          <Field id="parent_phone" label="Parent or guardian mobile" required>
            <Input
              id="parent_phone"
              name="parent_phone"
              type="tel"
              inputMode="numeric"
              maxLength={13}
              placeholder="9876543210"
              required
            />
          </Field>
        </Section>

        <Section title="Address">
          <Field id="city" label="City" required>
            <Input id="city" name="city" required maxLength={80} />
          </Field>

          <Field id="state" label="State" required>
            <select
              id="state"
              name="state"
              className={SELECT_CLASS}
              defaultValue="Maharashtra"
              required
            >
              <option value="">Select state</option>
              {INDIAN_STATES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field id="pincode" label="PIN code">
            <Input
              id="pincode"
              name="pincode"
              inputMode="numeric"
              maxLength={6}
              placeholder="441501"
            />
          </Field>

          <Field id="address_line" label="Address">
            <Input id="address_line" name="address_line" maxLength={300} />
          </Field>
        </Section>

        <Section
          title="Office use"
          blurb={`Recorded against the student. Registered by ${adminName}.`}
        >
          <Field
            id="registration_date"
            label="Registration date"
            hint="Backdate this for a form collected earlier."
          >
            <Input
              id="registration_date"
              name="registration_date"
              type="date"
              defaultValue={today()}
              max={today()}
            />
          </Field>

          <Field id="admin_notes" label="Notes" className="sm:col-span-2">
            <Textarea
              id="admin_notes"
              name="admin_notes"
              rows={3}
              maxLength={2000}
              placeholder="Anything the team should know about this registration."
            />
          </Field>
        </Section>

        <Section
          title="Enrol in a course"
          blurb={
            canRecordPayment
              ? "Optional. Fill this in to record the cash and enrol them in one step."
              : "Only a super admin or an accountant can record a payment. Register the student, then ask them to record it from Revenue."
          }
        >
          <Field id="course_id" label="Course" className="sm:col-span-2">
            <select
              id="course_id"
              name="course_id"
              className={SELECT_CLASS}
              value={courseId}
              disabled={!canRecordPayment}
              onChange={(event) => pickCourse(event.target.value)}
            >
              <option value="">No enrolment</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title} — {formatINR(Number(course.price))}
                </option>
              ))}
            </select>
          </Field>

          <Field
            id="amount"
            label="Amount collected"
            hint={
              selectedCourse
                ? `Course price is ${formatINR(Number(selectedCourse.price))}.`
                : undefined
            }
          >
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              value={amount}
              disabled={!canRecordPayment || !courseId}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>

          <Field id="payment_method" label="Payment mode">
            <select
              id="payment_method"
              name="payment_method"
              className={SELECT_CLASS}
              defaultValue="manual_cash"
              disabled={!canRecordPayment || !courseId}
            >
              <option value="manual_cash">Cash</option>
              <option value="manual_upi">UPI</option>
              <option value="manual_bank">Bank transfer / cheque</option>
            </select>
          </Field>

          <Field id="receipt_number" label="Receipt number">
            <Input
              id="receipt_number"
              name="receipt_number"
              maxLength={60}
              disabled={!canRecordPayment || !courseId}
            />
          </Field>

          <Field
            id="validity_days"
            label="Validity (days)"
            hint={
              selectedCourse?.validity_days
                ? `The course grants ${selectedCourse.validity_days} days.`
                : "Defaults to the course's own validity."
            }
          >
            <Input
              id="validity_days"
              name="validity_days"
              inputMode="numeric"
              value={validityDays}
              disabled={!canRecordPayment || !courseId}
              onChange={(event) => setValidityDays(event.target.value)}
            />
          </Field>
        </Section>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={pending}
            className="bg-brand-orange text-white hover:bg-brand-orange-dark"
          >
            {pending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-1.5 h-4 w-4" />
            )}
            {pending ? "Registering…" : "Register student"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            render={<Link href="/admin/students" />}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-xl border border-border bg-card p-5">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {blurb && <p className="mb-4 text-sm text-muted-foreground">{blurb}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="text-brand-orange">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RegistrationComplete({
  result,
  onRegisterAnother,
  onOpenStudent,
}: {
  result: OfflineRegistrationResult;
  onRegisterAnother: () => void;
  onOpenStudent: () => void;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const copy = async (value: string, what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy. Read it out instead.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="h-6 w-6 text-emerald-600" />
        </div>
        <h1 className="text-xl font-semibold">{result.fullName} is registered</h1>

        {result.studentCode && (
          <>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Student code
            </p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-widest">
              {result.studentCode}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void copy(result.studentCode!, "code")}
            >
              {copied === "code" ? (
                <Check className="mr-1.5 h-4 w-4" />
              ) : (
                <Copy className="mr-1.5 h-4 w-4" />
              )}
              {copied === "code" ? "Copied" : "Copy code"}
            </Button>
          </>
        )}
      </div>

      {result.enrolment && (
        <div className="rounded-xl border border-border bg-card p-5 text-sm">
          <p className="font-medium">Enrolled and paid</p>
          <p className="mt-1 text-muted-foreground">
            {result.enrolment.courseTitle} — {formatINR(result.enrolment.amount)}{" "}
            recorded against order {result.enrolment.orderId.slice(0, 8)}. It
            appears in Revenue under Orders.
          </p>
        </div>
      )}

      {result.enrolmentError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 text-sm"
        >
          <p className="font-medium">The payment was not recorded</p>
          <p className="mt-1 text-muted-foreground">{result.enrolmentError}</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-medium">Getting them signed in</p>

        {result.emailIsPlaceholder ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No email was given, so the account is on a placeholder address
            ({result.email}). Add a real one from the student&apos;s record when
            you have it — until then they cannot be sent a password link.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {result.emailed
              ? `A set-your-password link has been emailed to ${result.email}.`
              : `Email is not configured yet, so nothing was sent to ${result.email}. Share the link below instead.`}
          </p>
        )}

        {result.passwordLink && (
          <div className="mt-4 space-y-2">
            <Label htmlFor="password-link">Set-your-password link</Label>
            <div className="flex gap-2">
              <Input
                id="password-link"
                readOnly
                value={result.passwordLink}
                className="font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                variant="outline"
                onClick={() => void copy(result.passwordLink!, "link")}
              >
                {copied === "link" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Valid for 24 hours. The student is usually standing right here, so
              WhatsApp is faster than email.
            </p>
          </div>
        )}

        {result.reusedExistingAccount && (
          <p className="mt-4 text-xs text-muted-foreground">
            This email already had a Dream Edge account, so the new record was
            linked to it rather than a second one being created.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          className="bg-brand-orange text-white hover:bg-brand-orange-dark"
          onClick={onRegisterAnother}
        >
          <UserPlus className="mr-1.5 h-4 w-4" />
          Register another
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print receipt
        </Button>
        <Button variant="ghost" onClick={onOpenStudent}>
          Go to students
        </Button>
      </div>
    </div>
  );
}
