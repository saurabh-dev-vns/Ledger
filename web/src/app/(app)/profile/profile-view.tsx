"use client";

import { useEffect, useState } from "react";
import { AppLink } from "@/components/layout/AppLink";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { hardNavigate } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { ProfileSkeleton } from "./profile-skeleton";

type ProfileStats = {
  accountCount: number;
  expenseCount: number;
  totalSpent: number;
  loanCount: number;
};

type Profile = {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  stats: ProfileStats;
};

type ActivityItem = {
  id: number;
  action: string;
  label: string;
  createdAt: string;
};

type ProfileApiResponse = {
  profile: Profile;
  activity: ActivityItem[];
};

export function ProfileView() {
  const toast = useToast();
  const { refresh } = useSession();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  // Profile update form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password update form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Delete account form
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await api.get<ProfileApiResponse>("/api/profile");
        if (alive) {
          setProfile(res.data.profile);
          setActivity(res.data.activity);
          setName(res.data.profile.name);
          setEmail(res.data.profile.email);
        }
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Failed to load profile.",
        );
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [toast]);

  async function handleProfileSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setSavingProfile(true);

    try {
      await api.patch<{ name: string; email: string }>("/api/profile", {
        name,
        email,
      });
      await refresh();
      toast.success("Profile updated successfully.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to update profile.",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setPasswordError("");

    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setSavingPassword(true);

    try {
      await api.post("/api/profile/password", {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully.");
    } catch (err) {
      setPasswordError(
        err instanceof ApiError ? err.message : "Failed to change password.",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeleteSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setDeleteError("");

    const confirmed = window.confirm(
      "Are you sure you want to delete your account? You will have 30 days to restore it by signing back in. After 30 days it is permanently deleted.",
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      await api.post("/api/profile/delete", { password: deletePassword });
      hardNavigate("/login");
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Failed to delete account.",
      );
      setDeleting(false);
    }
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <Card className="py-10 text-center">
        <p className="text-rust mb-4">Could not load profile.</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[12px] font-mono uppercase tracking-[.12em] text-rust">
          Account
        </p>
        <h1 className="text-3xl font-display font-bold">Profile settings</h1>
        <p className="text-sm text-ink-soft">
          Manage your account credentials, security, and preferences.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Your details */}
        <Card title="Your details">
          <p className="mb-4 text-xs text-ink-soft">
            Member since {formatDate(profile.createdAt)}
          </p>

          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
            <Input
              label="Name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Button type="submit" loading={savingProfile}>
              Save changes
            </Button>
          </form>
        </Card>

        {/* At a glance */}
        <Card title="At a glance">
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-lg border border-line bg-paper p-3 text-center">
              <span className="text-xs text-ink-soft">Accounts</span>
              <p className="mt-1 font-mono text-2xl font-bold text-ink">
                {profile.stats.accountCount}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-paper p-3 text-center">
              <span className="text-xs text-ink-soft">Expenses recorded</span>
              <p className="mt-1 font-mono text-2xl font-bold text-ink">
                {profile.stats.expenseCount}
              </p>
            </div>

            <div className="rounded-lg border border-line bg-paper p-3 text-center">
              <span className="text-xs text-ink-soft">Total spent</span>
              <p className="mt-1 font-mono text-xl font-bold text-ink">
                <Money value={profile.stats.totalSpent} />
              </p>
            </div>

            <div className="rounded-lg border border-line bg-paper p-3 text-center">
              <span className="text-xs text-ink-soft">Loans tracked</span>
              <p className="mt-1 font-mono text-2xl font-bold text-ink">
                {profile.stats.loanCount}
              </p>
            </div>
          </div>
        </Card>

        {/* Change password */}
        <Card title="Change password">
          {passwordError && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-[#e6c4b8] bg-rust-soft px-4 py-2.5 text-xs text-rust"
            >
              {passwordError}
            </p>
          )}

          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <Input
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
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

            <div className="flex items-center justify-between pt-1">
              <Button type="submit" loading={savingPassword}>
                Update password
              </Button>

              <AppLink
                href="/forgot-password"
                className="text-xs font-medium text-green hover:underline"
              >
                Forgot password?
              </AppLink>
            </div>
          </form>
        </Card>

        {/* Recent activity */}
        <Card title="Recent activity">
          {activity.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing recorded yet.</p>
          ) : (
            <div className="flex max-h-72 flex-col divide-y divide-line-soft overflow-y-auto pr-1">
              {activity.map((item, index) => (
                <div
                  key={item.id ?? `${item.action}-${item.createdAt}-${index}`}
                  className="flex items-center justify-between py-2 text-xs"
                >
                  <span
                    className={
                      item.action === "login_failed"
                        ? "font-medium text-rust"
                        : "text-ink"
                    }
                  >
                    {item.label}
                  </span>
                  <span className="text-[11px] text-ink-soft">
                    {formatDate(item.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-[11px] text-ink-soft leading-normal">
            A record of sign-ins and changes to your account to help spot any
            unauthorized activity.
          </p>
        </Card>

        {/* Danger zone */}
        <div className="md:col-span-2">
          <Card className="border-rust/40 bg-rust-soft/10">
            <h2 className="text-lg font-bold text-rust">Danger zone</h2>
            <p className="mt-1 mb-4 text-xs text-ink-soft leading-relaxed">
              Your account and everything attached to it will be deactivated
              immediately. You have 30 days to change your mind by simply
              logging back in. After 30 days, your data is permanently deleted.
            </p>

            {deleteError && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-[#e6c4b8] bg-rust-soft px-4 py-2.5 text-xs text-rust"
              >
                {deleteError}
              </p>
            )}

            <form
              onSubmit={handleDeleteSubmit}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <Input
                  label="Enter your password to confirm deletion"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                variant="danger"
                loading={deleting}
                className="sm:h-[46px]"
              >
                Delete my account
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
