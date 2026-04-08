"use client";
import React from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

/**
 * Wrap a list/grid with this to make its children drag-sortable.
 * `items` is the ordered array of ids. `onReorder` receives the new ordered id list.
 */
export function Sortable<T extends { id: string | number }>({
  items,
  onReorder,
  strategy = "vertical",
  children,
  disabled = false,
}: {
  items: T[];
  onReorder: (newOrderedIds: (string | number)[]) => void;
  strategy?: "vertical" | "grid";
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => String(i.id) === String(active.id));
    const newIndex = items.findIndex(i => String(i.id) === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(items, oldIndex, newIndex);
    onReorder(next.map(i => i.id));
  };

  if (disabled) return <>{children}</>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={items.map(i => String(i.id))}
        strategy={strategy === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * Use inside a Sortable container. Provides ref + style for the draggable element
 * and a drag handle component.
 */
export function useSortableItem(id: string | number) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(id),
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };
  return { setNodeRef, style, attributes, listeners, isDragging };
}

/** Standard drag-handle button — pass the listeners/attributes from useSortableItem. */
export function DragHandle({
  listeners,
  attributes,
  size = 14,
}: {
  listeners: ReturnType<typeof useSortableItem>["listeners"];
  attributes: ReturnType<typeof useSortableItem>["attributes"];
  size?: number;
}) {
  return (
    <button
      {...listeners}
      {...attributes}
      aria-label="Drag to reorder"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        color: "var(--text-muted)",
        cursor: "grab",
        padding: 2,
        touchAction: "none",
      }}
      onClick={e => e.stopPropagation()}
    >
      <GripVertical size={size} />
    </button>
  );
}
