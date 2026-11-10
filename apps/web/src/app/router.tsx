import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'
import { parseAnalysisSearch } from '@/features/analysis/search'
import { parseStatsSearch } from '@/features/stats/search'
import { parseOpeningsSearch } from '@/features/training/openings/search'
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

const openRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/open',
  validateSearch: (search: Record<string, unknown>): { url?: string } =>
    typeof search.url === 'string' && search.url ? { url: search.url } : {},
  component: lazyRouteComponent(() => import('@/features/library/OpenGamePage'), 'OpenGamePage'),
})

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/welcome',
  component: lazyRouteComponent(() => import('@/features/profile/WelcomePage'), 'WelcomePage'),
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: lazyRouteComponent(() => import('@/features/profile/ProfilePage'), 'ProfilePage'),
})

const trainingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/training',
  component: lazyRouteComponent(() => import('@/features/training/TrainingPage'), 'TrainingPage'),
})

const openingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/training/openings',
  validateSearch: parseOpeningsSearch,
  component: lazyRouteComponent(
    () => import('@/features/training/openings/OpeningsPage'),
    'OpeningsPage',
  ),
})

const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stats',
  validateSearch: parseStatsSearch,
  component: lazyRouteComponent(() => import('@/features/stats/StatsPage'), 'StatsPage'),
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  validateSearch: (search: Record<string, unknown>): { tab?: 'board' | 'coach' } =>
    search.tab === 'board' || search.tab === 'coach' ? { tab: search.tab } : {},
  component: lazyRouteComponent(() => import('@/features/settings/SettingsPage'), 'SettingsPage'),
})

const routeTree = rootRoute.addChildren([
  playRoute,
  botRoute,
  analysisRoute,
  gamesRoute,
  openRoute,
  welcomeRoute,
  profileRoute,
  trainingRoute,
  openingsRoute,
  statsRoute,
  settingsRoute,
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
