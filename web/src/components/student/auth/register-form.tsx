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
import { registerStudent } from "@/app/(student)/auth/actions";

const CLASS_OPTIONS = [
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
];

export function RegisterForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");

  const strengthLabel =
    password.length === 0
      ? null
      : password.length < 8
        ? "Too short"
        : password.length < 12
          ? "Good"
          : "Strong";

  const strengthColor =
    password.length < 8
      ? "bg-red-500"
      : password.length < 12
        ? "bg-yellow-500"
        : "bg-green-500";

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
      const result = await registerStudent(formData);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Account created successfully!");
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="min-h-[calc(100vh-var(--header-height))] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[480px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-brand-orange mb-4">
            <span className="text-white font-bold text-xl tracking-tight">
              DE
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Create Your Account
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Start your learning journey with Dream Edge
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <Tabs defaultValue="phone" className="gap-5">
            <TabsList className="w-full">
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="phone">Phone</TabsTrigger>
              <TabsTrigger value="google">Google</TabsTrigger>
            </TabsList>

            <TabsContent value="email">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      name="full_name"
                      placeholder="Enter your full name"
                      required
                      minLength={2}
                      autoComplete="name"
                      disabled={pending}
                    />
                  </div>

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
                    <Label htmlFor="phone">Phone (optional)</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="9876543210"
                      autoComplete="tel"
                      disabled={pending}
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="class">Class</Label>
                    <select
                      id="class"
                      name="class"
                      disabled={pending}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select your class
                      </option>
                      {CLASS_OPTIONS.map((cls) => (
                        <option key={cls} value={cls}>
                          {cls}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <PasswordInput
                      id="password"
                      name="password"
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      disabled={pending}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    {strengthLabel && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${strengthColor}`}
                            style={{
                              width:
                                password.length < 8
                                  ? "33%"
                                  : password.length < 12
                                    ? "66%"
                                    : "100%",
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {strengthLabel}
                        </span>
                      </div>
                    )}
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

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="referral_code">
                      Referral Code (optional)
                    </Label>
                    <Input
                      id="referral_code"
                      name="referral_code"
                      placeholder="Have a referral code?"
                      disabled={pending}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={pending}
                  className="w-full h-10 bg-brand-orange text-white hover:bg-brand-orange-dark"
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Creating account…
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="phone">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Sign up instantly with your mobile number. You can add your
                  name and class from your profile after logging in.
                </p>
                <PhoneAuthForm mode="register" />
              </div>
            </TabsContent>

            <TabsContent value="google">
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  Sign up with Google — we&apos;ll pull your name and email,
                  and you can set your class later from your profile.
                </p>
                <GoogleButton label="Sign up with Google" />
              </div>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-center text-muted-foreground mt-5">
            By creating an account, you agree to our{" "}
            <Link href="/terms" className="text-brand-orange hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy-policy"
              className="text-brand-orange hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-brand-orange hover:text-brand-orange-dark font-medium transition-colors"
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
