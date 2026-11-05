import type { Metadata } from "next";

import { OpenAppPanel } from "./open-app-panel";

export const metadata: Metadata = {
  title: "Open the Dream Edge app",
  robots: { index: false, follow: false },
};

/**
 * The hand-over from an email link to the app.
 *
 * Supabase only redirects to addresses on its allow-list. The website is on
 * it and the app's own scheme is not, so a password-reset email requested
 * from the app lands here first, and this page passes the one-time code on to
 * `com.dreamedge.mobile://<destination>`.
 *
 * The code cannot be used from here. The app stored the matching verifier on
 * the phone that asked for the reset, so only that phone can turn it into a
 * session -- which is why opening the email on a laptop gets an explanation
 * rather than a form.
 */

/** Where in the app a link may send someone. Anything else is ignored. */
const DESTINATIONS = new Set(["reset-password"]);

/** A PKCE auth code is an opaque token; anything else is not one of ours. */
const CODE = /^[A-Za-z0-9._~-]{8,512}$/;

export default async function OpenAppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };

  const to = pick("to");
  const code = pick("code");
  const failure = pick("error_description") ?? pick("error");

  const destination = to && DESTINATIONS.has(to) ? to : null;
  const appLink =
    destination && code && CODE.test(code)
      ? `com.dreamedge.mobile://${destination}?code=${encodeURIComponent(code)}`
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <OpenAppPanel
        appLink={appLink}
        expired={Boolean(failure) || !appLink}
      />
    </main>
  );
}
