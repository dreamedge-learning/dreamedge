"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/student/auth/password-input";
import { signIn } from "@/app/admin/login/actions";

/**
 * The team half of the login page.
 *
 * Posts to the same action as `/admin/login`, which carries the lockout
 * counter and the active-admin check and redirects to the panel itself -- this
 * is a second door onto one flow, not a second implementation of it. Driven by
 * the action rather than an onSubmit handler so a pre-hydration submit cannot
 * fall back to a GET with the password in the URL.
 */
export function AdminLoginPanel() {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@dreamedgelearning.com"
              disabled={pending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-password">Password</Label>
            <PasswordInput
              id="admin-password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              disabled={pending}
            />
          </div>

          {state?.error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {state.error}
            </div>
          )}

          <Button
            type="submit"
            disabled={pending}
            className="h-10 w-full bg-brand-orange text-white hover:bg-brand-orange-dark"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Want to join the team?{" "}
        <Link
          href="/admin/apply"
          className="font-medium text-brand-orange transition-colors hover:text-brand-orange-dark"
        >
          Apply for admin access
        </Link>
      </p>
      <p className="mt-1.5 text-center text-xs text-muted-foreground">
        You will need the access password from the Dream Edge team.
      </p>
    </>
  );
}
