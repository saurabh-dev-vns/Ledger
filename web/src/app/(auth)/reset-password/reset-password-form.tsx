"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppLink } from "@/components/layout/AppLink";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Greeting } from "@/components/layout/Greeting";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { hardNavigate } from "@/lib/nav";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (otp.trim().length !== 6) {
      setError("Please enter a valid 6-digit code.");
      return;
    }

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await api.post("/api/auth/reset-password", {
        email,
        otp: otp.trim(),
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      hardNavigate("/login");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setLoading(false);
    }
  }

  async function onResend() {
    if (!email) {
      setError("Please enter your email to receive a code.");
      return;
    }

    setError("");
    setMessage("");
    setResending(true);

    try {
      await api.post("/api/auth/forgot-password", { email });
      setMessage("A fresh 6-digit code has been sent to your email.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not resend reset code. Please try again.",
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <Card>
      <Greeting msg="Password Reset" />
      <h1 className="mb-2 text-2xl">Enter your code</h1>
      <p className="mb-5 text-sm text-ink-soft">
        Enter the 6-digit code sent to your email along with your new password.
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

        {message && (
          <p
            role="status"
            className="rounded-lg border border-[#b8e6c4] bg-[#edf8f0] px-4 py-3 text-sm text-[#1b5e20]"
          >
            {message}
          </p>
        )}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          autoFocus={!initialEmail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Input
          label="6-digit code"
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="123456"
          required
          autoFocus={!!initialEmail}
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
        />

        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <Button type="submit" block loading={loading}>
          Reset password
        </Button>
      </form>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onResend}
          disabled={resending}
          className="text-xs text-ink-soft underline hover:text-ink disabled:opacity-60"
        >
          {resending ? "Sending code..." : "Did not get a code? Send another"}
        </button>
      </div>

      <p className="mt-4 text-center text-sm text-ink-soft">
        <AppLink href="/login" className="pl-1 font-semibold text-green">
          Back to sign in
        </AppLink>
      </p>
    </Card>
  );
}
