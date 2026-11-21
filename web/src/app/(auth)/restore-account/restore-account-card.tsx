"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Greeting } from "@/components/layout/Greeting";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, type SessionData } from "@/lib/api";
import { hardNavigate } from "@/lib/nav";
import { useSession } from "@/lib/session";

export function RestoreAccountCard() {
  const { status, pendingRestore } = useSession();
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (status === "ready" && !pendingRestore) {
      hardNavigate("/login");
    }
  }, [status, pendingRestore]);

  if (status === "loading" || !pendingRestore) {
    return (
      <Card className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </Card>
    );
  }

  const purgeDate = new Date(pendingRestore.purgeAt).toDateString();

  async function onRestore() {
    setError("");
    setRestoring(true);

    try {
      await api.post<SessionData>("/api/auth/restore-account");
      hardNavigate("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not restore account. Please try again.",
      );
      setRestoring(false);
    }
  }

  async function onCancel() {
    setError("");
    setCanceling(true);

    try {
      await api.post("/api/auth/restore-account/cancel");
      hardNavigate("/login");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setCanceling(false);
    }
  }

  return (
    <Card>
      <Greeting msg="Account Recovery" />
      <h1 className="mb-2 text-2xl">Welcome back, {pendingRestore.name}</h1>

      <p className="mb-4 text-sm text-ink-soft leading-relaxed">
        This account was deleted but is still recoverable until{" "}
        <strong className="text-ink">{purgeDate}</strong>. That is the{" "}
        {pendingRestore.windowDays}-day restore window. After that, it is gone
        for good, including attached accounts, expenses, and budgets.
      </p>

      <p className="mb-6 text-sm font-medium text-ink">Want it back?</p>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-[#e6c4b8] bg-rust-soft px-4 py-3 text-sm text-rust"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button
          variant="primary"
          block
          loading={restoring}
          disabled={canceling}
          onClick={onRestore}
        >
          Restore my account
        </Button>

        <Button
          variant="secondary"
          block
          loading={canceling}
          disabled={restoring}
          onClick={onCancel}
        >
          No thanks, keep it deleted
        </Button>
      </div>
    </Card>
  );
}
