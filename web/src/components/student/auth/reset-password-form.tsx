"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/student/auth/password-input";
import { resetPassword } from "@/app/(student)/auth/actions";

export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const pw = formData.get("password") as string;
    const confirm = formData.get("confirm_password") as string;

    if (pw.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    if (pw !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const result = await resetPassword(formData);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Password updated successfully!");
      router.push("/login");
    });
  }

  return (
    <div className="min-h-[calc(100vh-var(--header-height))] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-brand-orange mb-4">
            <span className="text-white font-bold text-xl tracking-tight">
              DE
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Set New Password
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a strong password for your account
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <PasswordInput
                id="password"
                name="password"
                placeholder="Min. 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm Password</Label>
              <PasswordInput
                id="confirm_password"
                name="confirm_password"
                placeholder="Re-enter password"
                required
                minLength={8}
                autoComplete="new-password"
                disabled={pending}
              />
            </div>

            <Button
              type="submit"
              disabled={pending}
              className="w-full h-10 bg-brand-orange text-white hover:bg-brand-orange-dark"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Updating…
                </>
              ) : (
                "Update Password"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
