import Image from "next/image";
import Link from "next/link";

import { ApplyClient } from "@/components/admin/apply/apply-client";
import { hasGatePass } from "@/lib/admin-gate";

/**
 * The public application form, outside the panel's layout and outside the
 * student shell: no sidebar to a panel the visitor cannot open, and no
 * navbar inviting them to browse courses.
 */
export default async function AdminApplyPage() {
  const unlocked = await hasGatePass();

  return (
    <div className="min-h-screen bg-brand-black px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="text-center mb-8">
          <Image
            src="/logo.jpg"
            alt="Dream Edge"
            width={72}
            height={72}
            priority
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="text-xl font-semibold text-white">Join the Dream Edge team</h1>
          <p className="text-sm text-brand-gray mt-1">
            Applications are reviewed by the Dream Edge super admin.
          </p>
        </div>

        <ApplyClient initiallyUnlocked={unlocked} />

        <p className="text-center text-xs text-brand-gray mt-6">
          Already on the team?{" "}
          <Link href="/admin/login" className="text-brand-orange hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
