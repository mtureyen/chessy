import { Link, Outlet } from '@tanstack/react-router'
import { ApiStatus } from './ApiStatus'
import { BoardSettings } from './BoardSettings'
import { HistorySync } from '@/features/profile/HistorySync'
import { ProfileChip } from '@/features/profile/ProfileChip'
import { WelcomeBanner } from '@/features/profile/WelcomeBanner'
import './RootLayout.css'

export function RootLayout() {
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="logo">♟</span> Chessy
        </Link>
        <nav className="app-nav">
          <Link to="/" activeProps={{ className: 'active' }} activeOptions={{ exact: true }}>
            Play
          </Link>
          <Link to="/bot" activeProps={{ className: 'active' }}>
            vs Bot
          </Link>
          <Link to="/analysis" activeProps={{ className: 'active' }}>
            Analysis
          </Link>
          <Link to="/training" activeProps={{ className: 'active' }}>
            Train
          </Link>
          <Link to="/games" activeProps={{ className: 'active' }}>
            Games
          </Link>
        </nav>
        <ApiStatus />
        <BoardSettings />
        <ProfileChip />
      </header>
      <WelcomeBanner />
      <HistorySync />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
