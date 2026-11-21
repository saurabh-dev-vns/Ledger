"use client";

import { useState } from "react";
import { AppLink } from "@/components/layout/AppLink";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiError, type SessionData } from "@/lib/api";
import { hardNavigate } from "@/lib/nav";
import { Greeting } from "@/components/layout/Greeting";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data } = await api.post<SessionData>("/api/auth/login", { email, password });
      // Soft-deleted account: ask if they want it back. Otherwise go in.
      hardNavigate(data.pendingRestore ? "/restore-account" : "/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <Card>
      <Greeting msg="Welcome Back" />
      <h1 className="mb-5 text-2xl">Sign in</h1>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-lg border border-[#e6c4b8] bg-rust-soft px-4 py-3 text-sm text-rust">
            {error}
          </p>
        )}

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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" block loading={loading}>
          Sign in
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-soft">
        <AppLink href="/forgot-password" className="underline">
          Forgot password?
        </AppLink>
        {" · "}
        <AppLink href="/register" className="underline">
          Create account
        </AppLink>
      </p>
    </Card>
  );
}
