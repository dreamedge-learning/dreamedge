import { Suspense } from "react";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import {
  FeedbackClient,
} from "@/components/admin/engage/feedback-client";
import { fetchFeedback } from "./actions";

export const metadata: Metadata = {
  title: "Feedback | Dream Edge Admin",
};

function FeedbackSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-lg" />
      ))}
    </div>
  );
}

async function FeedbackLoader() {
  const result = await fetchFeedback();
  return <FeedbackClient initialData={result.data ?? []} loadError={result.error} />;
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={<FeedbackSkeleton />}>
      <FeedbackLoader />
    </Suspense>
  );
}
