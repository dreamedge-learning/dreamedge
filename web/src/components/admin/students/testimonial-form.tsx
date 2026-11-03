"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ImagePlus, Loader2, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  createTestimonial,
  updateTestimonial,
  uploadTestimonialPhoto,
  removeTestimonialPhoto,
} from "@/app/admin/(panel)/students/actions";
import type { Testimonial } from "@/types/database";

interface TestimonialFormDialogProps {
  open: boolean;
  onClose: () => void;
  editData?: Testimonial | null;
}

/** Mirrors the server action, so a bad file is rejected before it is sent. */
const ACCEPTED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function TestimonialFormDialog({
  open,
  onClose,
  editData,
}: TestimonialFormDialogProps) {
  const [type, setType] = useState(editData?.type ?? "text");
  const [isTopper, setIsTopper] = useState(editData?.is_topper ?? false);
  const [isPending, startTransition] = useTransition();

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    editData?.student_photo_url ?? null
  );
  // Set when the admin clears an existing photo: the row is only updated once
  // they save, so a cleared photo must not leave storage before then.
  const [photoCleared, setPhotoCleared] = useState(false);

  if (!open) return null;

  function handlePhotoPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      toast.error("Only JPEG, PNG, WebP and AVIF images are allowed.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Photo must be under 2MB.");
      return;
    }

    setPhotoFile(file);
    setPhotoCleared(false);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoCleared(Boolean(editData?.student_photo_url));
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("type", type);
    formData.set("is_topper", isTopper.toString());

    startTransition(async () => {
      const result = editData
        ? await updateTestimonial(editData.id, formData)
        : await createTestimonial(formData);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      const testimonialId = "id" in result ? result.id : editData?.id;

      // The photo is a second round trip on purpose: a new testimonial has no
      // id until the row exists, and the storage path is keyed by that id.
      if (testimonialId && photoFile) {
        const photoData = new FormData();
        photoData.set("photo", photoFile);
        const photoResult = await uploadTestimonialPhoto(testimonialId, photoData);
        if (photoResult.error) {
          toast.error(`Saved, but the photo failed: ${photoResult.error}`);
          onClose();
          return;
        }
      } else if (testimonialId && photoCleared) {
        const removeResult = await removeTestimonialPhoto(testimonialId);
        if (removeResult.error) {
          toast.error(
            `Saved, but the photo could not be removed: ${removeResult.error}`
          );
          onClose();
          return;
        }
      }

      toast.success(editData ? "Testimonial updated" : "Testimonial added");
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative bg-popover rounded-lg border border-border shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {editData ? "Edit Testimonial" : "Add Testimonial"}
                </h2>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Photo</Label>
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                      {photoPreview ? (
                        <Image
                          src={photoPreview}
                          alt={editData?.student_name ?? "Student photo"}
                          fill
                          sizes="80px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <UserRound className="h-7 w-7" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <ImagePlus className="mr-1.5 h-4 w-4" />
                        {photoPreview ? "Replace photo" : "Upload photo"}
                      </Button>

                      {photoPreview ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600"
                          disabled={isPending}
                          onClick={clearPhoto}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Remove
                        </Button>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          JPEG, PNG, WebP or AVIF. Up to 2MB.
                        </p>
                      )}
                    </div>
                  </div>

                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={handlePhotoPick}
                    className="hidden"
                  />
                </div>

                <div>
                  <Label htmlFor="t-name">Student Name *</Label>
                  <Input
                    id="t-name"
                    name="student_name"
                    required
                    defaultValue={editData?.student_name ?? ""}
                  />
                </div>

                <div>
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => v && setType(v as "text" | "video")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {type === "text" ? (
                  <div>
                    <Label htmlFor="t-content">Content</Label>
                    <Textarea
                      id="t-content"
                      name="content"
                      rows={4}
                      defaultValue={editData?.content ?? ""}
                      placeholder="What the student said..."
                    />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="t-video">Video URL</Label>
                    <Input
                      id="t-video"
                      name="video_url"
                      defaultValue={editData?.video_url ?? ""}
                      placeholder="https://youtube.com/..."
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="t-year">Year</Label>
                    <Input
                      id="t-year"
                      name="year"
                      type="number"
                      defaultValue={editData?.year ?? new Date().getFullYear()}
                    />
                  </div>
                  <div>
                    <Label htmlFor="t-course">Course</Label>
                    <Input
                      id="t-course"
                      name="course_name"
                      defaultValue={editData?.course_name ?? ""}
                      placeholder="e.g. Class 9 Maths"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="t-marks">Marks / Rank</Label>
                  <Input
                    id="t-marks"
                    name="marks_or_rank"
                    defaultValue={editData?.marks_or_rank ?? ""}
                    placeholder="e.g. 98% or AIR 245"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={isTopper} onCheckedChange={setIsTopper} />
                  <Label>Mark as Topper</Label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-brand-orange hover:bg-brand-orange-dark text-white"
                disabled={isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                {editData ? "Update" : "Add"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
