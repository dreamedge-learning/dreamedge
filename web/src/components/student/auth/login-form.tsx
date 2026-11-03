"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { PasswordInput } from "@/components/student/auth/password-input";
import { PhoneAuthForm } from "@/components/student/auth/phone-auth-form";
import { GoogleButton } from "@/components/student/auth/google-button";
import { AdminLoginPanel } from "@/components/admin/admin-login-panel";
import { loginStudent } from "@/app/(student)/auth/actions";

type Category = "student" | "admin";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "admin", label: "Admin" },
];

export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<Category>("student");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await loginStudent(formData);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      router.push("/dashboard");
      router.refresh();
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
            {category === "student" ? "Welcome Back" : "Team Sign-in"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {category === "student"
              ? "Log in to your Dream Edge account"
              : "For Dream Edge mentors and staff"}
          </p>
        </div>

        {/* Which side of the platform you are signing in to. The student side
            below is untouched by the switch; the admin side posts to the
            panel's own sign-in action. */}
        <div
          role="tablist"
          aria-label="Account type"
          className="mb-5 flex items-center gap-1 rounded-lg border border-border bg-card p-1"
        >
          {CATEGORIES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={category === option.value}
              onClick={() => setCategory(option.value)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                category === option.value
                  ? "bg-brand-orange/10 text-brand-orange"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {category === "admin" && <AdminLoginPanel />}

        <div
          className="rounded-xl border border-border bg-card p-6 shadow-sm"
          hidden={category !== "student"}
        >
          <Tabs defaultValue="email" className="gap-5">
            <TabsList className="w-full">
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="phone">Phone</TabsTrigger>
              <TabsTrigger value="google">Google</TabsTrigger>
            </TabsList>

            <TabsContent value="email">
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-brand-orange hover:text-brand-orange-dark transition-colors"
                    >
                      Forgot Password?
                    </Link>
                  </div>
                  <PasswordInput
                    id="password"
                    name="password"
                    placeholder="Enter your password"
                    required
                    minLength={8}
                    autoComplete="current-password"
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
                      Logging in…
                    </>
                  ) : (
                    "Login"
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="phone">
              <PhoneAuthForm mode="login" />
            </TabsContent>

            <TabsContent value="google">
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  Continue with your Google account. We&apos;ll create your
                  Dream Edge profile automatically if you&apos;re new.
                </p>
                <GoogleButton label="Continue with Google" />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <p
          className="text-center text-sm text-muted-foreground mt-6"
          hidden={category !== "student"}
        >
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-brand-orange hover:text-brand-orange-dark font-medium transition-colors"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
