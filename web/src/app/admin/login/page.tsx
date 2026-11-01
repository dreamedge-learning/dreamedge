"use client";

import Image from "next/image";
import { useActionState } from "react";
import { signIn } from "./actions";

export default function AdminLoginPage() {
  // Driving the form with the server action keeps credentials in a POST body.
  // An onSubmit handler alone falls back to a native GET before hydration,
  // which writes the password into the URL and the browser history.
  const [state, formAction, loading] = useActionState(signIn, null);
  const error = state?.error ?? null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-black px-4">
      <div className="w-full max-w-sm">
        {/* Logo & Brand */}
        <div className="text-center mb-8">
          <Image src="/logo.jpg" alt="Dream Edge" width={80} height={80} priority className="h-20 w-auto mx-auto mb-4" />
          <p className="text-sm text-brand-gray mt-1">Admin Panel</p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl border border-white/10 bg-brand-blue/50 p-6 backdrop-blur-sm">
          <form action={formAction} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-300 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange transition-colors"
                placeholder="admin@dreamedgelearning.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-300 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange transition-colors"
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-orange-dark focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2 focus:ring-offset-brand-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-brand-gray mt-6">
          Only authorized team members can access the admin panel.
        </p>
      </div>
    </div>
  );
}
