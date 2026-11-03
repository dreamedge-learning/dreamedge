"use client";

import { useState, useTransition } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { updateSettings, getSettings } from "@/app/admin/(panel)/settings/actions";
import type { SiteSetting } from "@/app/admin/(panel)/settings/actions";

interface PlatformSettingsProps {
  initialData: SiteSetting[];
}

function settingsToMap(settings: SiteSetting[]): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  return map;
}

export function PlatformSettings({ initialData }: PlatformSettingsProps) {
  const [settings, setSettings] = useState(() => settingsToMap(initialData));
  const [isLoading, setIsLoading] = useState(false);

  function get(key: string, fallback: unknown = "") {
    return settings[key] ?? fallback;
  }

  function set(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function reload() {
    setIsLoading(true);
    const result = await getSettings();
    if (!result.error && result.data) {
      setSettings(settingsToMap(result.data));
    }
    setIsLoading(false);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[200px] rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GeneralSection
        platformName={get("platform_name", "Dream Edge Online") as string}
        tagline={get("tagline", "") as string}
        supportEmail={get("support_email", "") as string}
        supportPhone={get("support_phone", "") as string}
        onChange={set}
        onSuccess={reload}
      />

      <Separator />

      <SocialLinksSection
        links={get("social_links", { youtube: "", instagram: "", telegram: "", whatsapp: "" }) as Record<string, string>}
        onChange={(links) => set("social_links", links)}
        onSuccess={reload}
      />

      <Separator />

      <FeatureTogglesSection settings={settings} onChange={set} onSuccess={reload} />

      <Separator />

      <LimitsSection settings={settings} onChange={set} onSuccess={reload} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------

function GeneralSection({
  platformName, tagline, supportEmail, supportPhone, onChange, onSuccess,
}: {
  platformName: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  onChange: (key: string, val: unknown) => void;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateSettings([
        { key: "platform_name", value: platformName },
        { key: "tagline", value: tagline },
        { key: "support_email", value: supportEmail },
        { key: "support_phone", value: supportPhone },
      ]);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("General settings saved");
      onSuccess();
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <h3 className="font-semibold text-base">General</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="s-name">Platform Name</Label>
          <Input
            id="s-name"
            value={platformName}
            onChange={(e) => onChange("platform_name", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-tagline">Tagline</Label>
          <Input
            id="s-tagline"
            value={tagline}
            onChange={(e) => onChange("tagline", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-email">Support Email</Label>
          <Input
            id="s-email"
            type="email"
            value={supportEmail}
            onChange={(e) => onChange("support_email", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-phone">Support Phone</Label>
          <Input
            id="s-phone"
            type="tel"
            value={supportPhone}
            onChange={(e) => onChange("support_phone", e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Social Links
// ---------------------------------------------------------------------------

function SocialLinksSection({
  links, onChange, onSuccess,
}: {
  links: Record<string, string>;
  onChange: (links: Record<string, string>) => void;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function updateLink(key: string, value: string) {
    onChange({ ...links, [key]: value });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateSettings([
        { key: "social_links", value: links },
      ]);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Social links saved");
      onSuccess();
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <h3 className="font-semibold text-base">Social Links</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="s-yt">YouTube URL</Label>
          <Input
            id="s-yt"
            value={links.youtube ?? ""}
            onChange={(e) => updateLink("youtube", e.target.value)}
            placeholder="https://youtube.com/@dreamedge"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-ig">Instagram URL</Label>
          <Input
            id="s-ig"
            value={links.instagram ?? ""}
            onChange={(e) => updateLink("instagram", e.target.value)}
            placeholder="https://instagram.com/dreamedge"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-tg">Telegram URL</Label>
          <Input
            id="s-tg"
            value={links.telegram ?? ""}
            onChange={(e) => updateLink("telegram", e.target.value)}
            placeholder="https://t.me/dreamedge"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-wa">WhatsApp Number</Label>
          <Input
            id="s-wa"
            value={links.whatsapp ?? ""}
            onChange={(e) => updateLink("whatsapp", e.target.value)}
            placeholder="+91 98765 43210"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Feature Toggles
// ---------------------------------------------------------------------------

function FeatureTogglesSection({
  settings, onChange, onSuccess,
}: {
  settings: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  // `inert` marks a switch with nothing behind it yet. It is labelled rather
  // than hidden, because the row already exists and the feature is planned --
  // but an unlabelled switch that does nothing is worse than no switch, which
  // is what every one of these was until the settings were wired up.
  const toggles: {
    key: string;
    label: string;
    warning?: string;
    inert?: string;
  }[] = [
    { key: "maintenance_mode", label: "Maintenance Mode", warning: "Students will see the maintenance page" },
    { key: "student_registration_open", label: "Student Registration Open" },
    { key: "razorpay_enabled", label: "Razorpay Payments Enabled" },
    { key: "manual_payment_enabled", label: "Manual Payments Enabled" },
    { key: "referral_system_enabled", label: "Referral System Enabled" },
    {
      key: "watermark_enabled",
      label: "Video Watermark Enabled",
      inert: "No watermark is built yet — this has no effect",
    },
  ];

  function handleSave() {
    startTransition(async () => {
      const entries = toggles.map((t) => ({
        key: t.key,
        value: settings[t.key] ?? false,
      }));
      const result = await updateSettings(entries);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Feature toggles saved");
      onSuccess();
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <h3 className="font-semibold text-base">Feature Toggles</h3>
      <div className="space-y-3">
        {toggles.map((t) => {
          const checked = settings[t.key] === true;
          return (
            <div key={t.key} className="flex items-center justify-between gap-4 py-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm">{t.label}</span>
                {t.warning && checked && !t.inert && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700 shrink-0">
                    <AlertTriangle className="mr-0.5 h-3 w-3" />
                    {t.warning}
                  </Badge>
                )}
                {t.inert && (
                  <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
                    {t.inert}
                  </Badge>
                )}
              </div>
              <Switch
                checked={checked}
                onCheckedChange={(val) => onChange(t.key, val)}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

function LimitsSection({
  settings, onChange, onSuccess,
}: {
  settings: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateSettings([
        { key: "free_trial_days", value: Number(settings.free_trial_days ?? 7) },
        { key: "max_devices_per_student", value: Number(settings.max_devices_per_student ?? 2) },
        { key: "video_quality_default", value: settings.video_quality_default ?? "720p" },
      ]);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Limits saved");
      onSuccess();
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="text-base font-semibold">Limits</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved, but not enforced anywhere yet — there is no free trial, no
          device limit and no player default reading these. They are here for
          when those land.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="s-trial">Free Trial Days</Label>
          <Input
            id="s-trial"
            type="number"
            min={0}
            max={365}
            value={String(settings.free_trial_days ?? 7)}
            onChange={(e) => onChange("free_trial_days", Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-devices">Max Devices per Student</Label>
          <Input
            id="s-devices"
            type="number"
            min={1}
            max={10}
            value={String(settings.max_devices_per_student ?? 2)}
            onChange={(e) => onChange("max_devices_per_student", Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-quality">Default Video Quality</Label>
          <Select
            value={String(settings.video_quality_default ?? "720p")}
            onValueChange={(val) => onChange("video_quality_default", val)}
          >
            <SelectTrigger id="s-quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="360p">360p</SelectItem>
              <SelectItem value="480p">480p</SelectItem>
              <SelectItem value="720p">720p</SelectItem>
              <SelectItem value="1080p">1080p</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </Card>
  );
}
