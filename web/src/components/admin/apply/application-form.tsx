"use client";

import { useActionState, useCallback, useState } from "react";
import { CheckCircle2, FileText, Loader2, Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createApplicationUploadTicket,
  submitAdminApplication,
} from "@/app/admin/apply/actions";
import {
  APPLICABLE_ROLES,
  DOCUMENT_ACCEPT,
  DOCUMENT_KINDS,
  DOCUMENT_LABELS,
  MAX_DOCUMENT_BYTES,
  REQUIRED_DOCUMENTS,
  ROLE_BLURBS,
  ROLE_LABELS,
  type DocumentKind,
} from "@/lib/validations/admin-application";

interface Attachment {
  kind: DocumentKind;
  path: string;
  bytes: number;
  mime: string | null;
  name: string;
}

/** Uploads straight to the signed URL, so the 10 MB file never crosses a server action. */
function putFile(url: string, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", url);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.ontimeout = () => reject(new Error("Upload timed out."));

    xhr.send(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ApplicationForm() {
  const [state, formAction, pending] = useActionState(submitAdminApplication, null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busyKind, setBusyKind] = useState<DocumentKind | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const attach = useCallback(async (kind: DocumentKind, file: File) => {
    setUploadError(null);

    if (file.size > MAX_DOCUMENT_BYTES) {
      setUploadError("Each file must be under 10 MB.");
      return;
    }

    setBusyKind(kind);
    try {
      const ticket = await createApplicationUploadTicket(kind, file.size, file.type);

      if (ticket.error || !ticket.data) {
        setUploadError(ticket.error ?? "Could not start the upload.");
        return;
      }

      await putFile(ticket.data.signedUrl, file);

      setAttachments((current) => [
        ...current.filter((item) => item.kind !== kind),
        {
          kind,
          path: ticket.data.path,
          bytes: file.size,
          mime: file.type || null,
          name: file.name,
        },
      ]);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Upload failed. Please try again."
      );
    } finally {
      setBusyKind(null);
    }
  }, []);

  if (state !== null && "submitted" in state) {
    return (
      <div className="rounded-xl border border-white/10 bg-brand-blue/50 p-6 text-center backdrop-blur-sm">
        <CheckCircle2 className="mx-auto h-10 w-10 text-brand-orange" />
        <h2 className="mt-4 text-lg font-semibold text-white">Application received</h2>
        <p className="mt-2 text-sm text-brand-gray">
          The Dream Edge super admin will review it and get in touch by email. You
          have no access to the panel until your application is approved.
        </p>
        <p className="mt-4 text-sm text-gray-300">
          Your reference is{" "}
          <span className="font-mono tracking-wider text-white">{state.reference}</span>
        </p>
      </div>
    );
  }

  const error = state !== null && "error" in state ? state.error : null;
  const documentsValue = JSON.stringify(
    attachments.map(({ kind, path, bytes, mime }) => ({ kind, path, bytes, mime }))
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="documents" value={documentsValue} />

      <section className="rounded-xl border border-white/10 bg-brand-blue/50 p-6 backdrop-blur-sm space-y-4">
        <h2 className="text-sm font-medium text-white">About you</h2>

        <div className="space-y-1.5">
          <Label htmlFor="full_name" className="text-gray-300">Full name</Label>
          <Input id="full_name" name="full_name" required maxLength={120} placeholder="Rahul Singh" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-gray-300">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-gray-300">Mobile number</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              required
              inputMode="numeric"
              autoComplete="tel"
              placeholder="98765 43210"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-brand-blue/50 p-6 backdrop-blur-sm space-y-4">
        <h2 className="text-sm font-medium text-white">Qualification and experience</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="qualification" className="text-gray-300">Highest qualification</Label>
            <Input
              id="qualification"
              name="qualification"
              required
              maxLength={200}
              placeholder="M.Sc. Mathematics"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="institution" className="text-gray-300">
              Institution <span className="text-brand-gray">(optional)</span>
            </Label>
            <Input
              id="institution"
              name="institution"
              maxLength={200}
              placeholder="RTM Nagpur University"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="experience_years" className="text-gray-300">Years of teaching</Label>
            <Input
              id="experience_years"
              name="experience_years"
              type="number"
              required
              min={0}
              max={60}
              step={1}
              defaultValue={0}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subjects" className="text-gray-300">
              Subjects <span className="text-brand-gray">(optional)</span>
            </Label>
            <Input
              id="subjects"
              name="subjects"
              placeholder="Maths, Science"
            />
            <p className="text-xs text-brand-gray">Separate them with commas.</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-brand-blue/50 p-6 backdrop-blur-sm space-y-4">
        <div>
          <h2 className="text-sm font-medium text-white">Role you are applying for</h2>
          <p className="text-sm text-brand-gray mt-0.5">
            The super admin may approve you for a different role.
          </p>
        </div>

        <Select name="requested_role" required>
          <SelectTrigger id="requested_role">
            <SelectValue placeholder="Choose a role" />
          </SelectTrigger>
          <SelectContent>
            {APPLICABLE_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                <span className="font-medium">{ROLE_LABELS[role]}</span>
                <span className="text-muted-foreground"> — {ROLE_BLURBS[role]}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="space-y-1.5">
          <Label htmlFor="about" className="text-gray-300">
            Anything else <span className="text-brand-gray">(optional)</span>
          </Label>
          <Textarea
            id="about"
            name="about"
            rows={4}
            maxLength={2000}
            placeholder="What you teach, where you have taught, anything you want the super admin to know."
          />
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-brand-blue/50 p-6 backdrop-blur-sm space-y-4">
        <div>
          <h2 className="text-sm font-medium text-white">Documents</h2>
          <p className="text-sm text-brand-gray mt-0.5">
            PDF, JPG, PNG or WebP, up to 10 MB each. Only the super admin can open
            these.
          </p>
        </div>

        <div className="space-y-2">
          {DOCUMENT_KINDS.map((kind) => {
            const attached = attachments.find((item) => item.kind === kind);
            const required = REQUIRED_DOCUMENTS.includes(kind);

            return (
              <div
                key={kind}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
              >
                <FileText className="h-4 w-4 shrink-0 text-brand-gray" />

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">
                    {DOCUMENT_LABELS[kind]}
                    {!required && <span className="text-brand-gray"> (optional)</span>}
                  </p>
                  {attached && (
                    <p className="truncate text-xs text-brand-gray">
                      {attached.name} · {formatBytes(attached.bytes)}
                    </p>
                  )}
                </div>

                {attached ? (
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.kind !== kind)
                      )
                    }
                    className="shrink-0 rounded-md p-1.5 text-brand-gray transition-colors hover:text-white"
                    aria-label={`Remove ${DOCUMENT_LABELS[kind]}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <label className="shrink-0 cursor-pointer rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-gray-300 transition-colors hover:border-brand-orange hover:text-white">
                    {busyKind === kind ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5" />
                        Attach
                      </span>
                    )}
                    <input
                      type="file"
                      className="sr-only"
                      accept={DOCUMENT_ACCEPT}
                      disabled={busyKind !== null}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        // Cleared so picking the same file again re-fires change.
                        event.target.value = "";
                        if (file) void attach(kind, file);
                      }}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {uploadError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            {uploadError}
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={pending || busyKind !== null}
        className="w-full bg-brand-orange text-white hover:bg-brand-orange-dark"
      >
        {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Submit application
      </Button>

      <p className="text-center text-xs text-brand-gray">
        Submitting this creates no account and grants no access.
      </p>
    </form>
  );
}
