/**
 * Sentry on the Edge runtime (middleware and any edge route handlers).
 *
 * A separate file from the Node config because the edge runtime is a separate
 * bundle with its own global scope. Same contract as the server config: no
 * `SENTRY_DSN`, no `Sentry.init`, nothing initialised.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
  });
}
