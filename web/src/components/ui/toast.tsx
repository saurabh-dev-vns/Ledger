"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Kind = "success" | "error" | "info";
type Toast = { id: number; kind: Kind; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<Kind, string> = {
  success: "bg-green-soft text-green border-[#c6dbd2]",
  error: "bg-rust-soft text-rust border-[#e6c4b8]",
  info: "bg-paper-raised text-ink border-line",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { id, kind, message }]);
      timers.current.set(id, setTimeout(() => dismiss(id), kind === "error" ? 8000 : 5000));
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((t) => clearTimeout(t));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[2000] flex flex-col items-center gap-2 p-4 sm:items-end"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border px-4 py-3 text-sm shadow-card",
              STYLES[t.kind],
            )}
          >
            <p className="flex-1">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss message"
              className="-mr-1 cursor-pointer rounded px-1 text-lg leading-none opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
