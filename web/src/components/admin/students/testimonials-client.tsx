"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trophy, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { TestimonialCard } from "./testimonial-card";
import { ExportButton } from "@/components/admin/export-button";
import { TestimonialFormDialog } from "./testimonial-form";
import {
  fetchTestimonials,
  toggleTestimonialVisibility,
  deleteTestimonial,
  reorderTestimonials,
} from "@/app/admin/(panel)/students/actions";
import type { Testimonial } from "@/types/database";

function SortableCard({
  testimonial,
  onToggleVisibility,
  onEdit,
  onDelete,
}: {
  testimonial: Testimonial;
  onToggleVisibility: (id: string, visible: boolean) => void;
  onEdit: (t: Testimonial) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: testimonial.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TestimonialCard
        testimonial={testimonial}
        onToggleVisibility={onToggleVisibility}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={listeners}
      />
    </div>
  );
}

export function TestimonialsClient({ initialData }: { initialData: Testimonial[] }) {
  const [data, setData] = useState(initialData);
  const [showForm, setShowForm] = useState(false);
  const [editData, setEditData] = useState<Testimonial | null>(null);
  const [_isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadData = () => {
    startTransition(async () => {
      const result = await fetchTestimonials();
      if (!result.error) {
        setData(result.data as unknown as Testimonial[]);
      }
    });
  };

  const handleToggleVisibility = (id: string, visible: boolean) => {
    startTransition(async () => {
      const result = await toggleTestimonialVisibility(id, visible);
      if (result.error) toast.error(result.error);
      else loadData();
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteTestimonial(id);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Testimonial deleted");
        loadData();
      }
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = data.findIndex((t) => t.id === active.id);
    const newIndex = data.findIndex((t) => t.id === over.id);

    const reordered = arrayMove(data, oldIndex, newIndex);
    setData(reordered);

    startTransition(async () => {
      const result = await reorderTestimonials(reordered.map((t) => t.id));
      if (result.error) {
        toast.error(result.error);
        loadData();
      }
    });
  };

  const testimonials = data.filter((t) => !t.is_topper);
  const toppers = data.filter((t) => t.is_topper);

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <ExportButton dataset="testimonials" size="default" />
        <Button
          className="bg-brand-orange hover:bg-brand-orange-dark text-white"
          onClick={() => {
            setEditData(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Testimonial
        </Button>
      </div>

      <Tabs defaultValue="testimonials">
        <TabsList>
          <TabsTrigger value="testimonials">
            <MessageSquare className="h-4 w-4 mr-1.5" />
            Testimonials ({testimonials.length})
          </TabsTrigger>
          <TabsTrigger value="toppers">
            <Trophy className="h-4 w-4 mr-1.5" />
            Toppers ({toppers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="testimonials" className="mt-4">
          {testimonials.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No testimonials yet</p>
              <Button
                variant="link"
                className="text-brand-orange"
                onClick={() => {
                  setEditData(null);
                  setShowForm(true);
                }}
              >
                Add the first one
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={testimonials.map((t) => t.id)} strategy={rectSortingStrategy}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {testimonials.map((t) => (
                    <SortableCard
                      key={t.id}
                      testimonial={t}
                      onToggleVisibility={handleToggleVisibility}
                      onEdit={(item) => {
                        setEditData(item);
                        setShowForm(true);
                      }}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>

        <TabsContent value="toppers" className="mt-4">
          {toppers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Trophy className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No toppers added yet</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={toppers.map((t) => t.id)} strategy={rectSortingStrategy}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {toppers.map((t) => (
                    <SortableCard
                      key={t.id}
                      testimonial={t}
                      onToggleVisibility={handleToggleVisibility}
                      onEdit={(item) => {
                        setEditData(item);
                        setShowForm(true);
                      }}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>
      </Tabs>

      <TestimonialFormDialog
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditData(null);
          loadData();
        }}
        editData={editData}
      />
    </div>
  );
}
