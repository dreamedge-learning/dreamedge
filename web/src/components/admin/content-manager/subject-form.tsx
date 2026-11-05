"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

import { updateSubject } from "@/app/admin/(panel)/content/manager/actions";
import { useContentTree } from "@/stores/content-tree";
import type { Subject } from "@/types/database";

const COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

export function SubjectForm({ subject }: { subject: Subject }) {
  const [isPending, startTransition] = useTransition();
  const updateSubjectInTree = useContentTree((s) => s.updateSubject);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get("name") as string).trim();
    const color_code = formData.get("color_code") as string;
    const is_visible = formData.get("is_visible") === "on";

    if (!name) return;

    startTransition(async () => {
      const result = await updateSubject(subject.id, {
        name,
        color_code,
        is_visible,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.data) {
        updateSubjectInTree(result.data);
      }
      toast.success("Subject updated");
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Edit Subject</h2>
        <p className="text-xs text-muted-foreground">
          The top level of the course. Folders and lessons go inside it.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sub-name">Name</Label>
        <Input
          id="sub-name"
          name="name"
          defaultValue={subject.name}
          placeholder="e.g. Mathematics"
        />
      </div>

      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((color) => (
            <label key={color} className="cursor-pointer">
              <input
                type="radio"
                name="color_code"
                value={color}
                defaultChecked={subject.color_code === color}
                className="sr-only peer"
              />
              <div
                className="h-8 w-8 rounded-full ring-2 ring-transparent peer-checked:ring-brand-orange peer-checked:ring-offset-2 ring-offset-background transition-all"
                style={{ backgroundColor: color }}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="sub-visible"
          name="is_visible"
          defaultChecked={subject.is_visible}
        />
        <Label htmlFor="sub-visible" className="cursor-pointer">
          Visible to students
        </Label>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="bg-brand-orange hover:bg-brand-orange-dark text-white"
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Changes
      </Button>
    </form>
  );
}
