"use client";

import Image from "next/image";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadQuestionImage } from "@/app/admin/(panel)/content/tests/actions";
import { McqSingle } from "./mcq-single";
import { McqMultiple } from "./mcq-multiple";
import { TrueFalse } from "./true-false";
import { ShortAnswer } from "./short-answer";
import { Subjective } from "./subjective";

type SubType = "mcq_single" | "mcq_multiple" | "true_false" | "short_answer" | "subjective";

interface ImageBasedProps {
  imageUrl: string | null;
  subType: SubType;
  answerData: Record<string, unknown>;
  onImageChange: (url: string | null) => void;
  onSubTypeChange: (subType: SubType) => void;
  onAnswerChange: (data: Record<string, unknown>) => void;
  readOnly?: boolean;
}

const subTypeLabels: Record<SubType, string> = {
  mcq_single: "MCQ (Single)",
  mcq_multiple: "MCQ (Multiple)",
  true_false: "True/False",
  short_answer: "Short Answer",
  subjective: "Subjective",
};

export function ImageBased({
  imageUrl,
  subType,
  answerData,
  onImageChange,
  onSubTypeChange,
  onAnswerChange,
  readOnly,
}: ImageBasedProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  /**
   * Uploads the image and stores the URL it was given.
   *
   * This used to be `URL.createObjectURL(file)`, which produced a `blob:`
   * URL that only resolves inside the tab that made it. It rendered perfectly
   * in the editor and was dead in every test that used it.
   */
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared so picking the same file again after a failure re-fires change.
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("image", file);

      const result = await uploadQuestionImage(formData);

      if (result.error || !result.data) {
        toast.error(result.error ?? "Could not upload that image.");
        return;
      }

      onImageChange(result.data.url);
    } finally {
      setUploading(false);
    }
  }

  function renderAnswerEditor() {
    switch (subType) {
      case "mcq_single":
        return (
          <McqSingle
            options={(answerData.options as string[]) || ["", ""]}
            correctIndex={(answerData.correctIndex as number) ?? 0}
            onChange={(opts, ci) =>
              onAnswerChange({ options: opts, correctIndex: ci })
            }
            readOnly={readOnly}
          />
        );
      case "mcq_multiple":
        return (
          <McqMultiple
            options={(answerData.options as string[]) || ["", ""]}
            correctIndices={(answerData.correctIndices as number[]) || []}
            onChange={(opts, ci) =>
              onAnswerChange({ options: opts, correctIndices: ci })
            }
            readOnly={readOnly}
          />
        );
      case "true_false":
        return (
          <TrueFalse
            correctAnswer={(answerData.correctAnswer as "true" | "false") ?? null}
            onChange={(a) => onAnswerChange({ correctAnswer: a })}
            readOnly={readOnly}
          />
        );
      case "short_answer":
        return (
          <ShortAnswer
            answers={(answerData.answers as string[]) || [""]}
            onChange={(a) => onAnswerChange({ answers: a })}
            readOnly={readOnly}
          />
        );
      case "subjective":
        return (
          <Subjective
            guidelines={(answerData.guidelines as string) || ""}
            onChange={(g) => onAnswerChange({ guidelines: g })}
            readOnly={readOnly}
          />
        );
    }
  }

  return (
    <div className="space-y-4">
      <div>
        {imageUrl ? (
          <div className="relative inline-block">
            <Image
              src={imageUrl}
              alt="Question"
              width={800}
              height={192}
              className="max-h-48 w-auto rounded-lg border border-border object-contain"
            />
            {!readOnly && (
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                className="absolute -top-2 -right-2"
                onClick={() => onImageChange(null)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ) : !readOnly ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-32 w-full items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <ImagePlus className="h-6 w-6" />
                <span className="text-xs">Upload Image</span>
              </div>
            )}
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {!readOnly && (
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(subTypeLabels) as SubType[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => onSubTypeChange(st)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                subType === st
                  ? "bg-brand-orange text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {subTypeLabels[st]}
            </button>
          ))}
        </div>
      )}

      {renderAnswerEditor()}
    </div>
  );
}
