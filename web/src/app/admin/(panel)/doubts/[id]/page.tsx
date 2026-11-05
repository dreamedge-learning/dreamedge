import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { StaffDoubtView } from "@/components/admin/doubts/staff-doubt-view";
import { getAdminSession, hasPermission } from "@/lib/admin";
import { DOUBT_ANSWER_ROLES, DOUBT_READ_ROLES } from "@/lib/doubts";

import { fetchStaffDoubt } from "../actions";

export const metadata: Metadata = {
  title: "Doubt | Dream Edge Admin",
};

export default async function StaffDoubtPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const admin = await getAdminSession();

  if (!admin || !hasPermission(admin, DOUBT_READ_ROLES)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="max-w-md text-center text-muted-foreground">
          You don&apos;t have permission to view student doubts.
        </p>
      </div>
    );
  }

  const result = await fetchStaffDoubt(id);
  if (!result.data) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <Link
        href="/admin/doubts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All doubts
      </Link>
      <StaffDoubtView
        initialDoubt={result.data}
        canAnswer={hasPermission(admin, DOUBT_ANSWER_ROLES)}
        adminId={admin.id}
      />
    </div>
  );
}
