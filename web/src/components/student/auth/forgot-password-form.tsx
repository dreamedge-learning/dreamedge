"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { forgotPassword } from "@/app/(student)/auth/actions";

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await forgotPassword(formData);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setSent(true);
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
            Reset Your Password
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sent
              ? "Check your inbox for further instructions"
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="size-12 text-green-500" />
              <p className="text-sm text-center text-muted-foreground">
                If an account exists with that email, you&apos;ll receive a
                password reset link shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
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
                    Sending…
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-brand-orange hover:text-brand-orange-dark font-medium transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}
