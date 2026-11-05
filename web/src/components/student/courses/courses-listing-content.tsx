"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, BookOpen, X, SlidersHorizontal } from "lucide-react";
import { CourseCard } from "@/components/student/course-card";
import { Badge } from "@/components/ui/badge";
import type { Course } from "@/types/course";

type SortOption = "popular" | "newest" | "price_asc" | "price_desc" | "rating";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "popular", label: "Most Popular" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Highest Rated" },
];

interface CoursesListingContentProps {
  courses: Course[];
  classes: string[];
  subjects: string[];
  initialFilters: {
    class?: string;
    subject?: string;
    q?: string;
  };
}

export function CoursesListingContent({
  courses,
  classes,
  subjects,
  initialFilters,
}: CoursesListingContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(initialFilters.q ?? "");
  const [selectedClass, setSelectedClass] = useState(initialFilters.class ?? "");
  const [selectedSubject, setSelectedSubject] = useState(initialFilters.subject ?? "");
  const [sort, setSort] = useState<SortOption>("popular");
  const [debounced, setDebounced] = useState(query);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(value), 300);
  }, []);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      debounceTimer(value);
    },
    [debounceTimer]
  );

  const updateUrl = useCallback(
    (cls: string, sub: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (cls) params.set("class", cls);
      else params.delete("class");
      if (sub) params.set("subject", sub);
      else params.delete("subject");
      router.replace(`/courses?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleClassChange = useCallback(
    (value: string) => {
      setSelectedClass(value);
      updateUrl(value, selectedSubject);
    },
    [updateUrl, selectedSubject]
  );

  const handleSubjectChange = useCallback(
    (value: string) => {
      setSelectedSubject(value);
      updateUrl(selectedClass, value);
    },
    [updateUrl, selectedClass]
  );

  const clearFilters = useCallback(() => {
    setQuery("");
    setDebounced("");
    setSelectedClass("");
    setSelectedSubject("");
    setSort("popular");
    router.replace("/courses", { scroll: false });
  }, [router]);

  const hasActiveFilters = selectedClass || selectedSubject || debounced;

  const filtered = useMemo(() => {
    let result = [...courses];

    if (debounced) {
      const q = debounced.toLowerCase();
      result = result.filter((c) => c.title.toLowerCase().includes(q));
    }
    if (selectedClass) {
      result = result.filter((c) => c.class === selectedClass);
    }
    if (selectedSubject) {
      result = result.filter((c) => c.subject === selectedSubject);
    }

    switch (sort) {
      case "newest":
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "price_asc":
        result.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        result.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        // Unrated courses last; between equal averages, the one more
        // students have rated is the safer bet.
        result.sort(
          (a, b) =>
            (b.rating_avg ?? 0) - (a.rating_avg ?? 0) ||
            (b.rating_count ?? 0) - (a.rating_count ?? 0)
        );
        break;
      default:
        result.sort((a, b) => b.student_count - a.student_count);
    }

    return result;
  }, [courses, debounced, selectedClass, selectedSubject, sort]);

  if (courses.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-10">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">All Courses</h1>
          <p className="mt-2 text-muted-foreground">
            Explore our courses designed for Classes 6–10
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-orange/10">
            <BookOpen className="h-8 w-8 text-brand-orange" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Courses coming soon!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;re preparing amazing courses. Check back shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-brand-orange/5 via-background to-brand-blue/5 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Browse all courses
          </h1>
          <Badge variant="secondary" className="tabular-nums">
            {filtered.length} {filtered.length === 1 ? "course" : "courses"}
          </Badge>
        </div>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
          Concept-first foundation courses for Classes 6–10, built on the same
          system Dream IIT Institute uses offline.
        </p>
      </div>

      {/* Class pill filters — quick-pick row */}
      {classes.length > 0 && (
        <div className="mb-6 -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => handleClassChange("")}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedClass === ""
                ? "border-brand-orange bg-brand-orange text-white"
                : "border-border bg-card text-foreground/70 hover:border-brand-orange/40 hover:text-foreground"
            }`}
          >
            All classes
          </button>
          {classes.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => handleClassChange(c)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                selectedClass === c
                  ? "border-brand-orange bg-brand-orange text-white"
                  : "border-border bg-card text-foreground/70 hover:border-brand-orange/40 hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Filter Bar */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search courses..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-orange focus:ring-1 focus:ring-brand-orange"
          />
        </div>

        <select
          value={selectedClass}
          onChange={(e) => handleClassChange(e.target.value)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-brand-orange"
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={selectedSubject}
          onChange={(e) => handleSubjectChange(e.target.value)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-brand-orange"
        >
          <option value="">All Subjects</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-brand-orange"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {selectedClass && (
            <Badge variant="secondary" className="gap-1 pl-2.5">
              {selectedClass}
              <button
                onClick={() => handleClassChange("")}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {selectedSubject && (
            <Badge variant="secondary" className="gap-1 pl-2.5">
              {selectedSubject}
              <button
                onClick={() => handleSubjectChange("")}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {debounced && (
            <Badge variant="secondary" className="gap-1 pl-2.5">
              &ldquo;{debounced}&rdquo;
              <button
                onClick={() => { setQuery(""); setDebounced(""); }}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <button
            onClick={clearFilters}
            className="text-xs font-medium text-brand-orange hover:text-brand-orange-dark"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Course Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((course) => (
            <CourseCard
              key={course.id}
              id={course.id}
              title={course.title}
              slug={course.slug}
              thumbnailUrl={course.thumbnail_url}
              price={course.price}
              originalPrice={course.original_price}
              className={course.class}
              subject={course.subject}
              teacherName={course.teacher_name}
              studentCount={course.student_count}
              ratingAvg={course.rating_avg}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No courses found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your filters
          </p>
          <button
            onClick={clearFilters}
            className="mt-4 rounded-lg bg-brand-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-orange-dark"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
