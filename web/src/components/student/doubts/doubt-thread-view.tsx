"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import type { DoubtThread } from "@/lib/doubts";

import { DoubtThreadCard } from "./doubt-thread-card";

/** The thread page's body: holds the thread so a follow-up shows at once. */
export function DoubtThreadView({ initialThread }: { initialThread: DoubtThread }) {
  const [thread, setThread] = useState(initialThread);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/dashboard/doubts"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        My doubts
      </Link>
      <DoubtThreadCard thread={thread} onUpdated={setThread} showLesson />
    </div>
  );
}
