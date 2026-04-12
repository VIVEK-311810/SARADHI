import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import LatexRenderer from '../renderers/LatexRenderer';

/**
 * Ordering / Sequence input — student side.
 * Students drag items into the correct order.
 *
 * Props:
 *   items    — array of strings (the items to order)
 *   order    — array of indices [2, 0, 3, 1] representing current order
 *   onChange — callback(newOrder) where newOrder is an array of indices
 *   disabled — bool
 */
export default function OrderingInput({ items = [], order = [], onChange, disabled }) {
  // Initialize order to [0,1,2,...] if not provided
  const currentOrder = order.length === items.length
    ? order
    : items.map((_, i) => i);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = ({ active, over }) => {
    if (disabled || !over || active.id === over.id) return;
    const oldIdx = currentOrder.indexOf(Number(active.id));
    const newIdx = currentOrder.indexOf(Number(over.id));
    onChange(arrayMove(currentOrder, oldIdx, newIdx));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={currentOrder.map(String)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {currentOrder.map((itemIdx, position) => (
            <SortableItem
              key={String(itemIdx)}
              id={String(itemIdx)}
              position={position}
              label={items[itemIdx]}
              disabled={disabled}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({ id, position, label, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-3 rounded-lg border-2 text-sm
        bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700
        ${disabled ? 'opacity-60' : 'cursor-grab active:cursor-grabbing'}
        ${isDragging ? 'shadow-lg border-blue-400' : ''}`}
      {...attributes}
      {...listeners}
    >
      <span className="text-slate-400 select-none">⠿</span>
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40
        text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center">
        {position + 1}
      </span>
      <span className="flex-1">
        <LatexRenderer text={label} />
      </span>
    </div>
  );
}
