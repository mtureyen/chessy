import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { PlayPage } from '@/features/play/PlayPage'
import { RootLayout } from './RootLayout'

const rootRoute = createRootRoute({ component: RootLayout })

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PlayPage,
})

const routeTree = rootRoute.addChildren([playRoute])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
