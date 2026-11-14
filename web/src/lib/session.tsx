"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hardNavigate } from "@/lib/nav";
import { api, setCsrfToken, type PendingRestore, type SessionUser } from "@/lib/api";

type SessionState = {
  /** "loading" until the first /api/session answer arrives. */
  status: "loading" | "ready";
  user: SessionUser | null;
  pendingRestore: PendingRestore | null;
};

type SessionContextValue = SessionState & {
  /** Re-read the session (e.g. after a profile name change). */
  refresh: () => Promise<void>;
  /** Ends the session and goes to the login page. */
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const LOADING: SessionState = { status: "loading", user: null, pendingRestore: null };

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>(LOADING);

  const load = useCallback(async (): Promise<SessionState> => {
    try {
      const s = await api.session();
      return { status: "ready", user: s.user, pendingRestore: s.pendingRestore };
    } catch {
      return { status: "ready", user: null, pendingRestore: null };
    }
  }, []);

  useEffect(() => {
    let alive = true;
    load().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setState(await load());
  }, [load]);

  const signOut = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      setCsrfToken(null);
      hardNavigate("/login");
    }
  }, []);

  const value = useMemo(() => ({ ...state, refresh, signOut }), [state, refresh, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
