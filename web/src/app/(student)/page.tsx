import { createClient } from "@/lib/supabase/server";
import { HeroSection } from "@/components/student/home/hero-section";
import { ClassSelector } from "@/components/student/home/class-selector";
import { PopularCourses } from "@/components/student/home/popular-courses";
import { MentorStrip } from "@/components/student/home/mentor-strip";
import { FeaturesSection } from "@/components/student/home/features-section";
import { TestimonialsSection } from "@/components/student/home/testimonials-section";
import { FaqSection } from "@/components/student/home/faq-section";
import { CtaSection } from "@/components/student/home/cta-section";


async function fetchCourses() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("courses")
      .select(
        "id, title, slug, thumbnail_url, price, original_price, class, subject, teacher_name, student_count, rating_avg",
      )
      .eq("is_published", true)
      .order("student_count", { ascending: false })
      .limit(6);
    return data ?? [];
  } catch {
    return [];
  }
}

/**
 * A class that is live at this moment, if any. Drives the hero's live chip —
 * which previously rendered unconditionally and so advertised a live class
 * even when nothing was running.
 */
async function fetchLiveClassTitle(): Promise<string | undefined> {
  try {
    const supabase = await createClient();
    // Visitors are anonymous and have no policy on live_classes; the row also
    // carries meeting_url, so this goes through a function that returns the
    // title and nothing else.
    const { data } = await supabase.rpc("current_live_class_title");
    return data ?? undefined;
  } catch {
    return undefined;
  }
}

async function fetchTestimonials() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("testimonials")
      .select("id, student_name, class, rating, content, student_photo_url")
      .eq("is_visible", true)
      .order("weight", { ascending: false })
      .limit(6);
    // The TestimonialsSection expects `avatar_url`; map the schema column.
    return (data ?? []).map((t) => ({
      id: t.id,
      student_name: t.student_name,
      class: t.class,
      rating: t.rating,
      content: t.content,
      avatar_url: t.student_photo_url,
    }));
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [courses, testimonials, liveClassTitle] = await Promise.all([
    fetchCourses(),
    fetchTestimonials(),
    fetchLiveClassTitle(),
  ]);

  return (
    <>
      <HeroSection liveClassTitle={liveClassTitle} />
      <ClassSelector />
      <PopularCourses courses={courses} />
      <MentorStrip />
      <FeaturesSection />
      <TestimonialsSection testimonials={testimonials} />
      <FaqSection />
      <CtaSection />
    </>
  );
}
