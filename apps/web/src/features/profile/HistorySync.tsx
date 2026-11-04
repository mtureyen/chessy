import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useServices } from '@/app/servicesContext'
import { runImport } from './historyImport'
import { useProfile } from './useProfile'

/** Accounts already caught up in this page load (StrictMode runs effects twice). */
const started = new Set<string>()

/**
 * Keeps the library up to date with the user's accounts: on start (and right after linking an
 * account) each one imports its whole history once, then only what's new.
 */
export function HistorySync() {
  const profile = useProfile()
  const { library } = useServices()
  const queryClient = useQueryClient()

  useEffect(() => {
    for (const account of profile.data?.accounts ?? []) {
      const key = `${account.source}:${account.username.toLowerCase()}`
      if (started.has(key)) continue
      started.add(key)
      void runImport(library, account, {
        onGames: () => void queryClient.invalidateQueries({ queryKey: ['games'] }),
      })
    }
  }, [profile.data, library, queryClient])

  return null
}
