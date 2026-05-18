import { useEffect, useState } from 'react'
import { displayQuantity, normalizeQuantity } from '../../lib/shoppingDisplay'
import type { ShoppingItem } from '../../types'

type Props = {
  /** The item being edited, or null to close the sheet. */
  item: ShoppingItem | null
  onClose: () => void
  onSave: (next: { name: string; quantity: string | null }) => void
  onDelete: () => void
}

const iosBlue = 'text-[#0a84ff]'

/**
 * iOS-style bottom sheet for renaming, re-quantifying, or deleting one shopping
 * item. The sheet owns its own draft state so callers don’t have to thread
 * controlled inputs through three components.
 */
export function ShoppingEditSheet({ item, onClose, onSave, onDelete }: Props) {
  const [draftName, setDraftName] = useState('')
  const [draftQty, setDraftQty] = useState('')

  // Re-seed the draft whenever a new item is opened. We deliberately don’t
  // reset on close (so the field briefly remembers its last value during the
  // dismiss animation, which feels less twitchy).
  useEffect(() => {
    if (!item) return
    setDraftName(item.name)
    setDraftQty(displayQuantity(item.quantity))
  }, [item])

  if (!item) return null

  const save = () => {
    const name = draftName.trim()
    if (!name) return
    onSave({ name, quantity: normalizeQuantity(draftQty) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
      <div
        className="ios-font w-full max-w-md overflow-y-auto rounded-t-[12px] bg-[#1c1618] shadow-2xl sm:rounded-[12px]"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-edit-title"
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-white/20 sm:hidden" />
        <div className="relative flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
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
            onClick={save}
            disabled={!draftName.trim()}
            className={`z-10 min-h-11 shrink-0 text-[17px] font-semibold ${iosBlue} disabled:opacity-40`}
          >
            Done
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="overflow-hidden rounded-[10px] bg-[#26201f] ring-1 ring-white/[0.06]">
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
            onClick={onDelete}
            className="w-full rounded-[10px] bg-[#26201f] py-3 text-center text-[17px] font-semibold text-[#ff453a] ring-1 ring-white/[0.06] active:bg-[#3a322f]"
          >
            Delete Item
          </button>
        </div>
      </div>
    </div>
  )
}
