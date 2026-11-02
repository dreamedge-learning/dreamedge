"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Loader2, Radio, Volume2, VolumeX, AlertCircle } from "lucide-react";

/**
 * A lean HLS viewer for a live class.
 *
 * No scrubber, no quality menu, no save-progress -- a live stream has
 * nowhere to scrub to and nothing to resume. What it has is a reliable
 * fullscreen frame, a LIVE badge, and a mute toggle. Safari plays HLS
 * natively; everything else goes through hls.js, which is already a
 * dependency.
 *
 * The frame maintains a 16:9 aspect ratio so the layout is stable before
 * the first segment arrives, and the <video> is `playsInline` so a tap on
 * a phone does not kick it into the OS full-screen player.
 */
interface Props {
  src: string;
  poster: string | null;
}

export function LiveStreamPlayer({ src, poster }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let cancelled = false;

    setLoading(true);
    setError(null);

    const onPlaying = () => {
      if (!cancelled) setLoading(false);
    };
    const onWaiting = () => {
      if (!cancelled) setLoading(true);
    };
    const onError = () => {
      if (!cancelled) setError("The live stream is not reachable right now.");
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("error", onError);

    // Safari plays HLS natively; forcing hls.js on top only makes it worse.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      void video.play().catch(() => {
        // Autoplay is often blocked without a user gesture when audio
        // is on. We start muted so this usually succeeds; the mute
        // button is there for the student to unmute explicitly.
      });
    } else if (Hls.isSupported()) {
      hls = new Hls({
        liveDurationInfinity: true,
        lowLatencyMode: true,
        enableWorker: true,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => undefined);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError("The live stream dropped. Trying to reconnect…");
          hls?.recoverMediaError();
        }
      });
    } else {
      // Deferred so React's rules-of-hooks lint stays happy: a state set
      // during the body of the effect would otherwise cascade on the first
      // render, which the rule is written against. Behaviour is the same.
      queueMicrotask(() => {
        if (!cancelled) setError("Your browser cannot play this stream.");
      });
    }

    return () => {
      cancelled = true;
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("error", onError);
      hls?.destroy();
    };
  }, [src]);

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    const next = !muted;
    video.muted = next;
    setMuted(next);
    if (!next) {
      // Unmute often fails to start audio without a fresh user gesture;
      // calling play again picks up where the autoplay stopped.
      void video.play().catch(() => undefined);
    }
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="h-full w-full"
        poster={poster ?? undefined}
        autoPlay
        muted
        playsInline
        controls
      />

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-white">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Connecting to the stream…
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center text-white">
          <div className="flex max-w-sm flex-col items-center gap-2">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
        <Radio className="h-3 w-3 animate-pulse" />
        Live
      </div>

      <button
        type="button"
        onClick={toggleMute}
        className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/75"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? (
          <>
            <VolumeX className="h-3.5 w-3.5" />
            Unmute
          </>
        ) : (
          <>
            <Volume2 className="h-3.5 w-3.5" />
            Mute
          </>
        )}
      </button>
    </div>
  );
}
