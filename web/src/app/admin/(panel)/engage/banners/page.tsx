import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { BannersClient, type BannerRow } from "@/components/admin/engage/banners-client";
import { fetchBanners } from "../actions";

export const metadata: Metadata = {
  title: "Banners | Dream Edge Admin",
};

function BannersSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-60 rounded-lg" />
      ))}
    </div>
  );
}

async function BannersLoader() {
  const result = await fetchBanners();
  return <BannersClient initialData={(result.data ?? []) as BannerRow[]} />;
}

export default function BannersPage() {
  return (
    <Suspense fallback={<BannersSkeleton />}>
      <BannersLoader />
    </Suspense>
  );
}
