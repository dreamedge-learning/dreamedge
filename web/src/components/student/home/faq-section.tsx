"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import Link from "next/link";

/**
 * Built per render from the live support address, so the FAQ never tells a
 * parent to write to an inbox the panel has since replaced.
 */
function faqs(supportEmail: string) {
  return [
  {
    q: "Which classes does Dream Edge cover?",
    a: "Classes 6, 7, 8, 9, and 10 — CBSE and State Board — across Maths, Science, Social Science, and English. We start with Maths and roll out other subjects course by course.",
  },
  {
    q: "Is this live classes or recorded lessons?",
    a: "Both. Scheduled live classes run through our in-app player, and every live class is edited and uploaded as a 'rewatch' within 3–4 hours, so you can revise any topic later. Full test series + notes are included.",
  },
  {
    q: "How are the courses different from YouTube?",
    a: "The lessons are built around a concept-first system (the same one Dream IIT Institute has used for 5,000+ students), there's a structured syllabus with tests, you can ask doubts, and your progress is tracked. YouTube videos are great for one-off topics; this is a full coaching program.",
  },
  {
    q: "What devices can I use?",
    a: "The Dream Edge website works on any modern browser (phone, laptop, tablet). The Android app will be on Play Store at launch. iOS app follows in Phase 2.",
  },
  {
    q: "Can I get a refund if I don't like the course?",
    a: "Yes — a full refund within 7 days of purchase as long as you've consumed less than 20% of the course content. Full policy on the Refund Policy page.",
  },
  {
    q: "Who teaches on Dream Edge?",
    a: "Rahul Sir (IIT Dhanbad, 8+ years teaching) leads mentoring, with support from the Dream IIT Institute teaching team. Every teacher is vetted on both subject expertise and ability to explain to a 12-year-old.",
  },
  {
    q: "How do I pay? Is it safe?",
    a: "Payments go through Razorpay (UPI, cards, net banking, wallets). We don't see or store your card number or UPI PIN. Every purchase gets an invoice emailed to you.",
  },
  {
    q: "I have more questions.",
    a: `Email ${supportEmail} or use the contact form. We respond within one working day.`,
  },
  ];
}

export function FaqSection({ supportEmail }: { supportEmail: string }) {
  const FAQS = faqs(supportEmail);

  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bg-muted/30 py-16 sm:py-20 lg:py-24 dark:bg-white/[0.02]">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <HelpCircle className="mx-auto h-9 w-9 text-brand-orange" />
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-muted-foreground">
            Still something unclear? Drop us a line through{" "}
            <Link
              href="/contact"
              className="text-brand-orange underline underline-offset-4 hover:text-brand-orange-dark"
            >
              Contact
            </Link>
            .
          </p>
        </div>

        <div className="mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50 sm:px-6 sm:py-5"
                >
                  <span className="text-sm font-semibold text-foreground sm:text-base">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? "rotate-180 text-brand-orange" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground sm:px-6 sm:pb-6 sm:text-base">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
