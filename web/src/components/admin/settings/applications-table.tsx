"use client";

import { useCallback, useState, useTransition } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  MailWarning,
} from "lucide-react";
import { toast } from "sonner";

import { AdminGateCard } from "@/components/admin/settings/admin-gate-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  approveApplication,
  getAdminApplications,
  getApplicationDocumentUrl,
  rejectApplication,
  type AdminApplicationRow,
  type AdminGateStatus,
} from "@/app/admin/(panel)/settings/applications-actions";
import {
  APPLICABLE_ROLES,
  DOCUMENT_KINDS,
  DOCUMENT_LABELS,
  ROLE_LABELS,
  type ApplicableRole,
  type DocumentKind,
} from "@/lib/validations/admin-application";

type Filter = "pending" | "decided" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "decided", label: "Decided" },
  { value: "all", label: "All" },
];

function statusBadge(status: AdminApplicationRow["status"]) {
  if (status === "pending") return <Badge variant="secondary">Pending</Badge>;
  if (status === "approved") return <Badge variant="outline">Approved</Badge>;
  return <Badge variant="destructive">Rejected</Badge>;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ApplicationsTable({
  initialData,
  gate,
  applyUrl,
}: {
  initialData: AdminApplicationRow[];
  gate: AdminGateStatus;
  applyUrl: string;
}) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [rows, setRows] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (next: Filter) => {
    setLoading(true);
    const result = await getAdminApplications(next);
    if (result.error) toast.error(result.error);
    setRows(result.data);
    setLoading(false);
  }, []);

  // Fetched from the click rather than from an effect on `filter`: the initial
  // rows are already the pending list, so an effect would refetch them on
  // mount for nothing.
  function changeFilter(next: Filter) {
    if (next === filter) return;
    setFilter(next);
    void load(next);
  }

  const selected = rows.find((row) => row.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <AdminGateCard status={gate} applyUrl={applyUrl} />

      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Applications</h3>
            <p className="text-sm text-muted-foreground">
              Nobody here has any access until you approve them.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => changeFilter(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === option.value
                    ? "bg-brand-orange/10 text-brand-orange"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading applications…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {filter === "pending" ? "Nothing waiting" : "No applications yet"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {filter === "pending"
                ? "Applications appear here as soon as somebody submits one."
                : "Share the application link and the access password with anyone joining the team."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Applying as</TableHead>
                  <TableHead className="hidden sm:table-cell">Experience</TableHead>
                  <TableHead className="hidden md:table-cell">Submitted</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => setOpenId(row.id)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <p className="font-medium">{row.full_name}</p>
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    </TableCell>
                    <TableCell>{ROLE_LABELS[row.requested_role]}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {row.experience_years} yr{row.experience_years === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {formatDate(row.created_at)}
                    </TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ApplicationSheet
        application={selected}
        onClose={() => setOpenId(null)}
        onDecided={() => {
          setOpenId(null);
          void load(filter);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ApplicationSheet({
  application,
  onClose,
  onDecided,
}: {
  application: AdminApplicationRow | null;
  onClose: () => void;
  onDecided: () => void;
}) {
  return (
    <Sheet open={application !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {application && (
          <ApplicationDetail
            key={application.id}
            application={application}
            onDecided={onDecided}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

interface ApprovalResult {
  link: string | null;
  emailSent: boolean;
  roleLabel: string;
}

function ApplicationDetail({
  application,
  onDecided,
}: {
  application: AdminApplicationRow;
  onDecided: () => void;
}) {
  const [role, setRole] = useState<ApplicableRole>(application.requested_role);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ApprovalResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [openingKind, setOpeningKind] = useState<DocumentKind | null>(null);

  /**
   * The window is opened on the click and pointed at the signed URL once it
   * arrives. Opening it after the await instead would be a pop-up the browser
   * blocks, because by then the click is no longer what caused it.
   */
  async function openDocument(kind: DocumentKind) {
    const target = window.open("about:blank", "_blank");
    setOpeningKind(kind);

    try {
      const response = await getApplicationDocumentUrl(application.id, kind);

      if (response.error || !response.data) {
        target?.close();
        toast.error(response.error ?? "Could not open that document.");
        return;
      }

      if (target) {
        target.opener = null;
        target.location.replace(response.data.url);
      }
    } finally {
      setOpeningKind(null);
    }
  }

  function decide(action: "approve" | "reject") {
    const formData = new FormData();
    formData.set("application_id", application.id);
    if (reason.trim()) formData.set("reason", reason.trim());

    startTransition(async () => {
      if (action === "approve") {
        formData.set("role", role);
        const response = await approveApplication(formData);

        if (response.error || !response.data) {
          toast.error(response.error ?? "Could not approve that application.");
          return;
        }

        toast.success(`${application.full_name} added as ${response.data.roleLabel}`);
        setResult(response.data);
        return;
      }

      const response = await rejectApplication(formData);

      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success(
        response.data?.emailSent
          ? "Application rejected and the applicant emailed."
          : "Application rejected. The email could not be sent."
      );
      onDecided();
    });
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Added to the team</SheetTitle>
          <SheetDescription>
            {application.full_name} is now {result.roleLabel}. They set their own
            password through the link below.
          </SheetDescription>
        </SheetHeader>

        {!result.emailSent && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-500">
            <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              The email did not go out, so send this link yourself. It expires in
              24 hours.
            </p>
          </div>
        )}

        {result.link ? (
          <div className="space-y-2">
            <Label>Set-password link</Label>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                {result.link}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  void navigator.clipboard.writeText(result.link ?? "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                aria-label="Copy link"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No link could be generated. They can use &ldquo;Forgot password&rdquo;
            on the sign-in page instead.
          </p>
        )}

        <Button onClick={onDecided}>Done</Button>
      </div>
    );
  }

  const decided = application.status !== "pending";

  return (
    <div className="flex flex-col gap-5 p-6">
      <SheetHeader className="border-b border-border p-0 pb-4">
        <SheetTitle>{application.full_name}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          {statusBadge(application.status)}
          <span>Applied as {ROLE_LABELS[application.requested_role]}</span>
        </SheetDescription>
      </SheetHeader>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="break-all">{application.email}</dd>

        <dt className="text-muted-foreground">Phone</dt>
        <dd>{application.phone}</dd>

        <dt className="text-muted-foreground">Qualification</dt>
        <dd>
          {application.qualification}
          {application.institution ? `, ${application.institution}` : ""}
        </dd>

        <dt className="text-muted-foreground">Experience</dt>
        <dd>
          {application.experience_years} year
          {application.experience_years === 1 ? "" : "s"}
        </dd>

        {application.subjects.length > 0 && (
          <>
            <dt className="text-muted-foreground">Subjects</dt>
            <dd>{application.subjects.join(", ")}</dd>
          </>
        )}

        <dt className="text-muted-foreground">Submitted</dt>
        <dd>{formatDate(application.created_at)}</dd>
      </dl>

      {application.about && (
        <div>
          <p className="mb-1.5 text-sm text-muted-foreground">In their words</p>
          <p className="whitespace-pre-line rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
            {application.about}
          </p>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm text-muted-foreground">Documents</p>
        <div className="space-y-1.5">
          {DOCUMENT_KINDS.map((kind) => {
            const attached = application.documents.find((doc) => doc.kind === kind);

            return (
              <div
                key={kind}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{DOCUMENT_LABELS[kind]}</span>

                {attached ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={openingKind !== null}
                    onClick={() => void openDocument(kind)}
                  >
                    {openingKind === kind ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    Open
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Not attached</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {decided ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
          <p>
            {application.status === "approved" ? "Approved" : "Rejected"}
            {application.reviewed_at ? ` on ${formatDate(application.reviewed_at)}` : ""}
            {application.reviewer_name ? ` by ${application.reviewer_name}` : ""}.
          </p>
          {application.decision_reason && (
            <p className="mt-1.5 text-muted-foreground">{application.decision_reason}</p>
          )}
        </div>
      ) : (
        <div className="space-y-4 border-t border-border pt-5">
          <div className="space-y-1.5">
            <Label htmlFor="approve-role">Approve as</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as ApplicableRole)}
            >
              <SelectTrigger id="approve-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLICABLE_ROLES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role !== application.requested_role && (
              <p className="text-xs text-brand-orange">
                Different from the role they applied for.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="decision-reason">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="decision-reason"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Included in the email if you reject. Kept on file either way."
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              disabled={pending}
              onClick={() => decide("approve")}
            >
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Approve
            </Button>
            <Button
              variant="outline"
              className="flex-1 text-destructive hover:text-destructive"
              disabled={pending}
              onClick={() => decide("reject")}
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
