"use client";

import { useState } from "react";
import { AppLink } from "@/components/layout/AppLink";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Greeting } from "@/components/layout/Greeting";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { hardNavigate } from "@/lib/nav";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.post("/api/auth/forgot-password", { email });
      hardNavigate(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setLoading(false);
    }
  }

  return (
    <Card>
      <Greeting msg="Password Reset" />
      <h1 className="mb-2 text-2xl">Forgot your password?</h1>
      <p className="mb-5 text-sm text-ink-soft">
        Enter the email on your account and we will send you a 6-digit code to reset it.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-[#e6c4b8] bg-rust-soft px-4 py-3 text-sm text-rust"
          >
            {error}
          </p>
        )}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Button type="submit" block loading={loading}>
          Send reset code
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-soft">
        Remembered it?
        <AppLink href="/login" className="pl-1 font-semibold text-green">
          Back to sign in
        </AppLink>
      </p>
    </Card>
  );
}
