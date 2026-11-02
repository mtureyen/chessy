import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'
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
  // Pages other than the start page load on first visit (route-based code splitting).
  component: lazyRouteComponent(() => import('@/features/analysis/AnalysisRoute'), 'AnalysisRoute'),
})

const botRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/bot',
  component: lazyRouteComponent(() => import('@/features/play/BotPage'), 'BotPage'),
})

const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/games',
  component: lazyRouteComponent(() => import('@/features/library/LibraryPage'), 'LibraryPage'),
})

const routeTree = rootRoute.addChildren([playRoute, botRoute, analysisRoute, gamesRoute])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
