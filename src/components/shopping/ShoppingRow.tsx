import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ShoppingItem } from '../../types'
import { IconGrip } from './ShoppingIcons'

type Props = {
  item: ShoppingItem
  showDivider: boolean
  onToggle: () => void
  onOpenEdit: () => void
  /** When false, the grip handle is hidden and `useSortable` is disabled. */
  draggable: boolean
}

/**
 * One “To buy” row. Wraps `useSortable` so drag-to-reorder works inside the
 * surrounding `SortableContext` — the listeners are attached only to the grip
 * handle on the right, which means tapping the checkbox or row body still
 * tick-offs / opens edit cleanly without engaging a drag.
 */
export function ShoppingRow({
  item,
  showDivider,
  onToggle,
  onOpenEdit,
  draggable,
}: Props) {
  const sortable = useSortable({ id: item.id, disabled: !draggable })
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    boxShadow: isDragging
      ? '0 16px 32px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.35)'
      : undefined,
    backgroundColor: isDragging ? '#2c2c2e' : undefined,
    borderRadius: isDragging ? 10 : undefined,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center ${
        showDivider && !isDragging ? 'border-t border-white/[0.08]' : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center pl-3 active:bg-white/[0.06]"
        aria-label={`Mark ${item.name} as bought`}
      >
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[#636366] bg-transparent" />
      </button>
      <button
        type="button"
        onClick={onOpenEdit}
        className="flex min-h-[48px] min-w-0 flex-1 flex-col justify-center py-2 pr-2 text-left active:bg-white/[0.06]"
      >
        <span className="text-[17px] font-normal leading-snug text-white">
          {item.name}
        </span>
        {item.quantity ? (
          <span className="text-[15px] leading-snug text-[#8e8e93]">
            {item.quantity}
          </span>
        ) : null}
      </button>
      {draggable ? (
        <button
          type="button"
          aria-label={`Reorder ${item.name}`}
          // touch-none stops the browser from scrolling while @dnd-kit is dragging.
          className="flex min-h-[48px] min-w-[44px] shrink-0 cursor-grab items-center justify-center pr-2 text-[#636366] active:cursor-grabbing active:text-white touch-none"
          {...attributes}
          {...listeners}
        >
          <IconGrip className="h-5 w-5" />
        </button>
      ) : null}
    </li>
  )
}
