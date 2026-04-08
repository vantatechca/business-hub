"use client";
import React, { createContext, useContext, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
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

// Context lets useSortableItem know whether a DragOverlay clone is being
// rendered by a parent Sortable. If yes, the in-place item hides itself
// (visibility:hidden) so ONLY the floating clone is visible while dragging.
const SortableConfig = createContext<{ overlay: boolean }>({ overlay: false });

/**
 * Wrap a list/grid with this to make its children drag-sortable.
 * `items` is the ordered array of ids. `onReorder` receives the new ordered id list.
 *
 * If `renderOverlay` is provided, dragging renders a floating clone of the item
 * via dnd-kit's DragOverlay portal — the clone follows the cursor freely across
 * the whole page, and the in-flow item becomes invisible during the drag.
 */
export function Sortable<T extends { id: string | number }>({
  items,
  onReorder,
  strategy = "vertical",
  children,
  disabled = false,
  renderOverlay,
}: {
  items: T[];
  onReorder: (newOrderedIds: (string | number)[]) => void;
  strategy?: "vertical" | "grid";
  children: React.ReactNode;
  disabled?: boolean;
  renderOverlay?: (item: T) => React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => String(i.id) === String(active.id));
    const newIndex = items.findIndex(i => String(i.id) === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(items, oldIndex, newIndex);
    onReorder(next.map(i => i.id));
  };

  const handleDragCancel = () => setActiveId(null);

  if (disabled) return <>{children}</>;

  const activeItem = activeId ? items.find(i => String(i.id) === activeId) ?? null : null;
  const useOverlay = !!renderOverlay;

  return (
    <SortableConfig.Provider value={{ overlay: useOverlay }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={items.map(i => String(i.id))}
          strategy={strategy === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
        >
          {children}
        </SortableContext>
        {useOverlay && (
          <DragOverlay
            dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" }}
            style={{ cursor: "grabbing" }}
          >
            {activeItem && renderOverlay ? renderOverlay(activeItem) : null}
          </DragOverlay>
        )}
      </DndContext>
    </SortableConfig.Provider>
  );
}

/**
 * Use inside a Sortable container. Provides ref + style for the draggable element
 * and a drag handle component.
 *
 * Behavior depends on whether the parent Sortable has a DragOverlay configured:
 *   - With overlay: while dragging, the original item hides (visibility:hidden)
 *     so only the floating DragOverlay clone is visible.
 *   - Without overlay: the item lifts in place (scale + shadow + raised z-index).
 */
export function useSortableItem(id: string | number) {
  const { overlay } = useContext(SortableConfig);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(id),
  });

  const baseTransform = CSS.Transform.toString(transform);
  const liftedTransform = baseTransform
    ? `${baseTransform} scale(1.04)`
    : "scale(1.04)";

  const style: React.CSSProperties = overlay
    ? {
        // Overlay mode: hide in-place item so only the DragOverlay clone shows
        transform: baseTransform,
        transition,
        visibility: isDragging ? "hidden" : "visible",
        position: "relative",
      }
    : {
        // No overlay: lift in place with scale + shadow
        transform: isDragging ? liftedTransform : baseTransform,
        transition: isDragging ? "none" : transition,
        zIndex: isDragging ? 100 : undefined,
        boxShadow: isDragging
          ? "0 18px 40px rgba(0,0,0,0.45), 0 6px 14px rgba(0,0,0,0.30)"
          : undefined,
        cursor: isDragging ? "grabbing" : undefined,
        position: "relative",
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

/**
 * Shared style applied to items rendered inside a DragOverlay. Use this on the
 * outer wrapper of your overlay preview so the floating clone looks lifted.
 */
export const overlayCardStyle: React.CSSProperties = {
  cursor: "grabbing",
  transform: "scale(1.04) rotate(1.2deg)",
  boxShadow: "0 22px 55px rgba(0,0,0,0.60), 0 8px 20px rgba(0,0,0,0.40)",
  borderColor: "var(--accent)",
  pointerEvents: "none",
};
