import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminSession, hasPermission } from "@/lib/admin";
import { FINANCE_ROLES } from "@/lib/dashboard";
import { RevenuePageClient } from "./client";
import {
  fetchOrders,
  fetchRefunds,
  fetchInvoices,
  fetchReferralCodes,
} from "./actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Revenue & Analytics | Dream Edge Admin",
};

export default function RevenuePage() {
  return (
    <Suspense fallback={<RevenuePageSkeleton />}>
      <RevenueContent />
    </Suspense>
  );
}

async function RevenueContent() {
  await connection();
  const admin = await getAdminSession();

  if (!admin || !hasPermission(admin, FINANCE_ROLES)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground text-center max-w-md">
          You don&apos;t have permission to view the revenue section.
          Contact your administrator if you need access.
        </p>
      </div>
    );
  }

  const [ordersResult, refundsResult, invoicesResult, referralResult, coursesResult] =
    await Promise.all([
      fetchOrders({ page: 1, pageSize: 20 }),
      fetchRefunds({ page: 1, pageSize: 20 }),
      fetchInvoices({ page: 1, pageSize: 20 }),
      fetchReferralCodes({ page: 1, pageSize: 20 }),
      (async () => {
        const supabase = await createClient();
        return supabase
          .from("courses")
          .select("id, title")
          .eq("is_published", true)
          .order("title");
      })(),
    ]);

  return (
    <RevenuePageClient
      initialOrders={ordersResult.data ?? []}
      initialOrdersCount={ordersResult.count}
      initialRefunds={refundsResult.data ?? []}
      initialRefundsCount={refundsResult.count}
      initialInvoices={invoicesResult.data ?? []}
      initialInvoicesCount={invoicesResult.count}
      initialReferralCodes={referralResult.data ?? []}
      initialReferralCodesCount={referralResult.count}
      courses={(coursesResult.data ?? []).map((c) => ({
        id: c.id,
        name: (c as unknown as { title: string }).title,
      }))}
    />
  );
}

function RevenuePageSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-1 h-4 w-72" />
      </div>
      <Skeleton className="h-10 w-full max-w-[500px]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[100px]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[320px]" />
        <Skeleton className="h-[320px]" />
      </div>
    </div>
  );
}
