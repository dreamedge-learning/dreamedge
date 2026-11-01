import Image from "next/image";
import Link from "next/link";
import { Award, GraduationCap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MentorStrip() {
  return (
    <section className="relative overflow-hidden bg-brand-blue text-white">
      {/* decorative gradients */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-20 top-0 h-96 w-96 rounded-full bg-brand-orange/20 blur-3xl" />
        <div className="absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-brand-orange/10 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-5 md:py-20 lg:px-8">
        {/* Portrait */}
        <div className="md:col-span-2">
          <div className="relative mx-auto aspect-square w-full max-w-sm">
            <div className="absolute inset-0 rotate-3 rounded-3xl bg-brand-orange" />
            <div className="absolute inset-0 overflow-hidden rounded-3xl bg-white p-6 shadow-2xl">
              <Image
                src="/logo.jpg"
                alt="Rahul Sir, founder & lead mentor"
                fill
                sizes="(min-width: 768px) 400px, 320px"
                className="object-contain p-6"
              />
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="md:col-span-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-orange">
            Meet your mentor
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Rahul Sir —
            <br />
            <span className="text-brand-orange">IIT Dhanbad&apos;25</span>, 8+ yrs teaching
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80">
            Chemical Engineer. Government Officer. Founder of Dream IIT
            Institute, Kalmeshwar. Rahul Sir has mentored 5,000+ students
            through Classes 6–12 and competitive exams. Every lesson on Dream
            Edge is designed around his teaching style — concept first, then
            problems, then speed.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-4 border-y border-white/10 py-5">
            <MentorStat icon={GraduationCap} value="IIT Dhanbad" label="alumnus" />
            <MentorStat icon={Users} value="5,000+" label="mentored at Dream IIT" />
            <MentorStat icon={Award} value="100% concept" label="never rote" />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              className="rounded-full bg-brand-orange text-white hover:bg-brand-orange-dark"
              render={<Link href="/about" />}
            >
              Read the full story
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-white/30 bg-transparent text-white hover:bg-white/10"
              render={<Link href="/courses" />}
            >
              Browse his courses
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MentorStat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: string;
  label: string;
}) {
  return (
    <div>
      <Icon className="h-5 w-5 text-brand-orange" />
      <p className="mt-2 text-lg font-bold leading-tight sm:text-xl">{value}</p>
      <p className="text-xs uppercase tracking-wider text-white/60">{label}</p>
    </div>
  );
}
