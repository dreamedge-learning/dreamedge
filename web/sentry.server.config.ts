/**
 * Sentry on the Node.js server runtime.
 *
 * Loaded by `src/instrumentation.ts` only when the request is served by the
 * Node runtime. The DSN is read here, at module load, rather than baked in:
 * a deployment with no `SENTRY_DSN` set never calls `Sentry.init`, so nothing
 * initialises and no network client is created. Error-capturing calls made
 * elsewhere stay harmless no-ops until the DSN is in place.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    // Performance tracing is on but cheap to dial back once there is real
    // traffic to measure against.
    tracesSampleRate: 1.0,
    // The error payload is what we are after; request bodies, headers and
    // cookies are not, and some of them carry student data.
    sendDefaultPii: false,
  });
}
