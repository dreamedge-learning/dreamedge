"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INDIAN_STATES } from "@/lib/constants/indian-states";
import {
  completeOnboarding,
  saveOnboardingStep,
} from "@/app/(student)/onboarding/actions";
import {
  FIELD_STEP,
  GENDER_OPTIONS,
  ONBOARDING_FIELDS,
  ONBOARDING_STEPS,
  STUDENT_BOARDS,
  STUDENT_CLASSES,
  onboardingStepSchemas,
  studentProfileSchema,
  type OnboardingField,
  type OnboardingStep,
} from "@/lib/validations/onboarding";

/**
 * The mandatory profile, in four steps.
 *
 * Most students fill this on a phone, often a parent's, in one sitting at the
 * centre or at home — hence 44px controls, numeric keypads on the number
 * fields, and a layout that does not scroll sideways at 360px.
 *
 * Each step saves as it is left. A student who stops at step 3 and comes back
 * tomorrow finds steps 1 and 2 still filled; `profile_completed` stays false
 * until the review screen, so a half-filled profile never opens the gate.
 */

type Values = Record<OnboardingField, string>;

interface FieldError {
  field: OnboardingField;
  message: string;
}

export interface OnboardingFormProps {
  initialValues: Values;
  /** The address the student signs in with; never changed by this form. */
  signInEmail: string | null;
  /** True when `students.email` holds an address we invented, not theirs. */
  emailIsPlaceholder: boolean;
  /** Where to send the student once the profile is complete. */
  next: string;
}

const STEP_TITLES: Record<OnboardingStep, string> = {
  student: "About you",
  academics: "Your school",
  contact: "How we reach you",
  location: "Where you are",
};

const STEP_BLURBS: Record<OnboardingStep, string> = {
  student: "The name that should appear on your certificates.",
  academics: "So your course list matches what you are studying this year.",
  contact: "A parent or guardian's number is required — we use it for fee and class updates.",
  location: "Helps us plan centres and offline test venues.",
};

const FIELD_LABELS: Record<OnboardingField, string> = {
  full_name: "Full name",
  date_of_birth: "Date of birth",
  gender: "Gender",
  class: "Current class",
  board: "Board",
  school_name: "School name",
  phone: "Your mobile number",
  parent_name: "Parent or guardian name",
  parent_phone: "Parent or guardian mobile number",
  email: "Contact email",
  city: "City",
  state: "State",
  pincode: "PIN code",
  address_line: "Address",
};

const REQUIRED_FIELDS: OnboardingField[] = [
  "full_name",
  "class",
  "board",
  "school_name",
  "parent_name",
  "parent_phone",
  "city",
  "state",
];

const CONTROL = "h-11 text-base";
const SELECT_CONTROL =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none " +
  "aria-[invalid=true]:border-destructive";

function stepFields(step: OnboardingStep): OnboardingField[] {
  return ONBOARDING_FIELDS.filter((field) => FIELD_STEP[field] === step);
}

