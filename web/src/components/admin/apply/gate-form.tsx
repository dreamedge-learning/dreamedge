"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlockApplicationForm } from "@/app/admin/apply/actions";

/**
 * Driven by the server action rather than an onSubmit handler: before
 * hydration a handler-only form falls back to a native GET, which would put
 * the access password in the URL and the browser history. Same reason the
 * admin sign-in form is built this way.
 */
export function GateForm({ onUnlocked }: { onUnlocked: () => void }) {
  const [state, formAction, pending] = useActionState(unlockApplicationForm, null);

  const unlocked = state !== null && "unlocked" in state;
  const error = state !== null && "error" in state ? state.error : null;

  // In an effect, not inline: telling the parent during render would be a
  // state update to another component mid-render.
  useEffect(() => {
    if (unlocked) onUnlocked();
  }, [unlocked, onUnlocked]);

  return (
    <div className="rounded-xl border border-white/10 bg-brand-blue/50 p-6 backdrop-blur-sm">
      <div className="flex items-start gap-3 mb-5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-orange/15">
          <Lock className="h-4 w-4 text-brand-orange" />
        </span>
        <div>
          <h2 className="text-sm font-medium text-white">Access password</h2>
          <p className="text-sm text-brand-gray mt-0.5">
            The Dream Edge team will have given you this. It is not your own password.
          </p>
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="gate-password" className="text-gray-300">
            Password
          </Label>
          <Input
            id="gate-password"
            name="password"
            type="password"
            autoComplete="off"
            required
            placeholder="Enter the access password"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="w-full bg-brand-orange text-white hover:bg-brand-orange-dark"
        >
          {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Continue
        </Button>
      </form>
    </div>
  );
}
