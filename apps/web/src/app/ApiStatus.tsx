import { useQuery } from '@tanstack/react-query'
import { useServices } from './servicesContext'

export function ApiStatus() {
  const { api } = useServices()
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api.api.v1.health.$get()
      if (!res.ok) throw new Error(`API answered ${res.status}`)
      return res.json()
    },
    refetchInterval: 30_000,
    retry: false,
  })

  const state = health.isPending ? 'pending' : health.isSuccess ? 'online' : 'offline'
  const title = health.isSuccess ? `API ${health.data.version} online` : `API ${state}`
  return (
    <span className={`api-status api-status-${state}`} title={title} aria-label={title}>
      API
    </span>
  )
}