export function OnboardingForm({
  initialValues,
  signInEmail,
  emailIsPlaceholder,
  next,
}: OnboardingFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initialValues);
  const [stepIndex, setStepIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<OnboardingField, string>>>({});
  const [summary, setSummary] = useState<FieldError[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [studentCode, setStudentCode] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const step = ONBOARDING_STEPS[stepIndex];

  // Focus follows the step, so a keyboard or screen-reader user lands on the
  // new heading instead of being left at the bottom of the previous step.
  useEffect(() => {
    headingRef.current?.focus();
  }, [stepIndex, reviewing]);

  useEffect(() => {
    if (summary.length > 0) summaryRef.current?.focus();
  }, [summary]);

  const setValue = useCallback((field: OnboardingField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  }, []);

  /** One field, checked as the student leaves it. */
  const validateField = useCallback(
    (field: OnboardingField) => {
      const owningStep = FIELD_STEP[field];
      const subject = Object.fromEntries(
        stepFields(owningStep).map((key) => [key, values[key]])
      );

      const parsed = onboardingStepSchemas[owningStep].safeParse(subject);
      const issue = parsed.success
        ? undefined
        : parsed.error.issues.find((candidate) => candidate.path[0] === field);

      setErrors((current) => {
        const nextErrors = { ...current };
        if (issue) nextErrors[field] = issue.message;
        else delete nextErrors[field];
        return nextErrors;
      });
    },
    [values]
  );

  const persist = useCallback(
    async (target: OnboardingStep) => {
      const formData = new FormData();
      for (const field of stepFields(target)) {
        formData.set(field, values[field]);
      }

      setSaving(true);
      const result = await saveOnboardingStep(target, formData);
      setSaving(false);

      if (result.error) {
        toast.error(result.error);
        return false;
      }

      return true;
    },
    [values]
  );

  const goNext = useCallback(async () => {
    const subject = Object.fromEntries(
      stepFields(step).map((key) => [key, values[key]])
    );
    const parsed = onboardingStepSchemas[step].safeParse(subject);

    if (!parsed.success) {
      const found: FieldError[] = parsed.error.issues.map((issue) => ({
        field: issue.path[0] as OnboardingField,
        message: issue.message,
      }));

      setErrors(
        Object.fromEntries(found.map((item) => [item.field, item.message]))
      );
      setSummary(found);
      return;
    }

    setSummary([]);
    if (!(await persist(step))) return;

    if (stepIndex === ONBOARDING_STEPS.length - 1) {
      setReviewing(true);
      return;
    }

    setStepIndex(stepIndex + 1);
  }, [persist, step, stepIndex, values]);

  const goBack = useCallback(() => {
    setSummary([]);
    if (reviewing) {
      setReviewing(false);
      return;
    }
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }, [reviewing, stepIndex]);

  const editStep = useCallback((target: OnboardingStep) => {
    setSummary([]);
    setReviewing(false);
    setStepIndex(ONBOARDING_STEPS.indexOf(target));
  }, []);

  const submit = useCallback(async () => {
    const parsed = studentProfileSchema.safeParse(values);

    if (!parsed.success) {
      const found: FieldError[] = parsed.error.issues.map((issue) => ({
        field: issue.path[0] as OnboardingField,
        message: issue.message,
      }));
      setErrors(Object.fromEntries(found.map((item) => [item.field, item.message])));
      setSummary(found);
      // Send them to the earliest step that still has a problem rather than
      // leaving an error pointing at a field they cannot see.
      const firstStep = found
        .map((item) => ONBOARDING_STEPS.indexOf(FIELD_STEP[item.field]))
        .sort((a, b) => a - b)[0];
      setReviewing(false);
      setStepIndex(firstStep);
      return;
    }

    const formData = new FormData();
    for (const field of ONBOARDING_FIELDS) formData.set(field, values[field]);

    setSubmitting(true);
    const result = await completeOnboarding(formData);
    setSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setStudentCode(result.data?.studentCode ?? null);
  }, [values]);

  const progress = useMemo(
    () => (reviewing ? ONBOARDING_STEPS.length : stepIndex),
    [reviewing, stepIndex]
  );

  // The outer element is a real <form>: a four-step form filled mostly on
  // phones needs the mobile keyboard's Go key and desktop Enter to advance,
  // and neither fires without one. Buttons inside stay `type="button"` so
  // only the explicit submit handler drives Continue/Finish -- it dispatches
  // to goNext or submit by current state. Enter inside a textarea is
  // deliberately left alone; the form has no textareas today.
  //
  // Declared before the completion-panel early return so React's hook rules
  // see this `useCallback` on every render.
  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (saving || submitting) return;
      if (reviewing) void submit();
      else void goNext();
    },
    [goNext, reviewing, saving, submit, submitting]
  );

  if (studentCode !== null) {
    return (
      <CompletionPanel
        studentCode={studentCode}
        onContinue={() => {
          router.push(next);
          router.refresh();
        }}
      />
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-[560px] px-4 py-8 sm:py-12"
      noValidate
    >
      <header className="mb-6 text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-orange">
          <span className="text-lg font-bold tracking-tight text-white">DE</span>
        </div>
        <h1 className="text-xl font-semibold sm:text-2xl">Complete your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A few details before you start. This takes about two minutes.
        </p>
      </header>

      <StepIndicator current={progress} />

      <div className="mt-5 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        {summary.length > 0 && (
          <div
            ref={summaryRef}
            tabIndex={-1}
            role="alert"
            className="mb-5 rounded-lg border border-destructive/40 bg-destructive/5 p-4 outline-none"
          >
            <p className="text-sm font-medium text-destructive">
              {summary.length === 1
                ? "One field needs your attention"
                : `${summary.length} fields need your attention`}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {summary.map((item) => (
                <li key={item.field}>
                  <a
                    href={`#${item.field}`}
                    className="text-destructive underline underline-offset-2"
                    onClick={(event) => {
                      event.preventDefault();
                      editStep(FIELD_STEP[item.field]);
                      // The field only exists once its step is on screen.
                      window.setTimeout(
                        () => document.getElementById(item.field)?.focus(),
                        0
                      );
                    }}
                  >
                    {FIELD_LABELS[item.field]}: {item.message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {reviewing ? (
          <ReviewPanel
            values={values}
            headingRef={headingRef}
            onEdit={editStep}
          />
        ) : (
          <fieldset className="border-0 p-0">
            <legend className="sr-only">{STEP_TITLES[step]}</legend>

            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-lg font-semibold outline-none"
            >
              {STEP_TITLES[step]}
            </h2>
            <p className="mt-1 mb-5 text-sm text-muted-foreground">
              {STEP_BLURBS[step]}
            </p>

            <div className="space-y-4">
              {step === "student" && (
                <StudentStep
                  values={values}
                  errors={errors}
                  setValue={setValue}
                  onBlur={validateField}
                />
              )}
              {step === "academics" && (
                <AcademicsStep
                  values={values}
                  errors={errors}
                  setValue={setValue}
                  onBlur={validateField}
                />
              )}
              {step === "contact" && (
                <ContactStep
                  values={values}
                  errors={errors}
                  setValue={setValue}
                  onBlur={validateField}
                  signInEmail={signInEmail}
                  emailIsPlaceholder={emailIsPlaceholder}
                />
              )}
              {step === "location" && (
                <LocationStep
                  values={values}
                  errors={errors}
                  setValue={setValue}
                  onBlur={validateField}
                />
              )}
            </div>
          </fieldset>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={goBack}
            disabled={(stepIndex === 0 && !reviewing) || saving || submitting}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          {reviewing ? (
            <Button
              type="button"
              className="h-11 bg-brand-orange text-white hover:bg-brand-orange-dark"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {submitting ? "Saving…" : "Finish"}
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 bg-brand-orange text-white hover:bg-brand-orange-dark"
              onClick={() => void goNext()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {saving ? "Saving…" : "Continue"}
              {!saving && <ChevronRight className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Fields marked with an asterisk are required. Your answers are saved as
        you go.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

interface StepProps {
  values: Values;
  errors: Partial<Record<OnboardingField, string>>;
  setValue: (field: OnboardingField, value: string) => void;
  onBlur: (field: OnboardingField) => void;
}

function Field({
  field,
  errors,
  children,
  hint,
}: {
  field: OnboardingField;
  errors: Partial<Record<OnboardingField, string>>;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  const error = errors[field];
  const required = REQUIRED_FIELDS.includes(field);

  return (
    <div className="space-y-2">
      <Label htmlFor={field}>
        {FIELD_LABELS[field]}
        {required && (
          <span aria-hidden="true" className="text-brand-orange">
            *
          </span>
        )}
        {required && <span className="sr-only">(required)</span>}
      </Label>
      {children}
      {hint && (
        <p id={`${field}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${field}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(
  field: OnboardingField,
  errors: Partial<Record<OnboardingField, string>>,
  hasHint = false
): string | undefined {
  const parts = [
    hasHint ? `${field}-hint` : null,
    errors[field] ? `${field}-error` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : undefined;
}

function StudentStep({ values, errors, setValue, onBlur }: StepProps) {
  return (
    <>
      <Field field="full_name" errors={errors}>
        <Input
          id="full_name"
          name="full_name"
          className={CONTROL}
          autoComplete="name"
          autoCapitalize="words"
          value={values.full_name}
          aria-invalid={Boolean(errors.full_name)}
          aria-describedby={describedBy("full_name", errors)}
          onChange={(event) => setValue("full_name", event.target.value)}
          onBlur={() => onBlur("full_name")}
        />
      </Field>

      <Field
        field="date_of_birth"
        errors={errors}
        hint="Used on certificates and for age-appropriate courses."
      >
        <Input
          id="date_of_birth"
          name="date_of_birth"
          type="date"
          className={CONTROL}
          value={values.date_of_birth}
          aria-invalid={Boolean(errors.date_of_birth)}
          aria-describedby={describedBy("date_of_birth", errors, true)}
          onChange={(event) => setValue("date_of_birth", event.target.value)}
          onBlur={() => onBlur("date_of_birth")}
        />
      </Field>

      <Field field="gender" errors={errors}>
        <select
          id="gender"
          name="gender"
          className={SELECT_CONTROL}
          value={values.gender}
          aria-invalid={Boolean(errors.gender)}
          aria-describedby={describedBy("gender", errors)}
          onChange={(event) => setValue("gender", event.target.value)}
          onBlur={() => onBlur("gender")}
        >
          <option value="">Prefer not to say</option>
          {GENDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

function AcademicsStep({ values, errors, setValue, onBlur }: StepProps) {
  return (
    <>
      <Field field="class" errors={errors}>
        <select
          id="class"
          name="class"
          className={SELECT_CONTROL}
          value={values.class}
          aria-invalid={Boolean(errors.class)}
          aria-describedby={describedBy("class", errors)}
          onChange={(event) => setValue("class", event.target.value)}
          onBlur={() => onBlur("class")}
        >
          <option value="">Select your class</option>
          {STUDENT_CLASSES.map((option) => (
            <option key={option} value={option}>
              Class {option}
            </option>
          ))}
        </select>
      </Field>

      <Field field="board" errors={errors}>
        <select
          id="board"
          name="board"
          className={SELECT_CONTROL}
          value={values.board}
          aria-invalid={Boolean(errors.board)}
          aria-describedby={describedBy("board", errors)}
          onChange={(event) => setValue("board", event.target.value)}
          onBlur={() => onBlur("board")}
        >
          <option value="">Select your board</option>
          {STUDENT_BOARDS.map((option) => (
            <option key={option} value={option}>
              {option === "State" ? "State Board" : option}
            </option>
          ))}
        </select>
      </Field>

      <Field field="school_name" errors={errors}>
        <Input
          id="school_name"
          name="school_name"
          className={CONTROL}
          autoCapitalize="words"
          value={values.school_name}
          aria-invalid={Boolean(errors.school_name)}
          aria-describedby={describedBy("school_name", errors)}
          onChange={(event) => setValue("school_name", event.target.value)}
          onBlur={() => onBlur("school_name")}
        />
      </Field>
    </>
  );
}

function ContactStep({
  values,
  errors,
  setValue,
  onBlur,
  signInEmail,
  emailIsPlaceholder,
}: StepProps & { signInEmail: string | null; emailIsPlaceholder: boolean }) {
  return (
    <>
      {/*
        Order matches the printed sheet and the admin's counter entry
        form: phone, email, parent name, parent phone. Three places asking
        for the same fields in the same order means an admin typing from
        a paper form can go top-to-bottom without look-ups.
      */}
      <Field
        field="phone"
        errors={errors}
        hint="Leave this blank if you do not have your own phone."
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={13}
          className={CONTROL}
          value={values.phone}
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={describedBy("phone", errors, true)}
          onChange={(event) => setValue("phone", event.target.value)}
          onBlur={() => onBlur("phone")}
        />
      </Field>

      <Field
        field="email"
        errors={errors}
        hint={
          signInEmail
            ? `Changing this does not change how you sign in — that stays ${signInEmail}.`
            : "We will use this for receipts and class updates."
        }
      >
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          className={CONTROL}
          placeholder={emailIsPlaceholder ? "you@example.com" : undefined}
          value={values.email}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email", errors, true)}
          onChange={(event) => setValue("email", event.target.value)}
          onBlur={() => onBlur("email")}
        />
      </Field>

      <Field field="parent_name" errors={errors}>
        <Input
          id="parent_name"
          name="parent_name"
          className={CONTROL}
          autoCapitalize="words"
          value={values.parent_name}
          aria-invalid={Boolean(errors.parent_name)}
          aria-describedby={describedBy("parent_name", errors)}
          onChange={(event) => setValue("parent_name", event.target.value)}
          onBlur={() => onBlur("parent_name")}
        />
      </Field>

      <Field
        field="parent_phone"
        errors={errors}
        hint="This can be the same number as yours."
      >
        <Input
          id="parent_phone"
          name="parent_phone"
          type="tel"
          inputMode="numeric"
          maxLength={13}
          className={CONTROL}
          value={values.parent_phone}
          aria-invalid={Boolean(errors.parent_phone)}
          aria-describedby={describedBy("parent_phone", errors, true)}
          onChange={(event) => setValue("parent_phone", event.target.value)}
          onBlur={() => onBlur("parent_phone")}
        />
      </Field>
    </>
  );
}

function LocationStep({ values, errors, setValue, onBlur }: StepProps) {
  return (
    <>
      <Field field="city" errors={errors}>
        <Input
          id="city"
          name="city"
          className={CONTROL}
          autoCapitalize="words"
          autoComplete="address-level2"
          value={values.city}
          aria-invalid={Boolean(errors.city)}
          aria-describedby={describedBy("city", errors)}
          onChange={(event) => setValue("city", event.target.value)}
          onBlur={() => onBlur("city")}
        />
      </Field>

      <Field field="state" errors={errors}>
        <select
          id="state"
          name="state"
          className={SELECT_CONTROL}
          value={values.state}
          aria-invalid={Boolean(errors.state)}
          aria-describedby={describedBy("state", errors)}
          onChange={(event) => setValue("state", event.target.value)}
          onBlur={() => onBlur("state")}
        >
          <option value="">Select your state</option>
          {INDIAN_STATES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>

      <Field field="pincode" errors={errors}>
        <Input
          id="pincode"
          name="pincode"
          inputMode="numeric"
          maxLength={6}
          autoComplete="postal-code"
          className={CONTROL}
          value={values.pincode}
          aria-invalid={Boolean(errors.pincode)}
          aria-describedby={describedBy("pincode", errors)}
          onChange={(event) => setValue("pincode", event.target.value)}
          onBlur={() => onBlur("pincode")}
        />
      </Field>

      <Field field="address_line" errors={errors}>
        <Input
          id="address_line"
          name="address_line"
          className={CONTROL}
          autoComplete="street-address"
          value={values.address_line}
          aria-invalid={Boolean(errors.address_line)}
          aria-describedby={describedBy("address_line", errors)}
          onChange={(event) => setValue("address_line", event.target.value)}
          onBlur={() => onBlur("address_line")}
        />
      </Field>
    </>
  );
}

// ---------------------------------------------------------------------------
// Review and completion
// ---------------------------------------------------------------------------

function ReviewPanel({
  values,
  headingRef,
  onEdit,
}: {
  values: Values;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onEdit: (step: OnboardingStep) => void;
}) {
  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
        Check your details
      </h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        You can change any of this later from your profile.
      </p>

      <div className="space-y-5">
        {ONBOARDING_STEPS.map((step) => (
          <section key={step}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold">{STEP_TITLES[step]}</h3>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={() => onEdit(step)}
              >
                Edit {STEP_TITLES[step].toLowerCase()}
              </Button>
            </div>
            <dl className="mt-2 divide-y divide-border rounded-lg border border-border">
              {stepFields(step).map((field) => (
                <div
                  key={field}
                  className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 text-sm"
                >
                  <dt className="min-w-[9rem] text-muted-foreground">
                    {FIELD_LABELS[field]}
                  </dt>
                  <dd className="font-medium break-words">
                    {displayValue(field, values[field])}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

function displayValue(field: OnboardingField, value: string): string {
  if (!value) return "—";
  if (field === "class") return `Class ${value}`;
  if (field === "board") return value === "State" ? "State Board" : value;
  if (field === "gender") {
    return GENDER_OPTIONS.find((option) => option.value === value)?.label ?? value;
  }
  return value;
}

function CompletionPanel({
  studentCode,
  onContinue,
}: {
  studentCode: string | null;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!studentCode) return;
    try {
      await navigator.clipboard.writeText(studentCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Write the code down instead.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[480px] px-4 py-12 text-center">
      <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange/10">
        <Check className="h-7 w-7 text-brand-orange" />
      </div>

      <h1 className="text-xl font-semibold sm:text-2xl">You&apos;re all set</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your profile is complete. Keep your student code handy — the Kalmeshwar
        centre uses it on receipts and enquiries.
      </p>

      {studentCode && (
        <div className="mt-6 rounded-xl border border-border bg-muted/40 p-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Your student code
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-wider">
            {studentCode}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-11"
            onClick={() => void copy()}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy code"}
          </Button>
        </div>
      )}

      <Button
        type="button"
        className="mt-6 h-11 w-full bg-brand-orange text-white hover:bg-brand-orange-dark"
        onClick={onContinue}
      >
        Start learning
      </Button>

      <p className="mt-3 text-xs text-muted-foreground">
        You can find this code again on your profile page.
      </p>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  const total = ONBOARDING_STEPS.length;
  const done = Math.min(current, total);

  return (
    <div>
      <ol className="flex items-center gap-1.5" aria-label="Profile steps">
        {ONBOARDING_STEPS.map((step, index) => {
          const state =
            index < done ? "done" : index === done ? "current" : "upcoming";

          return (
            <li key={step} className="flex-1">
              <div
                aria-current={state === "current" ? "step" : undefined}
                className={
                  "h-1.5 rounded-full " +
                  (state === "upcoming" ? "bg-border" : "bg-brand-orange")
                }
              />
              <span className="sr-only">
                {STEP_TITLES[step]}
                {state === "done" ? " (completed)" : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {done >= total
          ? "Review"
          : `Step ${done + 1} of ${total} — ${STEP_TITLES[ONBOARDING_STEPS[done]]}`}
      </p>
    </div>
  );
}
