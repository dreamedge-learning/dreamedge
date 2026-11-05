"use client";

import { useEffect } from "react";
import { Smartphone } from "lucide-react";

/**
 * Tries the app straight away, and offers a button for when the browser
 * refuses to leave without a tap -- Chrome on Android usually does.
 *
 * On Android the button uses an `intent:` address, which Chrome hands to the
 * app reliably where a bare custom scheme is sometimes swallowed.
 */
export function OpenAppPanel({
  appLink,
  expired,
}: {
  appLink: string | null;
  expired: boolean;
}) {
  useEffect(() => {
    if (appLink) window.location.href = forThisDevice(appLink);
  }, [appLink]);

  if (expired || !appLink) {
    return (
      <Card>
        <h1 className="font-serif text-2xl font-semibold">This link has expired</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Reset links work once and only for a short time. Open the Dream Edge app, tap
          <span className="font-medium text-foreground"> Forgot Password? </span>
          and ask for a new one.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="font-serif text-2xl font-semibold">Opening the Dream Edge app…</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        If the app does not open by itself, tap the button below.
      </p>
      <a
        href={appLink}
        onClick={(event) => {
          event.preventDefault();
          window.location.href = forThisDevice(appLink);
        }}
        className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-brand-orange px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
      >
        Open the app
      </a>
      <p className="mt-6 text-xs text-muted-foreground">
        Open this email on the same phone where you asked for the reset. The link cannot
        be used on another device. To reset your website password instead, use
        &ldquo;Forgot password&rdquo; on the website&rsquo;s sign-in page.
      </p>
    </Card>
  );
}

function forThisDevice(appLink: string): string {
  return /android/i.test(navigator.userAgent) ? toIntent(appLink) : appLink;
}

function toIntent(appLink: string): string {
  const url = new URL(appLink);
  const scheme = url.protocol.replace(/:$/, "");
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.dreamedge.mobile;end`;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <Smartphone className="mx-auto mb-4 h-10 w-10 text-brand-orange" />
      {children}
    </div>
  );
}
