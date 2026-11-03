"use client";

import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, GripVertical, Video, MessageSquare, Trophy } from "lucide-react";
import type { Testimonial } from "@/types/database";

interface TestimonialCardProps {
  testimonial: Testimonial;
  onToggleVisibility: (id: string, visible: boolean) => void;
  onEdit: (t: Testimonial) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: Record<string, unknown>;
}

export function TestimonialCard({
  testimonial,
  onToggleVisibility,
  onEdit,
  onDelete,
  dragHandleProps,
}: TestimonialCardProps) {
  return (
    <Card className="p-4 group relative">
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        <div
          className="mt-1 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            {testimonial.student_photo_url ? (
              <div className="relative w-8 h-8 shrink-0 overflow-hidden rounded-full border border-border">
                <Image
                  src={testimonial.student_photo_url}
                  alt={testimonial.student_name}
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-blue text-white text-xs font-medium shrink-0">
                {testimonial.student_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">{testimonial.student_name}</p>
                {testimonial.is_topper && (
                  <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]" variant="secondary">
                    <Trophy className="h-3 w-3 mr-0.5" />
                    Topper
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{testimonial.year}</span>
                {testimonial.course_name && (
                  <>
                    <span>·</span>
                    <span>{testimonial.course_name}</span>
                  </>
                )}
                {testimonial.marks_or_rank && (
                  <>
                    <span>·</span>
                    <span className="font-medium text-foreground">{testimonial.marks_or_rank}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex items-start gap-2 mb-3">
            {testimonial.type === "video" ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Video className="h-4 w-4 text-brand-orange" />
                <a
                  href={testimonial.video_url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-orange hover:underline text-xs"
                >
                  Video testimonial
                </a>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {testimonial.content || "No content"}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={testimonial.is_visible}
                onCheckedChange={(checked) => onToggleVisibility(testimonial.id, checked)}
              />
              <span className="text-xs text-muted-foreground">
                {testimonial.is_visible ? "Visible" : "Hidden"}
              </span>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => onEdit(testimonial)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-500"
                onClick={() => onDelete(testimonial.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
