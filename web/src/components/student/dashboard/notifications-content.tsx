"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Megaphone,
  MessageCircle,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/(student)/dashboard/notifications/actions";
import type { InboxNotification } from "@/app/(student)/dashboard/notifications/page";

/**
 * The student's notification centre.
 *
 * One card per notification, newest first, with an unread dot on the ones
 * the server has not yet seen a read receipt for. Tapping a card marks it
 * read and -- if the admin set an action URL -- navigates to it (an in-app
 * route, since every action URL we hand out starts with /). Externally-
 * targeted URLs open in a new tab.
 *
 * The layout stays single column on phones with the thumbnail capped at a
 * fixed width (`shrink-0 w-14`), so a long title cannot push it off-screen
 * at 360px.
 */
interface Props {
  notifications: InboxNotification[];
}

export function NotificationsContent({ notifications }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(notifications);
  const [pending, startTransition] = useTransition();

  const unread = items.filter((n) => !n.isRead).length;

  function handleMarkAll() {
    if (unread === 0) return;
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setItems((prev) =>
        prev.map((n) => ({
          ...n,
          isRead: true,
          readAt: n.readAt ?? new Date().toISOString(),
        })),
      );
    });
  }

  function handleTap(notification: InboxNotification) {
    if (!notification.isRead) {
      startTransition(async () => {
        const result = await markNotificationRead(notification.id);
        if (result.error) {
          console.warn(result.error);
        } else {
          setItems((prev) =>
            prev.map((n) =>
              n.id === notification.id
                ? {
                    ...n,
                    isRead: true,
                    readAt: n.readAt ?? new Date().toISOString(),
                  }
                : n,
            ),
          );
        }
      });
    }

    const target = notification.actionUrl;
    if (!target) return;
    if (target.startsWith("/")) {
      router.push(target);
    } else {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Updates from your teachers, course alerts and announcements.
          </p>
        </div>
        <button
          type="button"
          onClick={handleMarkAll}
          disabled={pending || unread === 0}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-50"
        >
          <CheckCheck className="h-4 w-4" />
          Mark all read
        </button>
      </header>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationCard notification={n} onTap={handleTap} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Bell className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-base font-semibold">All caught up</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        You have no notifications yet. New ones will appear here.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-orange-dark"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

function NotificationCard({
  notification,
  onTap,
}: {
  notification: InboxNotification;
  onTap: (n: InboxNotification) => void;
}) {
  const clickable = Boolean(notification.actionUrl);
  const Wrapper = clickable ? "button" : "div";

  return (
    <Wrapper
      type={clickable ? "button" : undefined}
      onClick={clickable ? () => onTap(notification) : undefined}
      className={
        "flex w-full gap-3 rounded-xl border p-4 text-left transition-colors sm:p-5 " +
        (notification.isRead
          ? "border-border bg-card hover:bg-muted/40"
          : "border-brand-orange/40 bg-brand-orange/5 hover:bg-brand-orange/10")
      }
      aria-label={notification.title}
    >
      {notification.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={notification.thumbnailUrl}
          alt=""
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
          <ChannelIcon channel={notification.channel} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {!notification.isRead && (
            <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-brand-orange" />
          )}
          <h3 className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug sm:text-base">
            {notification.title}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground">
            {relative(notification.createdAt)}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {notification.message}
        </p>
      </div>
    </Wrapper>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case "push":
      return <Smartphone className="h-5 w-5 text-brand-orange" />;
    case "announcement":
    case "course":
      return <Megaphone className="h-5 w-5 text-brand-orange" />;
    case "message":
      return <MessageCircle className="h-5 w-5 text-brand-orange" />;
    default:
      return <Bell className="h-5 w-5 text-brand-orange" />;
  }
}

function relative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}
