import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminSession, hasPermission } from "@/lib/admin";
import { FINANCE_ROLES } from "@/lib/dashboard";
import { RefundsTable } from "@/components/admin/revenue/refunds-table";
import { fetchRefunds } from "@/app/admin/(panel)/revenue/actions";

export const metadata: Metadata = {
  title: "Refunds | Dream Edge Admin",
};

export default function RefundsPage() {
  return (
    <Suspense fallback={<RefundsPageSkeleton />}>
      <RefundsContent />
    </Suspense>
  );
}

async function RefundsContent() {
  await connection();
  const admin = await getAdminSession();

  if (!admin || !hasPermission(admin, FINANCE_ROLES)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="max-w-md text-center text-muted-foreground">
          You don&apos;t have permission to view refunds. Contact your
          administrator if you need access.
        </p>
      </div>
    );
  }

  // Deliberately not inside the same Promise.all as anything else: refunds is
  // its own section now, and a failure here must not blank the whole page.
  const refundsResult = await fetchRefunds({ page: 1, pageSize: 20 });

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Refunds</h1>
        <p className="mt-1 text-muted-foreground">
          Review, approve and track every refund raised on the platform.
        </p>
      </div>

      <PolicyNotice />

      {refundsResult.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm">
          <p className="font-medium text-destructive">
            Refunds could not be loaded.
          </p>
          <p className="mt-1 text-muted-foreground">{refundsResult.error}</p>
        </div>
      ) : (
        <RefundsTable
          initialData={refundsResult.data ?? []}
          initialCount={refundsResult.count}
        />
      )}
    </div>
  );
}

/**
 * The refund rule, stated where the decision is actually made.
 *
 * It is on this page rather than only in the public policy because the person
 * approving a refund is the one who has to apply the rule, and a request that
 * is really a change of mind has to be rejected here.
 */
function PolicyNotice() {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-2 text-sm">
          <p className="font-medium">Refund policy</p>
          <p className="text-muted-foreground">
            A paid enrolment is final. A refund is issued only when{" "}
            <strong className="text-foreground">
              Dream Edge cancels the course
            </strong>
            , pro-rated for the undelivered portion where the course is
            cancelled partway through.
          </p>
          <p className="text-muted-foreground">
            A payment that was debited without access being granted, or a
            duplicate charge, is a failed transaction rather than a refund — put
            it right in full, and record the Razorpay payment ID in the reason.
          </p>
          <p className="text-muted-foreground">
            Change of mind, low usage, wrong class chosen, or dissatisfaction
            are <strong className="text-foreground">not</strong> grounds for a
            refund. Reject these with a clear reason so the student has a record
            of the decision.
          </p>
        </div>
      </div>
    </div>
  );
}

function RefundsPageSkeleton() {
  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-1 h-4 w-80" />
      </div>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}
