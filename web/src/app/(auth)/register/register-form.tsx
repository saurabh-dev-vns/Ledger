"use client";
import { Card } from "@/components/ui/card";
import { Greeting } from "@/components/layout/Greeting";
import { AppLink } from "@/components/layout/AppLink";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError, type SessionData } from "@/lib/api";
import { hardNavigate } from "@/lib/nav";

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.post<SessionData>("/api/auth/register", {
        name,
        email,
        password,
        confirm_password: confirmPassword,
      });
      hardNavigate("/dashboard");
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
      <Greeting msg="Open A Ledger" />
      <h1 className="mb-5 text-2xl">Create your account</h1>
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
          label="Name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <Button type="submit" block loading={loading}>
          Create Account
        </Button>
      </form>
      <p className="mt-5 text-center text-ink-soft text-sm">
        Already have an account?
        <AppLink href="/login" className="text-green font-semibold pl-1">
          Sign in
        </AppLink>
      </p>
    </Card>
  );
}
