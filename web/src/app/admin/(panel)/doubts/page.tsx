import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { DoubtsInbox } from "@/components/admin/doubts/doubts-inbox";
import { getAdminSession, hasPermission } from "@/lib/admin";
import { DOUBT_READ_ROLES } from "@/lib/doubts";

import { fetchDoubtCourses, fetchDoubtInbox } from "./actions";

export const metadata: Metadata = {
  title: "Doubts | Dream Edge Admin",
};

export default function DoubtsPage() {
  return (
    <Suspense fallback={<DoubtsPageSkeleton />}>
      <DoubtsContent />
    </Suspense>
  );
}

async function DoubtsContent() {
  await connection();
  const admin = await getAdminSession();

  if (!admin || !hasPermission(admin, DOUBT_READ_ROLES)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="max-w-md text-center text-muted-foreground">
          You don&apos;t have permission to view student doubts. Contact your
          administrator if you need access.
        </p>
      </div>
    );
  }

  // Opens on the unanswered queue: that is the work, and the other states
  // are a click away.
  const [inbox, courses] = await Promise.all([
    fetchDoubtInbox({ status: "open" }),
    fetchDoubtCourses(),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Doubts</h1>
        <p className="mt-1 text-muted-foreground">
          Questions students have asked on lessons. Each one is private to the
          student who asked it; your reply notifies them in the app and on the
          website.
        </p>
      </div>

      <DoubtsInbox
        initialRows={inbox.data}
        initialCount={inbox.count}
        initialError={inbox.error ?? null}
        courses={courses}
      />
    </div>
  );
}

function DoubtsPageSkeleton() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-1 h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
