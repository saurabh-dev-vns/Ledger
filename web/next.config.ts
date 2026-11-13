import type { NextConfig } from "next";

// Express backend (the existing Ledger API + still-unmigrated EJS pages).
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return {
      // Same-origin proxy: browser only talks to Next, so the Express session
      // cookie and CSRF token work without CORS.
      beforeFiles: [
        { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      ],
      // Anything Next doesn't serve yet (old EJS pages, /css, /js, /vendor)
      // falls through to Express, so the app keeps working while pages are
      // migrated one by one. Remove this once the migration is finished.
      fallback: [{ source: "/:path*", destination: `${API_ORIGIN}/:path*` }],
    };
  },
};

export default nextConfig;
