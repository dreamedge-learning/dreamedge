"use client";

import Image from "next/image";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Pencil,
  Lock,
  Camera,
  Copy,
  Check,
  Calendar,
  Shield,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/student/auth/password-input";
import { INDIAN_STATES } from "@/lib/constants/indian-states";
import type { Database } from "@/types/supabase";
import {
  updateProfile,
  updateAvatar,
  changePassword,
} from "@/app/(student)/dashboard/profile/actions";
import { getInitials } from "@/lib/format";

/**
 * Exactly the live `students` row — no hand-written shape to drift from the
 * schema. The table has no school_name / free_trial_expires_at / is_active
 * column; account state lives in the `status` enum.
 */
type Student = Database["public"]["Tables"]["students"]["Row"];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function ProfileContent({ student }: { student: Student }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [savePending, startSaveTransition] = useTransition();
  const [avatarPending, startAvatarTransition] = useTransition();
  const [passwordPending, startPasswordTransition] = useTransition();

  const [newPassword, setNewPassword] = useState("");

  const strengthLabel =
    newPassword.length === 0
      ? null
      : newPassword.length < 8
        ? "Too short"
        : newPassword.length < 12
          ? "Good"
          : "Strong";

  const strengthColor =
    newPassword.length < 8
      ? "bg-red-500"
      : newPassword.length < 12
        ? "bg-yellow-500"
        : "bg-green-500";

  function copyReferralCode() {
    if (!student.referral_code) return;
    navigator.clipboard.writeText(student.referral_code).then(
      () => {
        setCopiedCode(true);
        toast.success("Referral code copied!");
        setTimeout(() => setCopiedCode(false), 2000);
      },
      () => toast.error("Failed to copy")
    );
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.set("avatar", file);

    startAvatarTransition(async () => {
      const result = await updateAvatar(formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Profile photo updated!");
        router.refresh();
      }
    });

    e.target.value = "";
  }

  function handleProfileSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startSaveTransition(async () => {
      const result = await updateProfile(formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Profile updated!");
        setEditing(false);
        router.refresh();
      }
    });
  }

  function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const pw = formData.get("new_password") as string;
    const confirm = formData.get("confirm_password") as string;

    if (pw.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }

    if (pw !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }

    startPasswordTransition(async () => {
      const result = await changePassword(formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Password updated!");
        setNewPassword("");
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  const isActive = student.status === "active";
  const statusLabel =
    student.status === "active"
      ? "Active"
      : student.status === "blocked"
        ? "Blocked"
        : "Inactive";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account information
        </p>
      </div>

      {/* Avatar Section */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="relative">
          {student.avatar_url ? (
            <Image
              src={student.avatar_url}
              alt={student.full_name}
              width={96}
              height={96}
              className="h-24 w-24 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-orange text-2xl font-semibold text-white ring-2 ring-border">
              {getInitials(student.full_name)}
            </div>
          )}
          {avatarPending && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>
        <h2 className="mt-3 text-lg font-semibold text-foreground">
          {student.full_name}
        </h2>
        <p className="text-sm text-muted-foreground">{student.email}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={avatarPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="mr-1.5 h-3.5 w-3.5" />
          Change Photo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleAvatarChange}
        />
        {student.referral_code && (
          <button
            type="button"
            onClick={copyReferralCode}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            Referral: {student.referral_code}
            {copiedCode ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      {/* Personal Information Card */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="font-semibold text-foreground">
            Personal Information
          </h3>
          {!editing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleProfileSave} className="p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  defaultValue={student.full_name}
                  required
                  minLength={2}
                  maxLength={100}
                  disabled={savePending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Input
                    id="email"
                    value={student.email ?? ""}
                    disabled
                    className="pr-8 opacity-60"
                  />
                  <Lock className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Contact support to change email
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={student.phone ?? ""}
                  placeholder="9876543210"
                  pattern="\d{10}"
                  title="10-digit phone number"
                  disabled={savePending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="class_display">Class</Label>
                <Input
                  id="class_display"
                  value={student.class ?? "—"}
                  disabled
                  className="opacity-60"
                />
                <p className="text-xs text-muted-foreground">
                  Cannot be changed after registration
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  name="city"
                  defaultValue={student.city ?? ""}
                  placeholder="Your city"
                  disabled={savePending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <select
                  id="state"
                  name="state"
                  defaultValue={student.state ?? ""}
                  disabled={savePending}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                >
                  <option value="">Select state</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <Button
                type="submit"
                disabled={savePending}
                className="bg-brand-orange text-white hover:bg-brand-orange-dark"
              >
                {savePending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={savePending}
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
            <InfoRow label="Full Name" value={student.full_name} />
            <InfoRow label="Email" value={student.email ?? "—"} badge="Verified" />
            <InfoRow label="Phone" value={student.phone ?? "—"} />
            <InfoRow label="Class" value={student.class ?? "—"} />
            <InfoRow label="City" value={student.city ?? "—"} />
            <InfoRow label="State" value={student.state ?? "—"} />
          </div>
        )}
      </div>

      {/* Security Card */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h3 className="font-semibold text-foreground">Security</h3>
        </div>
        <form onSubmit={handlePasswordChange} className="p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Update your password to keep your account secure.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:max-w-sm">
            <div className="space-y-2">
              <Label htmlFor="current_password">Current Password</Label>
              <PasswordInput
                id="current_password"
                name="current_password"
                placeholder="Enter current password"
                required
                disabled={passwordPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_password">New Password</Label>
              <PasswordInput
                id="new_password"
                name="new_password"
                placeholder="Min. 8 characters"
                required
                minLength={8}
                disabled={passwordPending}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              {strengthLabel && (
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${strengthColor}`}
                      style={{
                        width:
                          newPassword.length < 8
                            ? "33%"
                            : newPassword.length < 12
                              ? "66%"
                              : "100%",
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {strengthLabel}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm New Password</Label>
              <PasswordInput
                id="confirm_password"
                name="confirm_password"
                placeholder="Re-enter new password"
                required
                minLength={8}
                disabled={passwordPending}
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={passwordPending}
            className="mt-5 bg-brand-orange text-white hover:bg-brand-orange-dark"
          >
            {passwordPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              "Update Password"
            )}
          </Button>
        </form>
      </div>

      {/* Account Info Card */}
      <div className="mt-6 rounded-xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h3 className="font-semibold text-foreground">Account</h3>
        </div>
        <div className="space-y-3 p-6">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Member since</span>
            <span className="font-medium text-foreground">
              {student.created_at ? formatDate(student.created_at) : "—"}
            </span>
          </div>

          {student.referral_code && (
            <div className="flex items-center gap-2 text-sm">
              <Copy className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Referral Code</span>
              <button
                type="button"
                onClick={copyReferralCode}
                className="font-medium text-foreground hover:text-brand-orange transition-colors"
              >
                {student.referral_code}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Account Status</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                isActive
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">{value}</p>
        {badge && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
