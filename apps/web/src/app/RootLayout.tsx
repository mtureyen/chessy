import { Link, Outlet } from '@tanstack/react-router'
import { ApiStatus } from './ApiStatus'
import { BoardSettings } from './BoardSettings'
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
          <Link to="/games" activeProps={{ className: 'active' }}>
            Games
          </Link>
        </nav>
        <ApiStatus />
        <BoardSettings />
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
