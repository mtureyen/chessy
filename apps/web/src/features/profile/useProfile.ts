import type { SourceId } from '@pawnia/library'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServices } from '@/app/servicesContext'
import { rememberProfile } from './welcome'

/** The user's profile; `data` is null before they set one up. */
export function useProfile() {
  const { profile } = useServices()
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const loaded = await profile.load()
      if (loaded) rememberProfile()
      return loaded
    },
    staleTime: Infinity,
  })
}

export function useSaveProfile() {
  const { profile } = useServices()
  const client = useQueryClient()
  return useMutation({
    mutationFn: profile.save,
    onSuccess: (saved) => {
      rememberProfile()
      client.setQueryData(['profile'], saved)
    },
  })
}

/** A platform account's public profile (avatar, ratings); cached for the session. */
export function usePlayer(source: SourceId, username: string | undefined) {
  const { profile } = useServices()
  return useQuery({
    queryKey: ['player', source, username?.toLowerCase()],
    queryFn: () => profile.lookup(source, username!),
    enabled: !!username,
    retry: false,
    staleTime: 60 * 60_000,
  })
}
