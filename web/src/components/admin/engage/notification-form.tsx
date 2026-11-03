"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { sendNotification } from "@/app/admin/(panel)/engage/actions";
import type { TargetOptions } from "./notifications-client";

type Channel = "in_app" | "push" | "email" | "sms";
type TargetType = "all" | "course" | "student";

/**
 * Only in-app is actually delivered today. The others are recorded so the
 * announcement is not lost, but saying so here is better than letting someone
 * believe an email went out.
 */
const UNDELIVERED: Record<string, string> = {
  push: "Push delivery isn't connected yet (FCM). This will be logged, not sent.",
  email: "Email delivery isn't connected yet (Resend). This will be logged, not sent.",
  sms: "SMS delivery isn't connected yet. This will be logged, not sent.",
};

export function NotificationFormDialog({
  open,
  onOpenChange,
  targets,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: TargetOptions;
  onSent: () => void;
}) {
  const [channel, setChannel] = useState<Channel>("in_app");
  const [targetType, setTargetType] = useState<TargetType>("all");
  const [courseId, setCourseId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function close() {
    setChannel("in_app");
    setTargetType("all");
    setCourseId("");
    setStudentId("");
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("channel", channel);
    formData.set("target_type", targetType);
    if (targetType === "course") formData.set("course_id", courseId);
    if (targetType === "student") formData.set("target_id", studentId);

    startTransition(async () => {
      const result = await sendNotification(formData);

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      const count = result?.recipientCount ?? 0;
      const push = result?.push;

      // Three cases now that push is wired:
      //   * push channel + FCM configured   → "Sent to N, delivered to M devices"
      //   * push channel + no FCM creds yet → warn that FCM is not configured
      //                                       but the inbox row was written
      //   * everything else                 → just the inbox count
      if (push?.notConfigured) {
        toast.success(
          count > 0
            ? `Saved to ${count} student${count === 1 ? "" : "s"} inbox.`
            : "Saved to the notification log.",
          {
            description:
              "FCM is not configured yet, so no push was delivered. Set FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON on the Edge Function to turn it on.",
            duration: 8000,
          },
        );
      } else if (push && push.sent !== undefined) {
        toast.success(
          `Sent to ${count} student${count === 1 ? "" : "s"}.`,
          {
            description: `Push delivered to ${push.sent} device${
              push.sent === 1 ? "" : "s"
            }${push.failed ? ` · ${push.failed} failed` : ""}${
              push.pruned ? ` · ${push.pruned} stale token${push.pruned === 1 ? "" : "s"} removed` : ""
            }.`,
          },
        );
      } else if (push?.error) {
        toast.success(
          count > 0
            ? `Saved to ${count} student${count === 1 ? "" : "s"} inbox.`
            : "Saved to the notification log.",
          {
            description: `Push dispatch failed: ${push.error}`,
            duration: 8000,
          },
        );
      } else {
        toast.success(
          count > 0
            ? `Sent to ${count} student${count === 1 ? "" : "s"}.`
            : "Saved to the notification log.",
        );
      }
      onSent();
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={close} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="notification-form-title"
          className="relative bg-popover rounded-lg border border-border shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        >
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-4">
              <h2 id="notification-form-title" className="text-lg font-semibold">
                New Notification
              </h2>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="n-title">Title *</Label>
                  <Input id="n-title" name="title" required maxLength={150} />
                </div>

                <div>
                  <Label htmlFor="n-message">Message *</Label>
                  <Textarea id="n-message" name="message" required rows={4} maxLength={1000} />
                </div>

                <div>
                  <Label>Channel</Label>
                  <Select
                    value={channel}
                    onValueChange={(v) => v && setChannel(v as Channel)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_app">In-app</SelectItem>
                      <SelectItem value="push">Push</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                  {UNDELIVERED[channel] && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-500">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
                      {UNDELIVERED[channel]}
                    </p>
                  )}
                </div>

                <div>
                  <Label>Send to</Label>
                  <Select
                    value={targetType}
                    onValueChange={(v) => v && setTargetType(v as TargetType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All active students</SelectItem>
                      <SelectItem value="course">Students in one course</SelectItem>
                      <SelectItem value="student">One student</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {targetType === "course" && (
                  <div>
                    <Label>Course *</Label>
                    <Select value={courseId} onValueChange={(v) => v && setCourseId(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a course" />
                      </SelectTrigger>
                      <SelectContent>
                        {targets.courses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {targetType === "student" && (
                  <div>
                    <Label>Student *</Label>
                    <Select value={studentId} onValueChange={(v) => v && setStudentId(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a student" />
                      </SelectTrigger>
                      <SelectContent>
                        {targets.students.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.full_name} — {s.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label htmlFor="n-action">Action URL</Label>
                  <Input
                    id="n-action"
                    name="action_url"
                    type="url"
                    placeholder="https://dreamedgelearning.com/courses/..."
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border p-4">
              <Button type="button" variant="ghost" onClick={close} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-brand-orange hover:bg-brand-orange-dark text-white"
              >
                {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {isPending ? "Sending..." : "Send"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
