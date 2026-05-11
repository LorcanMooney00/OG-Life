import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLockingHorizontalSwipeRef } from '../hooks/useDominantHorizontalSwipe'
import type { ShoppingItem } from '../types'
import { createId } from '../lib/id'
import { haptic } from '../lib/haptics'

type Props = {
  items: ShoppingItem[]
  onChange: (next: ShoppingItem[]) => void
}

const iosBlue = 'text-[#0a84ff]'
const iosSecondary = 'text-[#8e8e93]'
const iosGreen = '#30d158'

function CheckmarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="10"
      viewBox="0 0 12 10"
      fill="none"
      aria-hidden
    >
      <path
        d="M1 5l3.5 3.5L11 1"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronDown({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={`${className ?? ''} transition-transform ${open ? 'rotate-180' : ''}`}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function IconList({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  )
}

function IconPlusCircle({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function IconGrip({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="9" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </svg>
  )
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

type SortableRowProps = {
  item: ShoppingItem
  showDivider: boolean
  onToggle: () => void
  onOpenEdit: () => void
  draggable: boolean
}

function SortableRow({
  item,
  showDivider,
  onToggle,
  onOpenEdit,
  draggable,
}: SortableRowProps) {
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
    // Lift the dragged row off the list so the shadow reads correctly.
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
          // touch-none keeps the browser from scrolling while @dnd-kit is dragging.
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

export function ShoppingListView({ items, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [quickName, setQuickName] = useState('')
  const [quickQuantity, setQuickQuantity] = useState('')
  const [page, setPage] = useState<'list' | 'add'>('list')
  const [showCompleted, setShowCompleted] = useState(false)
  const [editing, setEditing] = useState<ShoppingItem | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftQty, setDraftQty] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const inName = it.name.toLowerCase().includes(q)
      const inQty = it.quantity?.toLowerCase().includes(q)
      return inName || Boolean(inQty)
    })
  }, [items, query])

  const active = filtered.filter((i) => !i.purchased)
  const completed = filtered.filter((i) => i.purchased)
  const recentNames = useMemo(() => {
    const seen = new Set<string>()
    const ordered = [...items]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((item) => item.name.trim())
      .filter(Boolean)
    const out: string[] = []
    for (const name of ordered) {
      const key = name.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        out.push(name)
      }
      if (out.length >= 8) break
    }
    return out
  }, [items])

  const addItem = (name: string, quantity: string | null) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const maxSort = items.reduce((m, i) => Math.max(m, i.sortOrder), 0)
    const next: ShoppingItem = {
      id: createId(),
      name: trimmed,
      quantity: quantity?.trim() ? quantity.trim() : null,
      purchased: false,
      sortOrder: maxSort + 1,
      createdAt: new Date().toISOString(),
    }
    onChange([...items, next])
  }

  const onQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    addItem(quickName, quickQuantity)
    setQuickName('')
    setQuickQuantity('')
  }

  const toggle = (id: string, purchasedFlag: boolean) => {
    haptic('light')
    // Un-ticking sends an item back to the bottom of the active list so it
    // doesn’t resurrect at some random position halfway up.
    const maxSort = items.reduce((m, i) => Math.max(m, i.sortOrder), 0)
    onChange(
      items.map((i) => {
        if (i.id !== id) return i
        if (purchasedFlag) return { ...i, purchased: true }
        return { ...i, purchased: false, sortOrder: maxSort + 1 }
      }),
    )
  }

  const remove = (id: string) => {
    onChange(items.filter((i) => i.id !== id))
  }

  const clearPurchased = () => {
    const purchasedCount = items.reduce((n, i) => n + (i.purchased ? 1 : 0), 0)
    if (purchasedCount === 0) return
    haptic('medium')
    onChange(items.filter((i) => !i.purchased))
  }

  const openEdit = (item: ShoppingItem) => {
    setEditing(item)
    setDraftName(item.name)
    setDraftQty(item.quantity ?? '')
  }

  const closeEdit = () => {
    setEditing(null)
    setDraftName('')
    setDraftQty('')
  }

  const saveEdit = () => {
    if (!editing) return
    const name = draftName.trim()
    if (!name) return
    const qty = draftQty.trim() || null
    onChange(
      items.map((i) =>
        i.id === editing.id ? { ...i, name, quantity: qty } : i,
      ),
    )
    closeEdit()
  }

  const deleteEditing = () => {
    if (!editing) return
    remove(editing.id)
    closeEdit()
  }

  const addRecentItem = (name: string) => {
    addItem(name, null)
  }

  // PointerSensor covers desktop / mouse; TouchSensor covers mobile. The 200ms
  // delay on touch means tapping a row still opens edit, scrolling still works,
  // and a deliberate press-and-drag on the grip handle starts a reorder.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  )

  const dragEnabled = !query.trim()

  const handleDragEnd = (e: DragEndEvent) => {
    const { active: draggedId, over } = e
    if (!over || draggedId.id === over.id) return
    const oldIndex = active.findIndex((i) => i.id === draggedId.id)
    const newIndex = active.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    haptic('light')
    const reordered = arrayMove(active, oldIndex, newIndex).map((it, i) => ({
      ...it,
      sortOrder: i + 1,
    }))
    // Active list owns the order; completed rows keep their existing order
    // since they live in their own section.
    onChange([...reordered, ...completed])
  }

  const onListSwipeLeft = useCallback(() => {
    if (editing) return
    setPage((p) => (p === 'list' ? 'add' : p))
  }, [editing])

  const onListSwipeRight = useCallback(() => {
    if (editing) return
    setPage((p) => (p === 'add' ? 'list' : p))
  }, [editing])

  const swipeSurfaceRef = useLockingHorizontalSwipeRef({
    onSwipeLeft: onListSwipeLeft,
    onSwipeRight: onListSwipeRight,
    enabled: !editing,
  })

  return (
    <div ref={swipeSurfaceRef} className="ios-font space-y-4">
      <div className="space-y-2 pt-0.5">
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage('list')}
            aria-label="Shopping list"
            aria-pressed={page === 'list'}
            className={`inline-flex min-h-11 min-w-11 items-center gap-1 rounded-full px-3 text-[12px] transition active:bg-white/10 ${page === 'list' ? 'text-white/90' : 'text-white/35'}`}
          >
            <IconList className="h-4.5 w-4.5" />
            <span className="h-1.5 w-5 rounded-full bg-current" />
          </button>
          <button
            type="button"
            onClick={() => setPage('add')}
            aria-label="Add items"
            aria-pressed={page === 'add'}
            className={`inline-flex min-h-11 min-w-11 items-center gap-1 rounded-full px-3 text-[12px] transition active:bg-white/10 ${page === 'add' ? 'text-white/90' : 'text-white/35'}`}
          >
            <IconPlusCircle className="h-4.5 w-4.5" />
            <span className="h-1.5 w-5 rounded-full bg-current" />
          </button>
        </div>
        <p className="text-center text-[12px] text-[#8e8e93]">
          Tap above, or swipe left/right to switch list and add
        </p>
      </div>

        {page === 'add' ? (
          <>
          <form onSubmit={onQuickSubmit} className="space-y-3">
            <div className="overflow-hidden rounded-[10px] bg-[#2c2c2e] ring-1 ring-white/[0.08]">
              <div className="flex items-center gap-2 border-b border-white/[0.08] px-4">
                <IconPlusCircle className={`h-5 w-5 ${iosSecondary}`} />
                <input
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder="New item"
                  className="min-h-[48px] flex-1 bg-transparent py-3 text-[17px] text-white outline-none placeholder:text-[#8e8e93]"
                  enterKeyHint="next"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2 px-4">
                <span className={`text-[13px] font-semibold uppercase tracking-wide ${iosSecondary}`} aria-hidden>
                  Qty
                </span>
                <input
                  value={quickQuantity}
                  onChange={(e) => setQuickQuantity(e.target.value)}
                  placeholder="Quantity (optional)"
                  className="min-h-[48px] flex-1 bg-transparent py-3 text-[17px] text-white outline-none placeholder:text-[#8e8e93]"
                  enterKeyHint="done"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!quickName.trim()}
              className="w-full min-h-12 rounded-[10px] bg-[#0a84ff] text-[17px] font-semibold text-white disabled:opacity-35 active:opacity-80"
            >
              Add Item
            </button>
          </form>

          <section>
            <h2 className={`mb-2 px-1 text-[13px] font-semibold uppercase ${iosSecondary}`}>
              Quick add from recent
            </h2>
            {recentNames.length === 0 ? (
              <div className="rounded-[10px] bg-[#2c2c2e]/80 px-4 py-8 text-center ring-1 ring-white/[0.06]">
                <p className={`text-[15px] ${iosSecondary}`}>Your recent items will appear here</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {recentNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => addRecentItem(name)}
                    className="rounded-full bg-[#2c2c2e] px-4 py-2.5 text-[15px] text-white ring-1 ring-white/[0.08] active:bg-[#3a3a3c]"
                  >
                    + {name}
                  </button>
                ))}
              </div>
            )}
          </section>
          </>
        ) : (
          <>
          {/* Search */}
          <div className="overflow-hidden rounded-[10px] bg-[#2c2c2e] ring-1 ring-white/[0.08]">
            <div className="flex items-center gap-2 px-4">
              <IconSearch className={`h-5 w-5 ${iosSecondary}`} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="min-h-[44px] flex-1 bg-transparent py-3 text-[17px] text-white outline-none placeholder:text-[#8e8e93]"
                enterKeyHint="search"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className={`py-2 text-[15px] font-medium ${iosBlue}`}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {/* Open items */}
          <section>
            <h2 className={`mb-2 px-4 text-[13px] font-semibold uppercase ${iosSecondary}`}>
              To buy
            </h2>
            {active.length === 0 ? (
              <div className="rounded-[10px] bg-[#2c2c2e]/80 px-4 py-12 text-center ring-1 ring-white/[0.06]">
                <p className={`text-[15px] ${iosSecondary}`}>
                  {query.trim() ? 'No matches' : 'No items yet'}
                </p>
                {!query.trim() && (
                  <button
                    type="button"
                    onClick={() => setPage('add')}
                    className={`mt-2 text-[15px] font-semibold ${iosBlue}`}
                  >
                    Swipe left to Add
                  </button>
                )}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={active.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                  disabled={!dragEnabled}
                >
                  <ul className="overflow-hidden rounded-[10px] bg-[#2c2c2e] ring-1 ring-white/[0.08]">
                    {active.map((item, idx) => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        showDivider={idx > 0}
                        onToggle={() => toggle(item.id, true)}
                        onOpenEdit={() => openEdit(item)}
                        draggable={dragEnabled}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </section>

          {/* Completed — disclosure */}
          <section>
            <div className="mb-2 flex w-full items-center gap-2 px-4">
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                className="flex flex-1 items-center justify-between text-left active:opacity-80"
              >
                <span className={`text-[13px] font-semibold uppercase ${iosSecondary}`}>
                  Completed
                  {completed.length > 0 ? (
                    <span className="font-normal text-white/50"> · {completed.length}</span>
                  ) : null}
                </span>
                <ChevronDown open={showCompleted} className={iosSecondary} />
              </button>
              {completed.length > 0 && !query.trim() ? (
                <button
                  type="button"
                  onClick={clearPurchased}
                  className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1 text-[12px] font-semibold text-[#ff453a] ring-1 ring-white/[0.06] active:bg-white/[0.1]"
                  aria-label={`Clear ${completed.length} purchased item${completed.length === 1 ? '' : 's'}`}
                >
                  Clear
                </button>
              ) : null}
            </div>

            {showCompleted && (
              <>
                {completed.length === 0 ? (
                  <div className="rounded-[10px] bg-[#2c2c2e]/80 px-4 py-8 text-center ring-1 ring-white/[0.06]">
                    <p className={`text-[15px] ${iosSecondary}`}>
                      {query.trim() ? 'No matches' : 'Nothing completed yet'}
                    </p>
                  </div>
                ) : (
                  <ul className="overflow-hidden rounded-[10px] bg-[#2c2c2e] ring-1 ring-white/[0.08]">
                    {completed.map((item, idx) => (
                      <li
                        key={item.id}
                        className={`flex items-center ${idx > 0 ? 'border-t border-white/[0.08]' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(item.id, false)}
                          className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center pl-3 active:bg-white/[0.06]"
                          aria-label={`Mark ${item.name} as not bought`}
                        >
                          <span
                            className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2"
                            style={{
                              borderColor: iosGreen,
                              backgroundColor: iosGreen,
                            }}
                          >
                            <CheckmarkIcon className="translate-y-px" />
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="flex min-h-[48px] min-w-0 flex-1 flex-col justify-center py-2 pr-4 text-left active:bg-white/[0.06]"
                        >
                          <span className="text-[17px] font-normal leading-snug text-[#8e8e93] line-through">
                            {item.name}
                          </span>
                          {item.quantity ? (
                            <span className="text-[15px] leading-snug text-[#636366] line-through">
                              {item.quantity}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
          </>
        )}

      {/* Edit sheet */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
          <div
            className="ios-font w-full max-w-md overflow-y-auto rounded-t-[12px] bg-[#1c1c1e] shadow-2xl sm:rounded-[12px]"
            style={{
              paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-edit-title"
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-white/20 sm:hidden" />
            <div className="relative flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <button
                type="button"
                onClick={closeEdit}
                className={`z-10 min-h-11 shrink-0 text-[17px] font-normal ${iosBlue}`}
              >
                Cancel
              </button>
              <h3
                id="item-edit-title"
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[17px] font-semibold text-white"
              >
                Item
              </h3>
              <button
                type="button"
                onClick={saveEdit}
                disabled={!draftName.trim()}
                className={`z-10 min-h-11 shrink-0 text-[17px] font-semibold ${iosBlue} disabled:opacity-40`}
              >
                Done
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="overflow-hidden rounded-[10px] bg-[#2c2c2e] ring-1 ring-white/[0.06]">
                <label className="block border-b border-white/[0.08] px-4 py-2">
                  <span className="sr-only">Name</span>
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="min-h-11 w-full bg-transparent text-[17px] text-white outline-none placeholder:text-[#8e8e93]"
                    placeholder="Name"
                    autoFocus
                  />
                </label>
                <label className="block px-4 py-2">
                  <span className="sr-only">Quantity or notes</span>
                  <input
                    value={draftQty}
                    onChange={(e) => setDraftQty(e.target.value)}
                    className="min-h-11 w-full bg-transparent text-[17px] text-white outline-none placeholder:text-[#8e8e93]"
                    placeholder="Quantity (optional)"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={deleteEditing}
                className="w-full rounded-[10px] bg-[#2c2c2e] py-3 text-center text-[17px] font-semibold text-[#ff453a] ring-1 ring-white/[0.06] active:bg-[#3a3a3c]"
              >
                Delete Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
