/**
 * Browser-side instrumentation. Next loads this before the app hydrates, which
 * is early enough for Sentry to catch client errors from first paint.
 *
 * The browser can only read a `NEXT_PUBLIC_`-prefixed variable, so the client
 * DSN is separate from the server one. With it unset the branch is skipped and
 * no Sentry client is created, exactly as on the server.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
  });
}

// Lets Sentry tie a thrown error to the client navigation it happened during.
// Harmless to export when Sentry never initialised.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
