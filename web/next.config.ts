import type { NextConfig } from "next";

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

export default nextConfig;
