import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AnalysisRoute } from '@/features/analysis/AnalysisRoute'
import { parseAnalysisSearch } from '@/features/analysis/search'
import { PlayPage } from '@/features/play/PlayPage'
import { RootLayout } from './RootLayout'

const rootRoute = createRootRoute({ component: RootLayout })

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PlayPage,
})

const analysisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analysis',
  validateSearch: parseAnalysisSearch,
  component: AnalysisRoute,
})

const routeTree = rootRoute.addChildren([playRoute, analysisRoute])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
