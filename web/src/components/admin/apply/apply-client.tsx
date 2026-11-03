"use client";

import { useState } from "react";

import { ApplicationForm } from "@/components/admin/apply/application-form";
import { GateForm } from "@/components/admin/apply/gate-form";

/**
 * Two steps on one page. The initial value comes from the server, so somebody
 * who cleared the gate and reloaded lands straight back on the form instead of
 * typing the shared password again.
 */
export function ApplyClient({ initiallyUnlocked }: { initiallyUnlocked: boolean }) {
  const [unlocked, setUnlocked] = useState(initiallyUnlocked);

  if (!unlocked) {
    return <GateForm onUnlocked={() => setUnlocked(true)} />;
  }

  return <ApplicationForm />;
}
