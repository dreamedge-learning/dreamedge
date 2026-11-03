"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

import { BulkUploadPanel } from "@/components/admin/content-manager/bulk-upload-panel";
import { updateTopic } from "@/app/admin/(panel)/content/manager/actions";
import { useContentTree } from "@/stores/content-tree";
import type { Topic } from "@/types/database";

export function TopicForm({ topic }: { topic: Topic }) {
  const [isPending, startTransition] = useTransition();
  const updateTopicInTree = useContentTree((s) => s.updateTopic);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get("name") as string).trim();
    const is_visible = formData.get("is_visible") === "on";

    if (!name) return;

    startTransition(async () => {
      const result = await updateTopic(topic.id, { name, is_visible });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.data) {
        updateTopicInTree(result.data);
      }
      toast.success("Topic updated");
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Edit Topic</h2>
        <p className="text-xs text-muted-foreground">
          Topics are grouped under subjects and contain content items
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="topic-name">Name</Label>
        <Input
          id="topic-name"
          name="name"
          defaultValue={topic.name}
          placeholder="e.g. Number Systems"
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="topic-visible"
          name="is_visible"
          defaultChecked={topic.is_visible}
        />
        <Label htmlFor="topic-visible" className="cursor-pointer">
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

      {/* Bulk upload belongs to a topic: the files become lessons inside it,
          so there is nowhere else it could sensibly live. */}
      <BulkUploadPanel topicId={topic.id} />
    </div>
  );
}
