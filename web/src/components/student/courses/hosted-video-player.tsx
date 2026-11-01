"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Gauge,
  Loader2,
  RotateCcw,
  RotateCw,
  Settings2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** What /api/content/[id]/video answers with. */
interface PlaybackPayload {
  provider: string;
  hls: string | null;
  mp4: Record<string, string>;
  thumbnail: string | null;
  durationSeconds: number | null;
  isDownloadable: boolean;
  offlineLicenseDays: number;
  expiresAt: string;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const AUTO = "auto";

/** The same five-second step the app uses, so the two feel like one product. */
const SEEK_STEP_SECONDS = 5;

function formatSpeed(speed: number): string {
  return Number.isInteger(speed) ? `${speed}` : `${speed}`;
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/**
 * Plays a video we host, from a URL that is signed per request and expires.
 *
 * The browser's own controls stay: they are keyboard-accessible, they match
 * what the student expects of a video on the web, and reimplementing a
 * scrubber in HTML earns nothing. What is added is the three things the
 * native control set has no concept of and the app does -- a five-second
 * step, a speed menu and a manual quality choice -- so the website and the
 * app behave the same way rather than nearly the same way.
 *
 * HLS goes through hls.js everywhere except Safari, which plays it natively
 * and would be made worse by a JavaScript layer over the top.
 */
export function HostedVideoPlayer({
  contentItemId,
  title,
  startAt,
  allowDownload,
  onTick,
  onFlush,
  onEnded,
}: {
  contentItemId: string;
  title: string;
  startAt: number;
  allowDownload: boolean;
  onTick: (pct: number, position: number) => void;
  onFlush: (pct: number, position: number) => void;
  onEnded: (position: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // The hls.js instance, held loosely: the package is imported dynamically so
  // its 150 KB never reaches a student who only opens PDFs.
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const restoredForRef = useRef<string | null>(null);

  const [payload, setPayload] = useState<PlaybackPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState<string>(AUTO);
  const [resumePrompt, setResumePrompt] = useState(false);

  // Fetch the signed URLs.
  //
  // Nothing is reset here first, because nothing needs to be: the caller keys
  // this component on the content item, so switching lessons in the sidebar
  // mounts a fresh one rather than reusing this state. That is also what
  // stops one lesson ever being shown through another's expiring token.
  useEffect(() => {
    let active = true;

    fetch(`/api/content/${contentItemId}/video`, { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(body?.error ?? "This video is temporarily unavailable.");
          return;
        }

        setPayload((await response.json()) as PlaybackPayload);
      })
      .catch(() => {
        if (active) setError("Could not reach the video. Check your connection.");
      });

    return () => {
      active = false;
    };
  }, [contentItemId]);

  const source = payload
    ? quality === AUTO
      ? payload.hls ?? Object.values(payload.mp4)[0] ?? null
      : payload.mp4[quality] ?? payload.hls
    : null;

  const isHls = !!source && /\.m3u8(\?|$)/i.test(source);

  // Attach the source. Re-runs on a quality change, which is why the position
  // is captured and restored here: swapping the source resets the element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    const resumeAt = video.currentTime;
    const wasPlaying = !video.paused && !video.ended;

    hlsRef.current?.destroy();
    hlsRef.current = null;

    let cancelled = false;

    const restore = () => {
      if (resumeAt > 0) video.currentTime = resumeAt;
      video.playbackRate = speed;
      if (wasPlaying) void video.play().catch(() => undefined);
    };

    // Safari plays HLS itself. Layering hls.js over it costs CPU and breaks
    // AirPlay, so it is only used where the browser cannot.
    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";

    if (isHls && !nativeHls) {
      import("hls.js")
        .then(({ default: Hls }) => {
          if (cancelled || !Hls.isSupported()) {
            video.src = source;
            restore();
            return;
          }

          const hls = new Hls({ enableWorker: true });
          hls.loadSource(source);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, restore);
          hls.on(Hls.Events.ERROR, (_event, data) => {
            // Only fatal errors are worth telling the student about; hls.js
            // recovers from the rest on its own.
            if (data.fatal) {
              setError("Playback stopped. Please reload the lesson.");
            }
          });
          hlsRef.current = hls;
        })
        .catch(() => {
          if (!cancelled) {
            setError("Could not start the video player.");
          }
        });
    } else {
      video.src = source;
      restore();
    }

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
    // `speed` is read inside `restore` but must not re-attach the source; it
    // is applied by its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, isHls]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed, source]);

  const readProgress = useCallback((video: HTMLVideoElement) => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const position = video.currentTime;
    return { pct: duration > 0 ? (position / duration) * 100 : 0, position };
  }, []);

  const nudge = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const next = video.currentTime + seconds;
    video.currentTime = Math.min(
      duration > 0 ? duration : next,
      Math.max(0, next)
    );
  };

