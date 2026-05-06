import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

type Value = {
  deferred: BeforeInstallPromptEvent | null
  installMessage: string | null
  promptInstall: () => Promise<void>
  dismissDeferred: () => void
  clearInstallMessage: () => void
}

const InstallPromptContext = createContext<Value | null>(null)

export function InstallPromptProvider({ children }: { children: React.ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installMessage, setInstallMessage] = useState<string | null>(null)

  useEffect(() => {
    const onBip = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      setDeferred((prev) => prev ?? e)
    }
    const onInstalled = () => {
      setDeferred(null)
      setInstallMessage('App installed.')
    }
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return
    try {
      await deferred.prompt()
    } finally {
      setDeferred(null)
    }
  }, [deferred])

  const dismissDeferred = useCallback(() => setDeferred(null), [])

  const clearInstallMessage = useCallback(() => setInstallMessage(null), [])

  const value = useMemo(
    () => ({
      deferred,
      installMessage,
      promptInstall,
      dismissDeferred,
      clearInstallMessage,
    }),
    [
      deferred,
      installMessage,
      promptInstall,
      dismissDeferred,
      clearInstallMessage,
    ],
  )

  return (
    <InstallPromptContext.Provider value={value}>{children}</InstallPromptContext.Provider>
  )
}

export function useInstallPrompt() {
  const ctx = useContext(InstallPromptContext)
  if (!ctx) {
    throw new Error('useInstallPrompt must be used within InstallPromptProvider')
  }
  return ctx
}
