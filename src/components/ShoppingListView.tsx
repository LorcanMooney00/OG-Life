import { useMemo, useState } from 'react'
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { ShoppingItem } from '../types'
import { createId } from '../lib/id'
import { haptic } from '../lib/haptics'
import {
  CheckmarkIcon,
  ChevronDown,
  IconSearch,
} from './shopping/ShoppingIcons'
import { ShoppingRow } from './shopping/ShoppingRow'
import { ShoppingComposer } from './shopping/ShoppingComposer'
import { ShoppingEditSheet } from './shopping/ShoppingEditSheet'

type Props = {
  items: ShoppingItem[]
  onChange: (next: ShoppingItem[]) => void
}

const iosBlue = 'text-[#0a84ff]'
const iosSecondary = 'text-[#8e8e93]'
const iosGreen = '#30d158'

/**
 * One-page shopping screen. Top to bottom:
 *  - Inline "+ Add item" composer (with recent-item chips on focus).
 *  - Search (only meaningful once the list grows; always rendered for predictability).
 *  - Active items, drag-to-reorder via @dnd-kit + grip handle.
 *  - Completed items in a disclosure section with a one-tap "Clear" chip.
 *
 * The previous list-vs-add page split (plus its horizontal swipe gesture) was
 * removed: keeping everything on one page is faster to scan, eliminates a
 * gesture conflict with the global tab-switch swipe, and trims a chunk of
 * state from this component.
 */
export function ShoppingListView({ items, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [editing, setEditing] = useState<ShoppingItem | null>(null)

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

  // Recents are derived from ALL items (not the search-filtered set) so the
  // composer’s chips stay useful even when the user is searching.
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
      if (out.length >= 12) break
    }
    return out
  }, [items])

  const addItem = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const maxSort = items.reduce((m, i) => Math.max(m, i.sortOrder), 0)
    const next: ShoppingItem = {
      id: createId(),
      name: trimmed,
      quantity: null,
      purchased: false,
      sortOrder: maxSort + 1,
      createdAt: new Date().toISOString(),
    }
    haptic('light')
    onChange([...items, next])
  }

  const toggle = (id: string, purchasedFlag: boolean) => {
    haptic('light')
    const maxSort = items.reduce((m, i) => Math.max(m, i.sortOrder), 0)
    onChange(
      items.map((i) => {
        if (i.id !== id) return i
        if (purchasedFlag) return { ...i, purchased: true }
        // Un-ticking sends an item back to the bottom of the active list so it
        // doesn’t resurrect at some random position halfway up.
        return { ...i, purchased: false, sortOrder: maxSort + 1 }
      }),
    )
  }

  const remove = (id: string) => onChange(items.filter((i) => i.id !== id))

  const saveEdit = (id: string, next: { name: string; quantity: string | null }) => {
    onChange(
      items.map((i) =>
        i.id === id ? { ...i, name: next.name, quantity: next.quantity } : i,
      ),
    )
    setEditing(null)
  }

  const clearPurchased = () => {
    const purchasedCount = items.reduce((n, i) => n + (i.purchased ? 1 : 0), 0)
    if (purchasedCount === 0) return
    haptic('medium')
    onChange(items.filter((i) => !i.purchased))
  }

  // @dnd-kit sensors: pointer for desktop, touch with a 200ms activation delay
  // so list scrolling and row taps still work — only a deliberate press-and-
  // hold on the grip handle starts a reorder.
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
    onChange([...reordered, ...completed])
  }

  // Search bar only earns its keep once the list is non-trivial — keeps the
  // top of the screen calm for small lists, which is most of the time.
  const showSearch = items.length >= 6 || query.length > 0

  return (
    <div className="ios-font space-y-4">
      <ShoppingComposer recents={recentNames} onAdd={addItem} />

      {showSearch ? (
        <div className="overflow-hidden rounded-[10px] bg-[#2c2c2e] ring-1 ring-white/[0.08]">
          <div className="flex items-center gap-2 px-4">
            <IconSearch className={`h-5 w-5 ${iosSecondary}`} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="min-h-[44px] flex-1 bg-transparent py-3 text-[17px] text-white outline-none placeholder:text-[#8e8e93]"
              enterKeyHint="search"
              autoComplete="off"
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
      ) : null}

      <section>
        <h2 className={`mb-2 px-4 text-[13px] font-semibold uppercase ${iosSecondary}`}>
          To buy
          {active.length > 0 ? (
            <span className="font-normal text-white/50"> · {active.length}</span>
          ) : null}
        </h2>
        {active.length === 0 ? (
          <div className="rounded-[10px] bg-[#2c2c2e]/80 px-4 py-10 text-center ring-1 ring-white/[0.06]">
            <p className={`text-[15px] ${iosSecondary}`}>
              {query.trim()
                ? 'No matches'
                : 'Nothing to grab. Add an item above when you think of one.'}
            </p>
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
                  <ShoppingRow
                    key={item.id}
                    item={item}
                    showDivider={idx > 0}
                    onToggle={() => toggle(item.id, true)}
                    onOpenEdit={() => setEditing(item)}
                    draggable={dragEnabled}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>

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
                      onClick={() => setEditing(item)}
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

      <ShoppingEditSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(next) => editing && saveEdit(editing.id, next)}
        onDelete={() => {
          if (!editing) return
          remove(editing.id)
          setEditing(null)
        }}
      />
    </div>
  )
}
