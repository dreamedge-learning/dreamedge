"use client";

import { useEffect } from "react";
import { SUPPORT_EMAIL } from "@/lib/site";

/**
 * Catches failures in the root layout itself, where the normal error boundary
 * has already been unmounted. Next replaces the whole document with this, so
 * it cannot rely on fonts, providers or Tailwind being mounted — the styles
 * are inline on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          backgroundColor: "#0D0D0D",
          color: "#FFFFFF",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "32rem" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#F26A21",
            }}
          >
            Dream Edge
          </p>
          <h1
            style={{
              margin: "0.75rem 0 0",
              fontSize: "1.75rem",
              lineHeight: 1.2,
              fontWeight: 800,
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              margin: "0.75rem 0 0",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "#8892A0",
            }}
          >
            We hit an unexpected problem loading the site. Trying again usually
            fixes it. If it keeps happening, email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              style={{ color: "#F26A21" }}
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>

          {error.digest ? (
            <p
              style={{
                margin: "1.25rem 0 0",
                fontSize: "0.75rem",
                color: "#8892A0",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.75rem",
              padding: "0.7rem 1.4rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              color: "#FFFFFF",
              backgroundColor: "#F26A21",
              border: "none",
              borderRadius: "0.6rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
