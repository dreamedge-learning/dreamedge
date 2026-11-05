"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DoubtImageError,
  discardDoubtImage,
  uploadDoubtImage,
} from "@/lib/doubt-upload";
import { createClient } from "@/lib/supabase/client";

export interface ComposerResult {
  error?: string;
}

interface DoubtComposerProps {
  /** Whose folder a photo goes into. Must match who is signed in. */
  uploadAs: "student" | "staff";
  placeholder: string;
  submitLabel: string;
  minLength: number;
  maxLength: number;
  /**
   * Writes the doubt or reply. Returning an error keeps the text in the box
   * and takes back the uploaded photo, so a refused message can be retried
   * without leaving files behind.
   */
  onSubmit: (input: { body: string; imagePath: string | null }) => Promise<ComposerResult>;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * The text-and-photo box, shared by the student's "Ask a doubt" form, their
 * follow-ups and the teacher's reply box, so all three behave the same way.
 */
export function DoubtComposer({
  uploadAs,
  placeholder,
  submitLabel,
  minLength,
  maxLength,
  onSubmit,
  disabled = false,
  autoFocus = false,
}: DoubtComposerProps) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The preview is an object URL, which holds the file in memory until it is
  // revoked. Revoked when the photo changes and when the box goes away.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const trimmed = body.trim();
  const tooShort = trimmed.length < minLength;
  const canSend = !busy && !disabled && !tooShort && trimmed.length <= maxLength;

  function pickFile(next: File | null) {
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSend) return;

    setBusy(true);
    const supabase = createClient();
    let imagePath: string | null = null;

    try {
      if (file) {
        imagePath = await uploadDoubtImage(supabase, file, uploadAs);
      }

      const result = await onSubmit({ body: trimmed, imagePath });
      if (result.error) {
        if (imagePath) await discardDoubtImage(supabase, imagePath);
        toast.error(result.error);
        return;
      }

      setBody("");
      pickFile(null);
    } catch (err) {
      if (imagePath) await discardDoubtImage(supabase, imagePath);
      if (err instanceof DoubtImageError) {
        toast.error(err.message);
      } else {
        console.error("DoubtComposer submit failed:", err);
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor={inputId} className="sr-only">
        {placeholder}
      </label>
      <Textarea
        id={inputId}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={3}
        autoFocus={autoFocus}
        disabled={busy || disabled}
        className="min-h-24 resize-y"
      />

      {preview && (
        <div className="relative inline-block">
          <Image
            src={preview}
            alt="Photo to attach"
            width={160}
            height={120}
            unoptimized
            className="h-28 w-auto rounded-lg border border-border object-cover"
          />
          <button
            type="button"
            onClick={() => pickFile(null)}
            disabled={busy}
            aria-label="Remove photo"
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background shadow"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={busy || disabled}
        >
          <ImagePlus className="mr-1.5 h-4 w-4" />
          {file ? "Change photo" : "Add photo"}
        </Button>

        <span className="text-xs text-muted-foreground">
          {trimmed.length > 0 && tooShort
            ? `At least ${minLength} characters`
            : `${trimmed.length}/${maxLength}`}
        </span>

        <Button
          type="submit"
          size="sm"
          disabled={!canSend}
          className="ml-auto bg-brand-orange text-white hover:bg-brand-orange-dark"
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" />
          )}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
