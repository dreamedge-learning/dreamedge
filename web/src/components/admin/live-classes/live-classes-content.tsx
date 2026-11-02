"use client";

import { useState, useTransition } from "react";
import {
  CalendarClock,
  Clapperboard,
  CircleCheck,
  Film,
  Plus,
  Radio,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { ExportButton } from "@/components/admin/export-button";
import { ScheduleClassDialog } from "./schedule-class-dialog";
import { AttachRewatchDialog } from "./attach-rewatch-dialog";
import type { LiveClassRow } from "@/app/admin/(panel)/live-classes/actions";
import { transitionLiveClass, detachRewatchContent } from "@/app/admin/(panel)/live-classes/actions";

interface LiveClassesContentProps {
  scheduled: LiveClassRow[];
  live: LiveClassRow[];
  pendingRecording: LiveClassRow[];
  rewatchLibrary: LiveClassRow[];
  teachers: { id: string; full_name: string; role: string }[];
  courses: { id: string; title: string; slug: string }[];
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

export function LiveClassesContent({
  scheduled,
  live,
  pendingRecording,
  rewatchLibrary,
  teachers,
  courses,
}: LiveClassesContentProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rewatchTarget, setRewatchTarget] = useState<LiveClassRow | null>(null);
  const [_isPending, startTransition] = useTransition();

  function handleTransition(
    cls: LiveClassRow,
    nextStatus: "live" | "ended" | "cancelled",
    options?: { meeting_url?: string | null; recording_url?: string | null }
  ) {
    startTransition(async () => {
      const result = await transitionLiveClass(cls.id, nextStatus, options);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong");
        return;
      }
      toast.success(
        nextStatus === "live"
          ? `${cls.title} is now live`
          : nextStatus === "ended"
          ? `${cls.title} ended — upload the recording when ready`
          : `${cls.title} cancelled`
      );
    });
  }

  function handleDetach(cls: LiveClassRow) {
    startTransition(async () => {
      const result = await detachRewatchContent(cls.id);
      if (!result.ok) toast.error(result.error ?? "Something went wrong");
      else toast.success("Rewatch detached — class moved back to Pending");
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Live Classes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule, run, and publish rewatch recordings in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton dataset="live-classes" label="Export schedule" size="default" />
          <ExportButton dataset="recordings" label="Export recordings" size="default" />
          <Button
            onClick={() => setScheduleOpen(true)}
            className="bg-brand-orange text-white hover:bg-brand-orange-dark"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Schedule class
          </Button>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={CalendarClock} label="Scheduled" value={scheduled.length} />
        <StatCard
          icon={Radio}
          label="Live now"
          value={live.length}
          tone={live.length > 0 ? "live" : undefined}
        />
        <StatCard icon={Clapperboard} label="Pending upload" value={pendingRecording.length} />
        <StatCard icon={Film} label="In rewatch library" value={rewatchLibrary.length} />
      </div>

      <Tabs defaultValue={live.length > 0 ? "live" : "scheduled"}>
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="scheduled">
            Scheduled
            {scheduled.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {scheduled.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="live">
            Live
            {live.length > 0 && (
              <Badge className="ml-2 bg-red-500/15 text-red-600 dark:text-red-400">
                {live.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending_recording">
            Pending upload
            {pendingRecording.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingRecording.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rewatch_library">
            Rewatch library
            {rewatchLibrary.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {rewatchLibrary.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scheduled" className="mt-4">
          <ClassList
            classes={scheduled}
            emptyMessage="Nothing on the schedule yet — click Schedule class to create one."
            renderActions={(cls) => (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleTransition(cls, "live", {
                      meeting_url: cls.meeting_url ?? null,
                    })
                  }
                >
                  <Radio className="mr-1.5 h-3.5 w-3.5" />
                  Go live
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-500/10 hover:text-red-700"
                  onClick={() => handleTransition(cls, "cancelled")}
                >
                  Cancel
                </Button>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="live" className="mt-4">
          <ClassList
            classes={live}
            emptyMessage="No class is live right now."
            renderActions={(cls) => (
              <>
                {cls.meeting_url && (
                  <Button
                    size="sm"
                    variant="outline"
                    render={
                      <a href={cls.meeting_url} target="_blank" rel="noopener noreferrer" />
                    }
                  >
                    <Video className="mr-1.5 h-3.5 w-3.5" />
                    Open room
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTransition(cls, "ended")}
                >
                  <CircleCheck className="mr-1.5 h-3.5 w-3.5" />
                  End class
                </Button>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="pending_recording" className="mt-4">
          <PendingUploadHelp />
          <div className="mt-4">
            <ClassList
              classes={pendingRecording}
              emptyMessage="Every ended class has its rewatch posted."
              renderActions={(cls) => (
                <Button
                  size="sm"
                  className="bg-brand-orange text-white hover:bg-brand-orange-dark"
                  onClick={() => setRewatchTarget(cls)}
                >
                  <Film className="mr-1.5 h-3.5 w-3.5" />
                  Attach rewatch
                </Button>
              )}
            />
          </div>
        </TabsContent>

        <TabsContent value="rewatch_library" className="mt-4">
          <ClassList
            classes={rewatchLibrary}
            emptyMessage="No rewatches posted yet."
            renderActions={(cls) => (
              <>
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Published
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => handleDetach(cls)}
                >
                  Detach
                </Button>
              </>
            )}
          />
        </TabsContent>
      </Tabs>

      <ScheduleClassDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        courses={courses}
        teachers={teachers}
      />

      <AttachRewatchDialog
        liveClass={rewatchTarget}
        onOpenChange={(open: boolean) => !open && setRewatchTarget(null)}
      />
    </div>
  );
}

/* ============================================================ */

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone?: "live";
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-4 ${
        tone === "live"
          ? "border-red-500/30 bg-red-500/5"
          : "border-border"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            tone === "live"
              ? "bg-red-500/15 text-red-600 dark:text-red-400"
              : "bg-muted text-foreground/70"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function ClassList({
  classes,
  emptyMessage,
  renderActions,
}: {
  classes: LiveClassRow[];
  emptyMessage: string;
  renderActions: (c: LiveClassRow) => React.ReactNode;
}) {
  if (classes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {classes.map((cls) => (
        <li
          key={cls.id}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {cls.course?.title && (
                <Badge variant="secondary">{cls.course.title}</Badge>
              )}
              {cls.status === "live" && (
                <Badge className="animate-pulse bg-red-500 text-white">
                  <Radio className="mr-1 h-3 w-3" /> LIVE
                </Badge>
              )}
            </div>
            <p className="mt-1 text-base font-semibold text-foreground">
              {cls.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                {dateFmt.format(new Date(cls.scheduled_at))}
              </span>
              <span>{cls.duration_minutes} min</span>
              {cls.teacher && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {cls.teacher.full_name}
                </span>
              )}
              {cls.attendee_count > 0 && (
                <span>{cls.attendee_count} attended</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {renderActions(cls)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function PendingUploadHelp() {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <p className="font-medium text-amber-800 dark:text-amber-300">
        Rewatch upload workflow
      </p>
      <p className="mt-1 text-amber-700/90 dark:text-amber-200/80">
        After a class ends, edit the recording offline (trim, clean up), upload
        it under the matching course in <strong>Content → Manager</strong>, then
        come back here and click <strong>Attach rewatch</strong>. Target: within
        3–4 hours of the end of the class.
      </p>
    </div>
  );
}
