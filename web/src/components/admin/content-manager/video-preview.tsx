"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getVideoPreviewUrl } from "@/app/admin/(panel)/content/manager/video-actions";

/**
 * Watching the lesson before it goes out.
 *
 * The point is catching a bad take while it is still a draft, which is why the
 * in-browser editor was dropped in favour of this plus "Replace video": the
 * review is the part that was missing, not the trimming.
 *
 * hls.js is loaded only when the admin asks for a preview. It is a few hundred
 * kilobytes and most visits to this panel never press the button.
 */
export function VideoPreview({ contentItemId }: { contentItemId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!url || !element) return;

    // Safari plays HLS natively and breaks if hls.js attaches as well.
    if (element.canPlayType("application/vnd.apple.mpegurl")) {
      element.src = url;
      return;
    }

    let destroy: (() => void) | undefined;
    let cancelled = false;

    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) {
        if (!cancelled) element.src = url;
        return;
      }

      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(element);
      destroy = () => hls.destroy();
    });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  async function open() {
    setLoading(true);
    const result = await getVideoPreviewUrl(contentItemId);
    setLoading(false);

    if (result.error || !result.data) {
      toast.error(result.error ?? "Could not open the preview.");
      return;
    }
    setUrl(result.data.url);
  }

  if (!url) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void open()}
      >
        {loading ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Eye className="mr-2 h-3.5 w-3.5" />
        )}
        Preview
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-border bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          className="aspect-video w-full"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          This preview link stops working in about ten minutes.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setUrl(null)}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Close
        </Button>
      </div>
    </div>
  );
}
