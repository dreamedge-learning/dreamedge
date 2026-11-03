"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAdminGate } from "@/app/admin/(panel)/settings/applications-actions";
import type { AdminGateStatus } from "@/app/admin/(panel)/settings/applications-actions";

/**
 * The shared password in front of the public application form.
 *
 * The current value is never shown, because nothing can read it -- the hash
 * lives in a table with no policies and is only ever compared inside a
 * function. Rotating it is the only operation; recovering it is not one.
 */
export function AdminGateCard({
  status,
  applyUrl,
}: {
  status: AdminGateStatus;
  applyUrl: string;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm_password") ?? "");

    if (password !== confirm) {
      toast.error("The two passwords do not match.");
      return;
    }

    startTransition(async () => {
      const result = await updateAdminGate(formData);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        status.is_set ? "Access password changed." : "Access password set."
      );
      form.reset();
    });
  }

  function copyLink() {
    void navigator.clipboard.writeText(applyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-orange/10">
          <KeyRound className="h-4 w-4 text-brand-orange" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Application access password</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Anyone with this password can fill in the application form. It does
            not grant any access on its own.
          </p>
        </div>
      </div>

      {status.is_set ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Last changed{" "}
          {status.updated_at
            ? new Date(status.updated_at).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "at an unknown time"}
          {status.updated_by_name ? ` by ${status.updated_by_name}` : ""}.
        </p>
      ) : (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-500">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            No password is set, so the application form is closed to everyone.
            Set one to start accepting applications.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gate-new">
              {status.is_set ? "New password" : "Password"}
            </Label>
            <Input
              id="gate-new"
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              placeholder="At least 10 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gate-confirm">Confirm</Label>
            <Input
              id="gate-confirm"
              name="confirm_password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              placeholder="Type it again"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {status.is_set ? "Change password" : "Set password"}
          </Button>

          <Button type="button" variant="outline" onClick={copyLink}>
            {copied ? (
              <Check className="mr-1.5 h-4 w-4" />
            ) : (
              <Copy className="mr-1.5 h-4 w-4" />
            )}
            Copy application link
          </Button>
        </div>
      </form>
    </div>
  );
}
