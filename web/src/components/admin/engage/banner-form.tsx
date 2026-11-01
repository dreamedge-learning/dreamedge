"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createBanner, updateBanner } from "@/app/admin/(panel)/engage/actions";
import type { BannerRow } from "./banners-client";

type Position = "home_top" | "home_bottom" | "course_page" | "dashboard";

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`, not a full ISO string. */
function toLocalInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BannerFormDialog({
  open,
  onOpenChange,
  editData,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: BannerRow | null;
  onSaved: () => void;
}) {
  const [position, setPosition] = useState<Position>(
    (editData?.position as Position) ?? "home_top"
  );
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function close() {
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("position", position);

    startTransition(async () => {
      const result = editData
        ? await updateBanner(editData.id, formData)
        : await createBanner(formData);

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success(editData ? "Banner updated." : "Banner added.");
      onSaved();
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={close} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="banner-form-title"
          className="relative bg-popover rounded-lg border border-border shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        >
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-4">
              <h2 id="banner-form-title" className="text-lg font-semibold">
                {editData ? "Edit Banner" : "Add Banner"}
              </h2>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="b-title">Title *</Label>
                  <Input
                    id="b-title"
                    name="title"
                    required
                    maxLength={150}
                    defaultValue={editData?.title ?? ""}
                  />
                </div>

                <div>
                  <Label htmlFor="b-image">Image URL *</Label>
                  <Input
                    id="b-image"
                    name="image_url"
                    type="url"
                    required
                    placeholder="https://..."
                    defaultValue={editData?.image_url ?? ""}
                  />
                </div>

                <div>
                  <Label>Position</Label>
                  <Select
                    value={position}
                    onValueChange={(v) => v && setPosition(v as Position)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home_top">Home — top</SelectItem>
                      <SelectItem value="home_bottom">Home — bottom</SelectItem>
                      <SelectItem value="course_page">Course page</SelectItem>
                      <SelectItem value="dashboard">Student dashboard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="b-action">Link URL</Label>
                  <Input
                    id="b-action"
                    name="action_url"
                    type="url"
                    placeholder="https://dreamedgelearning.com/courses/..."
                    defaultValue={editData?.action_url ?? ""}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="b-start">Starts</Label>
                    <Input
                      id="b-start"
                      name="starts_at"
                      type="datetime-local"
                      defaultValue={toLocalInput(editData?.starts_at ?? null)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="b-end">Ends</Label>
                    <Input
                      id="b-end"
                      name="ends_at"
                      type="datetime-local"
                      defaultValue={toLocalInput(editData?.ends_at ?? null)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave the dates empty to show the banner for as long as it is active.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border p-4">
              <Button type="button" variant="ghost" onClick={close} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-brand-orange hover:bg-brand-orange-dark text-white"
              >
                {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {isPending ? "Saving..." : editData ? "Save" : "Add Banner"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
