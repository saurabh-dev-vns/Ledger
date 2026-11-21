import { NextResponse, type NextRequest } from "next/server";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3000";

/**
 * Keeps signed-out visitors away from signed-in pages (before any page code runs).
 *
 * The Express session cookie exists even for visitors who never signed in, so
 * its presence proves nothing; we ask Express who the session belongs to.
 * If Express cannot be reached we let the request through: the page itself
 * shows no private data until the API answers, and the API says 401.
 */
export async function proxy(request: NextRequest) {
  // Link prefetches only warm the cache; the real visit is checked.
  if (request.headers.has("next-router-prefetch")) return NextResponse.next();

  try {
    const res = await fetch(`${API_ORIGIN}/api/session`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    const body = await res.json();

    if (!body?.data?.user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } catch {
    return NextResponse.next();
  }

  return NextResponse.next();
}

/**
 * Pages Next serves that need a signed-in user.
 * Add a path here each time a page is migrated (matcher values must be literals).
 */
export const config = {
  matcher: ["/status/:path*", "/dashboard/:path*", "/profile/:path*"],
};
