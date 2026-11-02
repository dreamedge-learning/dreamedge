import { Suspense } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ExportButton } from "@/components/admin/export-button";
import { StudentAnalytics } from "@/components/admin/students/student-analytics";
import { fetchStudentAnalytics } from "../actions";

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[340px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

async function AnalyticsLoader() {
  const result = await fetchStudentAnalytics();
  if (!result.data) return null;
  return <StudentAnalytics data={result.data} />;
}

export default function StudentAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/students">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Progress & Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Student growth, engagement, and geographic distribution.
          </p>
        </div>
        <div className="ml-auto">
          <ExportButton dataset="student-progress" label="Export progress" />
        </div>
      </div>

      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsLoader />
      </Suspense>
    </div>
  );
}
