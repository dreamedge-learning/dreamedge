import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ubymqjdmeknoblkrlgrf.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "*.b-cdn.net",
      },
    ],
  },
  async redirects() {
    return [
      {
        // The "your doubt has been answered" notification carries one link
        // for both clients. The app routes `/doubts/:id` itself; the website
        // keeps the thread under the dashboard with the student's other pages.
        source: "/doubts/:id",
        destination: "/dashboard/doubts/:id",
        permanent: false,
      },
    ];
  },
  // cacheComponents: true,
  // partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Wrapping is safe with no Sentry env set: the build-time plugin only uploads
// source maps when SENTRY_AUTH_TOKEN is present, and otherwise just skips that
// step. Runtime capture is driven by the DSN in the config files, not here, so
// an unconfigured build produces the same output it did before.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // No token, no upload. Keeping it gated means CI, which sets no Sentry env,
  // builds without ever reaching for one.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Quiet unless a token means source maps are actually being uploaded.
  silent: !process.env.SENTRY_AUTH_TOKEN,
  // Strips Sentry's own SDK logger from the client bundle.
  disableLogger: true,
});
