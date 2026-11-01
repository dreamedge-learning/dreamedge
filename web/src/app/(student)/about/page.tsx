import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GraduationCap, Target, Lightbulb, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "About Dream Edge",
  description:
    "The team behind Dream Edge Online — Dream IIT Institute, Nagpur. IITian mentors building a concept-first learning platform for Classes 6–10.",
};

const PILLARS = [
  {
    icon: Target,
    title: "Strong Concepts",
    body: "We teach the why before the what. No shortcuts, no rote formulae — a foundation that holds up through JEE and NEET.",
  },
  {
    icon: Lightbulb,
    title: "Logical Thinking",
    body: "Every chapter is built around problem-solving patterns, not question lists. Students learn to recognise structure.",
  },
  {
    icon: GraduationCap,
    title: "Smart Learning",
    body: "Short, dense lessons. Spaced revision. Tests calibrated to CBSE and State Board patterns. Nothing filler.",
  },
  {
    icon: Users,
    title: "Future Ready",
    body: "Classes 6–10 is where the gap between students opens up. We close it before competitive exams start to matter.",
  },
];

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-brand-orange/5 to-transparent">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 md:py-24 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-orange">
            About Dream Edge
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Basic Concept Se Top Result TK
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Dream Edge is the online arm of{" "}
            <span className="font-semibold text-foreground">
              Dream IIT Institute
            </span>
            , Kalmeshwar — a coaching centre that has mentored over 5,000
            students for Classes 6–12 and JEE / NEET. We built this platform so
            that every student with a phone and a dream can learn from the same
            mentors, on their own schedule, at a price that makes sense.
          </p>
        </div>
      </section>

      {/* Mentor */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-20 lg:px-8">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-gradient-to-br from-brand-orange/20 to-brand-blue/20">
              <Image
                src="/logo.jpg"
                alt="Rahul Sir, founder, Dream IIT Institute"
                fill
                sizes="(max-width: 768px) 80vw, 320px"
                className="object-contain p-6"
              />
            </div>
          </div>
          <div className="md:col-span-3">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-orange">
              Mentor
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
              Rahul Sir
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Founder, Dream IIT Institute · IITian · Chemical Engineer ·
              Government Officer
            </p>
            <div className="mt-4 space-y-4 text-base leading-7 text-foreground/80">
              <p>
                Rahul Sir studied Chemical Engineering at IIT Dhanbad, served as
                a Government Officer, and has spent the last eight years
                teaching Classes 6–12 students in and around Nagpur. More than
                5,000 students have been mentored at Dream IIT.
              </p>
              <p>
                His approach is simple: every student can master every topic if
                the concept is explained the right way. No topic is skipped. No
                student is left behind. The same classroom now runs online for
                anyone who needs it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
              What we stand for
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Four non-negotiables that shape every course on this platform.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-orange/10 text-brand-orange">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 md:py-20 lg:px-8">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
          Ready to build a foundation that actually lasts?
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          Browse our courses and start with a chapter for free.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button
            size="lg"
            className="rounded-full bg-brand-orange px-8 text-white hover:bg-brand-orange-dark"
            render={<Link href="/courses" />}
          >
            Explore Courses
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full px-8"
            render={<Link href="/contact" />}
          >
            Talk to Us
          </Button>
        </div>
      </section>
    </div>
  );
}
