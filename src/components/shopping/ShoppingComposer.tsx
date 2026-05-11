import { useMemo, useState } from 'react'
import { IconPlusCircle } from './ShoppingIcons'

type Props = {
  /** Recent item names, newest first. We slice/filter inside. */
  recents: string[]
  /** Called when the user submits a name. Quantity is set via the edit sheet. */
  onAdd: (name: string) => void
}

/**
 * Inline “Add item” composer. Replaces the old list/add page split — there’s
 * always one row at the top of the shopping screen where you can type and hit
 * Enter to add. Recent items appear as chips below the input *only while it’s
 * focused* so they don’t clutter the list at rest.
 */
export function ShoppingComposer({ recents, onAdd }: Props) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  // Filter chips by the current input. Empty input → top recents.
  const visibleChips = useMemo(() => {
    const q = value.trim().toLowerCase()
    const seen = new Set<string>()
    const out: string[] = []
    for (const name of recents) {
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      if (q && !key.includes(q)) continue
      // Don’t suggest exactly what they’ve already typed.
      if (q && key === q) continue
      seen.add(key)
      out.push(name)
      if (out.length >= 6) break
    }
    return out
  }, [recents, value])

  const submit = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setValue('')
  }

  return (
    <div className="overflow-hidden rounded-[10px] bg-[#26201f] ring-1 ring-white/[0.08]">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(value)
        }}
        className="flex items-center gap-2 px-4"
      >
        <IconPlusCircle className="h-5 w-5 text-[#8e8e93]" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          // Tiny delay before blurring so tapping a chip still fires its
          // onMouseDown / onClick handler before this field loses focus and
          // the chip row unmounts.
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder="Add item"
          className="min-h-[48px] flex-1 bg-transparent py-3 text-[17px] text-white outline-none placeholder:text-[#8e8e93]"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {value.trim() ? (
          <button
            type="submit"
            className="rounded-full bg-[#0a84ff] px-3 py-1.5 text-[13px] font-semibold text-white active:opacity-80"
          >
            Add
          </button>
        ) : null}
      </form>

      {focused && visibleChips.length > 0 ? (
        <div className="border-t border-white/[0.06] px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {visibleChips.map((name) => (
              <button
                key={name}
                type="button"
                // Use onMouseDown so the click fires before the input’s onBlur
                // unmounts this chip on mobile Safari.
                onMouseDown={(e) => {
                  e.preventDefault()
                  submit(name)
                }}
                className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[13px] text-white ring-1 ring-white/[0.08] active:bg-white/[0.12]"
              >
                + {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
