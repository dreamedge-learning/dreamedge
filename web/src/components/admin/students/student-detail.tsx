"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  BookOpen,
  FileText,
  CreditCard,
  Activity,
  Cake,
  Users,
  ShieldBan,
  ShieldCheck,
  Loader2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { isSyntheticEmail, registrationSourceLabel } from "@/lib/students/identity";
import { GENDER_OPTIONS } from "@/lib/validations/onboarding";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteStudent,
  fetchStudentDeletionImpact,
  fetchStudentDetail,
  updateStudentStatus,
} from "@/app/admin/(panel)/students/actions";
import { getInitials } from "@/lib/format";

interface StudentDetailProps {
  studentId: string | null;
  onClose: () => void;
  onStatusChange: () => void;
}

interface DeletionImpact {
  fullName: string;
  email: string | null;
  enrollmentCount: number;
  testAttemptCount: number;
  orderCount: number;
  paidOrderCount: number;
  paidRevenue: number;
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  inactive: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  blocked: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function StudentDetail({ studentId, onClose, onStatusChange }: StudentDetailProps) {
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [isFetching, startFetchTransition] = useTransition();
  const [isUpdating, startUpdateTransition] = useTransition();

  useEffect(() => {
    if (!studentId) {
      startFetchTransition(() => setDetail(null));
      return;
    }

    let cancelled = false;
    startFetchTransition(async () => {
      const result = await fetchStudentDetail(studentId);
      if (cancelled) return;
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setDetail(result.data as Record<string, unknown>);
    });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const student = detail?.student as Record<string, unknown> | undefined;
  const enrollments = (detail?.enrollments ?? []) as Record<string, unknown>[];
  const testAttempts = (detail?.testAttempts ?? []) as Record<string, unknown>[];
  const orders = (detail?.orders ?? []) as Record<string, unknown>[];
  const auditLog = (detail?.auditLog ?? []) as Record<string, unknown>[];

  const handleStatusChange = (newStatus: "active" | "inactive" | "blocked") => {
    if (!studentId) return;
    startUpdateTransition(async () => {
      const result = await updateStudentStatus(studentId, newStatus);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Student ${newStatus === "blocked" ? "blocked" : "status updated"}`);
        const refreshed = await fetchStudentDetail(studentId);
        if (refreshed.data) setDetail(refreshed.data as Record<string, unknown>);
        onStatusChange();
      }
    });
  };

  // The impact is fetched before the dialog opens, so the confirmation can
  // state exactly what the cascade will take rather than a vague warning.
  const openDeleteDialog = () => {
    if (!studentId) return;
    startDeleteTransition(async () => {
      const result = await fetchStudentDeletionImpact(studentId);
      if (result.error || !result.data) {
        toast.error(result.error ?? "Could not check what deleting this would affect.");
        return;
      }
      setImpact(result.data as DeletionImpact);
    });
  };

  const handleDelete = () => {
    if (!studentId) return;
    startDeleteTransition(async () => {
      const result = await deleteStudent(studentId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setImpact(null);
      toast.success("Student deleted.");
      onStatusChange();
      onClose();
    });
  };

  // Display forms for the three coded fields, resolved once rather than
  // inline in the markup three times over.
  const classLabel = student?.class ? `Class ${student.class as string}` : null;
  const boardLabel =
    student?.board === "State" ? "State Board" : ((student?.board as string) ?? null);
  const genderLabel =
    GENDER_OPTIONS.find((option) => option.value === student?.gender)?.label ?? null;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

  return (
    <Sheet open={!!studentId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {isFetching && !detail ? (
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : student ? (
          <>
            <SheetHeader className="border-b border-border pb-4">
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-brand-blue text-white text-sm font-semibold shrink-0">
                  {getInitials(student.full_name as string | null)}
                </div>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-lg">{student.full_name as string}</SheetTitle>
                  <SheetDescription className="flex items-center gap-2 mt-1">
                    <Badge className={statusColors[(student.status as string)] ?? ""} variant="secondary">
                      {(student.status as string).charAt(0).toUpperCase() + (student.status as string).slice(1)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Joined {formatDate(student.created_at as string)}
                    </span>
                  </SheetDescription>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                {student.status !== "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusChange("active")}
                    disabled={isUpdating}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                    Activate
                  </Button>
                )}
                {student.status !== "blocked" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleStatusChange("blocked")}
                    disabled={isUpdating}
                  >
                    <ShieldBan className="h-3.5 w-3.5 mr-1.5" />
                    Block
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700"
                  onClick={openDeleteDialog}
                  disabled={isUpdating || isDeleting}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete
                </Button>
                {(isUpdating || isDeleting) && (
                  <Loader2 className="h-4 w-4 animate-spin self-center" />
                )}
              </div>
            </SheetHeader>

            <Tabs defaultValue="profile" className="mt-4">
              <TabsList className="w-full grid grid-cols-5">
                <TabsTrigger value="profile" className="text-xs">
                  <User className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Profile</span>
                </TabsTrigger>
                <TabsTrigger value="courses" className="text-xs">
                  <BookOpen className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Courses</span>
                </TabsTrigger>
                <TabsTrigger value="tests" className="text-xs">
                  <FileText className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Tests</span>
                </TabsTrigger>
                <TabsTrigger value="payments" className="text-xs">
                  <CreditCard className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Payments</span>
                </TabsTrigger>
                <TabsTrigger value="activity" className="text-xs">
                  <Activity className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Activity</span>
                </TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="profile" className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-mono">
                    {(student.student_code as string) ?? "No code"}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={
                      student.registration_source === "self_online"
                        ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }
                  >
                    {registrationSourceLabel(student.registration_source as string)}
                  </Badge>
                  {student.profile_completed === true ? (
                    <Badge
                      variant="secondary"
                      className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    >
                      Profile complete
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="bg-red-500/10 text-red-600 dark:text-red-400"
                    >
                      Profile incomplete
                    </Badge>
                  )}
                </div>

                <InfoRow icon={Calendar} label="Class" value={classLabel} />
                <InfoRow icon={BookOpen} label="Board" value={boardLabel} />
                <InfoRow icon={BookOpen} label="School" value={student.school_name as string} />
                <InfoRow
                  icon={Cake}
                  label="Date of birth"
                  value={
                    student.date_of_birth
                      ? formatDate(student.date_of_birth as string)
                      : null
                  }
                />
                <InfoRow icon={User} label="Gender" value={genderLabel} />

                <InfoRow icon={Phone} label="Student phone" value={student.phone as string} />
                <InfoRow
                  icon={Mail}
                  label="Contact email"
                  value={
                    isSyntheticEmail(student.email as string)
                      ? "No real email on file yet"
                      : (student.email as string)
                  }
                />
                <InfoRow
                  icon={Users}
                  label="Parent or guardian"
                  value={student.parent_name as string}
                />
                <InfoRow
                  icon={Phone}
                  label="Parent phone"
                  value={student.parent_phone as string}
                />

                <InfoRow icon={MapPin} label="City" value={student.city as string} />
                <InfoRow icon={MapPin} label="State" value={student.state as string} />
                <InfoRow icon={MapPin} label="PIN code" value={student.pincode as string} />
                <InfoRow icon={MapPin} label="Address" value={student.address_line as string} />

                <InfoRow
                  icon={User}
                  label="Referral code"
                  value={student.referral_code as string}
                />
                <InfoRow
                  icon={Calendar}
                  label="Profile completed"
                  value={
                    student.profile_completed_at
                      ? formatDate(student.profile_completed_at as string)
                      : null
                  }
                />

                {typeof student.admin_notes === "string" && student.admin_notes.length > 0 && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Admin notes</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">
                      {student.admin_notes}
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Courses Tab */}
              <TabsContent value="courses" className="mt-4">
                {enrollments.length === 0 ? (
                  <EmptyTab message="No enrolled courses" />
                ) : (
                  <div className="space-y-3">
                    {enrollments.map((e) => {
                      const course = e.course as { title: string } | null;
                      return (
                        <div
                          key={e.id as string}
                          className="rounded-lg border border-border p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm">
                              {course?.title ?? "Unknown Course"}
                            </p>
                            <Badge
                              variant="secondary"
                              className={
                                e.status === "active"
                                  ? statusColors.active
                                  : e.status === "expired"
                                  ? statusColors.inactive
                                  : statusColors.blocked
                              }
                            >
                              {(e.status as string).charAt(0).toUpperCase() + (e.status as string).slice(1)}
                            </Badge>
                          </div>
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>Purchased: {formatDate(e.purchased_at as string)}</span>
                            <span>Valid until: {formatDate(e.valid_until as string)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Tests Tab */}
              <TabsContent value="tests" className="mt-4">
                {testAttempts.length === 0 ? (
                  <EmptyTab message="No test attempts" />
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Test</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {testAttempts.map((t) => {
                          const test = t.test as { name: string } | null;
                          return (
                            <TableRow key={t.id as string}>
                              <TableCell className="font-medium text-xs">
                                {test?.name ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {t.score as number}/{t.max_score as number}
                              </TableCell>
                              <TableCell className="text-xs">
                                {Math.floor((t.time_taken_seconds as number) / 60)}m
                              </TableCell>
                              <TableCell className="text-xs">
                                {formatDate(t.submitted_at as string)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Payments Tab */}
              <TabsContent value="payments" className="mt-4">
                {orders.length === 0 ? (
                  <EmptyTab message="No payment history" />
                ) : (
                  <div className="space-y-3">
                    {orders.map((o) => {
                      const course = o.course as { title: string } | null;
                      return (
                        <div
                          key={o.id as string}
                          className="rounded-lg border border-border p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm">{course?.title ?? "—"}</p>
                            <Badge
                              variant="secondary"
                              className={
                                o.status === "completed"
                                  ? statusColors.active
                                  : o.status === "failed"
                                  ? statusColors.blocked
                                  : statusColors.inactive
                              }
                            >
                              {(o.status as string).charAt(0).toUpperCase() + (o.status as string).slice(1)}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{formatCurrency(o.final_amount as number)}</span>
                            <span>{o.payment_method as string}</span>
                            <span>{formatDate(o.created_at as string)}</span>
                          </div>
                          {typeof o.invoice_url === "string" && (
                            <a
                              href={o.invoice_url as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-brand-orange hover:underline"
                            >
                              View Invoice
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity" className="mt-4">
                {auditLog.length === 0 ? (
                  <EmptyTab message="No recent activity" />
                ) : (
                  <div className="space-y-2">
                    {auditLog.map((entry) => (
                      <div
                        key={entry.id as string}
                        className="flex items-start gap-3 rounded-lg border border-border p-3"
                      >
                        <div className="mt-0.5 flex items-center justify-center w-6 h-6 rounded-full bg-muted">
                          <Activity className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {(entry.action as string).replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.entity_type as string}
                            {entry.entity_id ? ` #${(entry.entity_id as string).slice(0, 8)}` : ""}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDate(entry.created_at as string)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </SheetContent>

      <AlertDialog open={impact !== null} onOpenChange={(open) => !open && setImpact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {impact?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the student and everything linked to
              them. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {impact && (
            <div className="space-y-3">
              <ul className="rounded-lg border border-border divide-y text-sm">
                <li className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">Enrollments</span>
                  <span className="font-medium">{impact.enrollmentCount}</span>
                </li>
                <li className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">Test attempts</span>
                  <span className="font-medium">{impact.testAttemptCount}</span>
                </li>
                <li className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">Orders</span>
                  <span className="font-medium">{impact.orderCount}</span>
                </li>
              </ul>

              {impact.paidOrderCount > 0 && (
                <div className="flex gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    {impact.paidOrderCount} paid{" "}
                    {impact.paidOrderCount === 1 ? "order" : "orders"} worth{" "}
                    {formatCurrency(impact.paidRevenue)} will be destroyed, and
                    that revenue will disappear from your reports. Block the
                    student instead if you only want to revoke their access.
                  </p>
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
      {message}
    </div>
  );
}