  const resume = () => {
    const video = videoRef.current;
    setResumePrompt(false);
    if (video) {
      video.currentTime = startAt;
      void video.play().catch(() => undefined);
    }
  };

  if (error) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
        <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <p className="text-sm font-medium text-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-brand-orange" />
      </div>
    );
  }

  const qualities = Object.keys(payload.mp4).sort(
    (a, b) => Number(b) - Number(a)
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <video
          ref={videoRef}
          key={contentItemId}
          controls
          playsInline
          preload="metadata"
          poster={payload.thumbnail ?? undefined}
          controlsList={allowDownload ? undefined : "nodownload"}
          className="aspect-video w-full rounded-xl bg-black"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            // Once per lesson. Remounting must not drag a student back to
            // where they were when they have deliberately scrubbed away.
            if (restoredForRef.current === contentItemId) return;
            restoredForRef.current = contentItemId;

            const duration = Number.isFinite(video.duration)
              ? video.duration
              : 0;
            if (startAt > 30 && duration > 0 && startAt < duration - 10) {
              setResumePrompt(true);
            }
          }}
          onTimeUpdate={(event) => {
            const { pct, position } = readProgress(event.currentTarget);
            onTick(pct, position);
          }}
          onPause={(event) => {
            const { pct, position } = readProgress(event.currentTarget);
            onFlush(pct, position);
          }}
          onEnded={(event) => onEnded(event.currentTarget.currentTime)}
        />

        {resumePrompt && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <p className="text-sm text-white">
                You stopped at {formatClock(startAt)}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  size="sm"
                  className="bg-brand-orange text-white hover:bg-brand-orange-dark"
                  onClick={resume}
                >
                  Resume from {formatClock(startAt)}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setResumePrompt(false)}
                >
                  Start over
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 px-2.5 text-xs"
          onClick={() => nudge(-SEEK_STEP_SECONDS)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {SEEK_STEP_SECONDS}s
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 px-2.5 text-xs"
          onClick={() => nudge(SEEK_STEP_SECONDS)}
        >
          <RotateCw className="h-3.5 w-3.5" />
          {SEEK_STEP_SECONDS}s
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2.5 text-xs"
              />
            }
          >
            <Gauge className="h-3.5 w-3.5" />
            {formatSpeed(speed)}x
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Playback speed</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SPEEDS.map((value) => (
              <DropdownMenuItem key={value} onClick={() => setSpeed(value)}>
                {value === speed && <Check className="mr-2 h-3.5 w-3.5" />}
                {value === 1 ? "Normal" : `${formatSpeed(value)}x`}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {qualities.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 px-2.5 text-xs"
                />
              }
            >
              <Settings2 className="h-3.5 w-3.5" />
              {quality === AUTO ? "Auto" : `${quality}p`}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Quality</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {payload.hls && (
                <DropdownMenuItem onClick={() => setQuality(AUTO)}>
                  {quality === AUTO && <Check className="mr-2 h-3.5 w-3.5" />}
                  Auto (recommended)
                </DropdownMenuItem>
              )}
              {qualities.map((height) => (
                <DropdownMenuItem
                  key={height}
                  onClick={() => setQuality(height)}
                >
                  {quality === height && <Check className="mr-2 h-3.5 w-3.5" />}
                  {height}p
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <span className="sr-only">Player controls for {title}</span>
      </div>
    </div>
  );
}
