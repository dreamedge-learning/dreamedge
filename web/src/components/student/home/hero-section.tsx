import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Award, Play, Sparkles, Star, Users } from "lucide-react";

const CHIPS = [
  { icon: Users, label: "5,000+ mentored at Dream IIT" },
  { icon: Award, label: "IITian mentor · 8+ yrs teaching" },
  { icon: Sparkles, label: "100% concept-based" },
];

interface HeroSectionProps {
  /** Title of a class that is live right now, if any. */
  liveClassTitle?: string;
}

export function HeroSection({ liveClassTitle }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-background">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand-orange/10 blur-3xl dark:bg-brand-orange/5" />
        <div className="absolute -bottom-40 -left-24 h-[26rem] w-[26rem] rounded-full bg-brand-blue/10 blur-3xl dark:bg-brand-blue/5" />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,theme(colors.foreground/0.04)_1px,transparent_0)] [background-size:24px_24px]"
        />
      </div>

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-5 md:py-24 lg:px-8 lg:py-28 lg:gap-16">
        {/* Text column */}
        <div className="md:col-span-3 flex flex-col items-start">
          {/* Rating/trust chip above title */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-orange/30 bg-brand-orange/5 px-3 py-1 text-xs font-semibold text-brand-orange">
            <span className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-3 w-3 fill-brand-orange text-brand-orange" />
              ))}
            </span>
            Loved by students across Nagpur · Trusted since 2017
          </div>

          <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-[4rem]">
            Build the foundation
            <br />
            that <span className="relative inline-block text-brand-orange">
              never breaks.
              <svg
                aria-hidden
                viewBox="0 0 200 10"
                className="absolute left-0 right-0 top-full -mt-1 w-full"
              >
                <path
                  d="M2 7 Q 50 1, 100 5 T 198 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Concept-first coaching for Classes 6–10 — the way Dream IIT
            Institute has taught over 5,000 students in Nagpur. Now online,
            at prices that make sense.
          </p>

          {/* CTA buttons */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="rounded-full bg-brand-orange px-8 text-base text-white shadow-lg shadow-brand-orange/25 hover:bg-brand-orange-dark"
              render={<Link href="/courses" />}
            >
              Explore Courses
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full border-border px-8 text-base text-foreground hover:bg-accent"
              render={<Link href="/login" />}
            >
              <Play className="mr-2 h-4 w-4 fill-brand-orange text-brand-orange" />
              Start Free Trial
            </Button>
          </div>

          {/* Social-proof chips */}
          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
            {CHIPS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground/70"
              >
                <Icon className="h-4 w-4 text-brand-orange" />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Illustration column */}
        <div className="md:col-span-2">
          <div className="relative mx-auto aspect-square w-full max-w-sm">
            {/* Rotated gradient card behind logo */}
            <div className="absolute inset-0 rotate-6 rounded-[2rem] bg-gradient-to-br from-brand-orange/90 to-brand-orange-dark shadow-2xl shadow-brand-orange/30" />
            <div className="absolute inset-0 -rotate-3 rounded-[2rem] bg-brand-blue shadow-2xl shadow-brand-blue/30" />
            <div className="relative flex h-full items-center justify-center overflow-hidden rounded-[2rem] bg-background p-8 shadow-xl ring-1 ring-border">
              <Image
                src="/logo.jpg"
                alt="Dream Edge logo"
                fill
                sizes="(min-width: 768px) 400px, 300px"
                priority
                className="object-contain p-10"
              />
            </div>

            {/* Floating "live class" chip — only while a class is actually live */}
            {liveClassTitle ? (
              <div className="absolute -right-4 top-6 hidden max-w-[14rem] rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold shadow-lg sm:block">
                <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 align-middle" />
                <span className="align-middle">Live now — {liveClassTitle}</span>
              </div>
            ) : null}

            {/* Floating "A+" chip */}
            <div className="absolute -left-4 bottom-6 hidden rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold shadow-lg sm:block">
              <span className="mr-1.5 text-brand-orange">A+</span>
              <span className="text-muted-foreground">in Maths — 92%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="relative border-y border-border bg-muted/40 dark:bg-white/[0.02]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-6 px-4 py-8 sm:grid-cols-4 sm:gap-x-6 sm:px-6 lg:px-8">
          <StatCell value="5,000+" label="mentored at Dream IIT" />
          <StatCell value="8+ yrs" label="of teaching" />
          <StatCell value="100%" label="concept-based" />
          <StatCell value="24/7" label="doubt support" />
        </div>
      </div>
    </section>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center sm:text-left">
      <p className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:text-sm">
        {label}
      </p>
    </div>
  );
}
