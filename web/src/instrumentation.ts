/**
 * Server-side instrumentation hook. Next calls `register` once per runtime as
 * the server starts, which is where the matching Sentry config is loaded. Each
 * config guards its own `Sentry.init` on the DSN, so with none set this import
 * runs but initialises nothing.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Reports errors thrown inside server components, route handlers and the data
// fetching Next does on our behalf. A no-op until Sentry is initialised.
export const onRequestError = Sentry.captureRequestError;
