import type { Metadata } from "next";

import { NotificationsContent } from "@/components/student/dashboard/notifications-content";
import { requireCompleteStudentProfile } from "@/lib/auth-student";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Notifications",
};

export interface InboxNotification {
  id: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  title: string;
  message: string;
  channel: string;
  thumbnailUrl: string | null;
  actionUrl: string | null;
}

interface Row {
  id: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  notification:
    | {
        id: string;
        title: string;
        message: string;
        channel: string | null;
        thumbnail_url: string | null;
        action_url: string | null;
      }
    | {
        id: string;
        title: string;
        message: string;
        channel: string | null;
        thumbnail_url: string | null;
        action_url: string | null;
      }[]
    | null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function NotificationsPage() {
  const student = await requireCompleteStudentProfile(
    "/dashboard/notifications",
  );
  const supabase = await createClient();

  const { data } = await supabase
    .from("student_notifications")
    .select(
      `id, is_read, read_at, created_at,
       notification:notifications(id, title, message, channel,
         thumbnail_url, action_url)`,
    )
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as Row[];
  const notifications: InboxNotification[] = rows
    .map((row) => {
      const n = one(row.notification);
      if (!n) return null;
      return {
        id: row.id,
        isRead: row.is_read,
        readAt: row.read_at,
        createdAt: row.created_at,
        title: n.title,
        message: n.message,
        channel: n.channel ?? "in_app",
        thumbnailUrl: n.thumbnail_url,
        actionUrl: n.action_url,
      };
    })
    .filter((n): n is InboxNotification => n !== null);

  return <NotificationsContent notifications={notifications} />;
}
