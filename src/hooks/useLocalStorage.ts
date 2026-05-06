import { useEffect, useState } from 'react'

export function useLocalStorage<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        return JSON.parse(raw) as T
      }
    } catch {
      /* ignore */
    }
    return initial
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [key, state])

  return [state, setState] as const
}
