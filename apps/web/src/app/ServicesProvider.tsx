import type { ReactNode } from 'react'
import type { Services } from './services'
import { ServicesContext } from './servicesContext'

export function ServicesProvider({
  services,
  children,
}: {
  services: Services
  children: ReactNode
}) {
  return <ServicesContext value={services}>{children}</ServicesContext>
}
