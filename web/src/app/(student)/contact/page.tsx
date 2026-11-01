import type { Metadata } from "next";
import { Mail, Phone, MapPin, Clock } from "lucide-react";
import { ContactForm } from "@/components/student/contact-form";
import { SUPPORT_EMAIL, SUPPORT_HOURS, SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Dream Edge",
  description:
    "Get in touch with the Dream Edge team. Reach us by email, phone, or drop a message — we respond within one working day.",
};

const CHANNELS = [
  {
    icon: Mail,
    label: "Email us",
    value: SUPPORT_EMAIL,
    href: `mailto:${SUPPORT_EMAIL}`,
    note: "Fastest route for course or payment questions.",
  },
  {
    icon: Phone,
    label: "Call us",
    value: SUPPORT_PHONE,
    href: SUPPORT_PHONE_HREF,
    note: `${SUPPORT_HOURS}.`,
  },
  {
    icon: MapPin,
    label: "Visit us",
    value: "Dream IIT Institute, Kalmeshwar, Nagpur, Maharashtra, India",
    href: null,
    note: "Our offline centre, open for enrolment visits.",
  },
  {
    icon: Clock,
    label: "Response time",
    value: "Within 1 working day",
    href: null,
    note: "Weekends and holidays may take longer.",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
      <header className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Talk to us
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Questions about a course, payment, or anything else — we&apos;re
          listening.
        </p>
      </header>

      <div className="mt-12 grid gap-10 md:grid-cols-5">
        {/* Left: form */}
        <div className="md:col-span-3">
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-foreground">
              Send a message
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Fill the form and we&apos;ll reply by email.
            </p>
            <div className="mt-6">
              <ContactForm />
            </div>
          </div>
        </div>

        {/* Right: channels */}
        <div className="md:col-span-2">
          <div className="space-y-4">
            {CHANNELS.map(({ icon: Icon, label, value, href, note }) => (
              <div
                key={label}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-orange/10 text-brand-orange">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {label}
                    </p>
                    {href ? (
                      <a
                        href={href}
                        className="mt-1 block break-words text-sm font-medium text-foreground hover:text-brand-orange"
                      >
                        {value}
                      </a>
                    ) : (
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {value}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {note}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
