"use client";

import { useEffect } from "react";
import { hardNavigate } from "@/lib/nav";
import { useSession } from "@/lib/session";

/**
 * Safety net for pages that need a signed-in user. src/proxy.ts already stops
 * most signed-out visits on the server; this catches a session that expired
 * while the page was open.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, user } = useSession();
  const signedOut = status === "ready" && !user;

  useEffect(() => {
    if (signedOut) hardNavigate("/login");
  }, [signedOut]);

  return signedOut ? null : <>{children}</>;
}
