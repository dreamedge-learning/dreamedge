"use client";

import { useMemo, useState, useTransition } from "react";
import { Eye, FileText, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { LegalBody } from "@/components/student/legal-body";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { describeBlocks, parseLegalBody, type LegalDocument, type LegalSlug } from "@/lib/legal";
import { updateLegalDocument } from "@/app/admin/(panel)/settings/legal-actions";

/**
 * Editing the refund, privacy and terms pages.
 *
 * The body is plain text in a small fixed syntax rather than a rich-text box.
 * That is a deliberate trade: a rich editor would mean storing HTML written in
 * this panel and serving it to every student, which has to be sanitised and
 * can still go wrong. Plain text parsed into blocks cannot become markup at
 * all, and the preview beside the box shows exactly what the page will render.
 */

const SYNTAX = [
  ["## Heading", "a numbered section heading"],
  ["- item", "a bullet; consecutive lines make one list"],
  ["blank line", "separates paragraphs"],
  ["**bold**", "emphasis inside a line"],
  ["[label](/refund-policy)", "a link to another page"],
  ["{{support_email}}", "the current support address, as a link"],
];

export function LegalEditor({
  documents,
  supportEmail,
  supportPhone,
  platformName,
}: {
  documents: LegalDocument[];
  supportEmail: string;
  supportPhone: string;
  platformName: string;
}) {
  const [active, setActive] = useState<LegalSlug>(
    documents[0]?.slug ?? "refund-policy"
  );
  const [drafts, setDrafts] = useState<Record<string, LegalDocument>>(() =>
    Object.fromEntries(documents.map((document) => [document.slug, document]))
  );
  const [showPreview, setShowPreview] = useState(false);
  const [pending, startTransition] = useTransition();

  const draft = drafts[active];

  const blocks = useMemo(
    () =>
      draft
        ? parseLegalBody(draft.body, {
            support_email: supportEmail,
            support_phone: supportPhone,
            platform_name: platformName,
          })
        : [],
    [draft, supportEmail, supportPhone, platformName]
  );

  const original = documents.find((document) => document.slug === active);
  const dirty =
    draft !== undefined &&
    original !== undefined &&
    (draft.body !== original.body ||
      draft.title !== original.title ||
      draft.effective_date !== original.effective_date);

  function patch(changes: Partial<LegalDocument>) {
    setDrafts((current) => ({
      ...current,
      [active]: { ...current[active], ...changes },
    }));
  }

  function save() {
    if (!draft) return;

    const formData = new FormData();
    formData.set("slug", draft.slug);
    formData.set("title", draft.title);
    formData.set("effective_date", draft.effective_date);
    formData.set("body", draft.body);

    startTransition(async () => {
      const result = await updateLegalDocument(formData);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Policy saved — it is live now.");
    });
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        No policy pages found. The three rows are created by a migration; if
        they are missing, the public pages are showing a fallback notice.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border p-0.5">
        {documents.map((document) => (
          <button
            key={document.slug}
            type="button"
            onClick={() => setActive(document.slug)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active === document.slug
                ? "bg-brand-orange/10 text-brand-orange"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            {document.title}
          </button>
        ))}
      </div>

      {draft && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="legal-title">Page title</Label>
              <Input
                id="legal-title"
                value={draft.title}
                maxLength={160}
                onChange={(event) => patch({ title: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="legal-date">Effective date</Label>
              <Input
                id="legal-date"
                type="date"
                value={draft.effective_date.slice(0, 10)}
                onChange={(event) => patch({ effective_date: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="legal-body">Policy text</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {describeBlocks(blocks)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setShowPreview((current) => !current)}
                >
                  {showPreview ? (
                    <>
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </>
                  ) : (
                    <>
                      <Eye className="mr-1 h-3 w-3" />
                      Preview
                    </>
                  )}
                </Button>
              </div>
            </div>

            {showPreview ? (
              <div className="max-h-[32rem] overflow-y-auto rounded-md border border-border bg-background p-5">
                <article className="prose-dream prose max-w-none text-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-sm [&_p]:leading-7 [&_p]:text-foreground/80 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-sm [&_ul]:text-foreground/80 [&_li]:mt-1 [&_a]:text-brand-orange [&_a]:underline [&_strong]:text-foreground">
                  <LegalBody blocks={blocks} />
                </article>
              </div>
            ) : (
              <Textarea
                id="legal-body"
                value={draft.body}
                rows={22}
                spellCheck
                onChange={(event) => patch({ body: event.target.value })}
                className="font-mono text-xs leading-6"
              />
            )}
          </div>

          <details className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Formatting
            </summary>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              {SYNTAX.map(([token, meaning]) => (
                <div key={token} className="contents">
                  <dt className="font-mono text-foreground">{token}</dt>
                  <dd className="text-muted-foreground">{meaning}</dd>
                </div>
              ))}
            </dl>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={pending || !dirty} onClick={save}>
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save policy
            </Button>

            {dirty && (
              <span className="text-xs text-brand-orange">Unsaved changes.</span>
            )}

            <a
              href={`/${draft.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Open the live page
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
