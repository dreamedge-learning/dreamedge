"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Plus, Trash2, Users, BookOpen, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/admin/dashboard/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExportButton } from "@/components/admin/export-button";
import { NotificationFormDialog } from "./notification-form";
import { deleteNotification } from "@/app/admin/(panel)/engage/actions";

export interface NotificationRow {
  id: string;
  title: string;
  message: string;
  channel: string;
  target_type: string;
  target_id: string | null;
  course_id: string | null;
  action_url: string | null;
  thumbnail_url: string | null;
  sent_at: string;
  recipient_count: number;
}

export interface TargetOptions {
  courses: { id: string; title: string }[];
  students: { id: string; full_name: string; email: string }[];
}

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In-app",
  push: "Push",
  email: "Email",
  sms: "SMS",
};

function TargetIcon({ type }: { type: string }) {
  if (type === "course") return <BookOpen className="h-3.5 w-3.5" />;
  if (type === "student") return <UserIcon className="h-3.5 w-3.5" />;
  return <Users className="h-3.5 w-3.5" />;
}

function targetLabel(n: NotificationRow, targets: TargetOptions): string {
  if (n.target_type === "course") {
    return targets.courses.find((c) => c.id === n.course_id)?.title ?? "A course";
  }
  if (n.target_type === "student") {
    return targets.students.find((s) => s.id === n.target_id)?.full_name ?? "One student";
  }
  return "All students";
}

export function NotificationsClient({
  initialData,
  targets,
}: {
  initialData: NotificationRow[];
  targets: TargetOptions;
}) {
  const router = useRouter();
  const items = initialData;
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<NotificationRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const target = pendingDelete;
    if (!target) return;

    startTransition(async () => {
      const result = await deleteNotification(target.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setPendingDelete(null);
      toast.success("Notification removed from the log.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Send announcements to every student, one course, or one person.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton dataset="notifications" label="Export send log" size="default" />
          <Button
            onClick={() => setFormOpen(true)}
            className="bg-brand-orange hover:bg-brand-orange-dark text-white"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New Notification
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications sent yet"
          description="Announcements you send will be listed here with their reach."
          action={
            <Button
              onClick={() => setFormOpen(true)}
              className="bg-brand-orange hover:bg-brand-orange-dark text-white"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Send the first one
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-4 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium truncate">{n.title}</span>
                  <Badge variant="secondary">{CHANNEL_LABELS[n.channel] ?? n.channel}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <TargetIcon type={n.target_type} />
                    {targetLabel(n, targets)}
                  </span>
                  <span>
                    {n.recipient_count > 0
                      ? `${n.recipient_count} delivered`
                      : "Logged, not delivered"}
                  </span>
                  <time dateTime={n.sent_at}>
                    {new Date(n.sent_at).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${n.title}`}
                onClick={() => setPendingDelete(n)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <NotificationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        targets={targets}
        onSent={() => router.refresh()}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this notification?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the log. Students who already received it keep
              it in their notification centre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              {isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
