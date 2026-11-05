import { useNavigate, useSearch } from '@tanstack/react-router'
import { BoardAppearanceForm } from '@/app/BoardSettings'
import { CoachSettings } from './CoachSettings'
import './Settings.css'

export type SettingsTab = 'board' | 'coach'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'board', label: 'Board' },
  { id: 'coach', label: 'Coach' },
]

/** /settings: the board's look and the coach's providers. */
export function SettingsPage() {
  const { tab = 'board' } = useSearch({ from: '/settings' })
  const navigate = useNavigate()
  return (
    <div className="settings-page">
      <h1>Settings</h1>
      <div className="settings-tabs" role="tablist" aria-label="Settings">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => void navigate({ to: '/settings', search: { tab: id } })}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'board' ? (
          <div className="settings-board">
            <BoardAppearanceForm />
          </div>
        ) : (
          <CoachSettings />
        )}
      </div>
    </div>
  )
}
