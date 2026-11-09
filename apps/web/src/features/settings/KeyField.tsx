import type { CoachSettingsBody } from '@pawnia/contracts'
import { useState } from 'react'

type KeyView = CoachSettingsBody['claudeApi']['apiKey']

/** A change to a key: a new one, null to remove the saved one, undefined to keep it. */
export type KeyChange = string | null | undefined

/**
 * An API key. While typing, the eye shows or hides it; once saved, the server never sends it
 * back, so only its hint is shown ("sk-ant-…a1b2"), with Replace and Remove.
 */
export function KeyField({
  id,
  label,
  view,
  value,
  onChange,
}: {
  id: string
  label: string
  view: KeyView
  value: KeyChange
  onChange: (value: KeyChange) => void
}) {
  const [visible, setVisible] = useState(false)
  const editing = !view.set || typeof value === 'string'

  if (value === null) {
    return (
      <div className="settings-field">
        <span className="settings-label">{label}</span>
        <div className="key-saved">
          <span className="key-removed">Removed when you save</span>
          <button type="button" onClick={() => onChange(undefined)}>
            Undo
          </button>
        </div>
      </div>
    )
  }

  if (!editing) {
    return (
      <div className="settings-field">
        <span className="settings-label">{label}</span>
        <div className="key-saved">
          <code>{view.hint}</code>
          <span className="settings-note">
            {view.source === 'env' ? 'from apps/api/.env' : 'saved here'}
          </span>
          <button type="button" onClick={() => onChange('')}>
            Replace
          </button>
          {view.source === 'settings' && (
            <button type="button" onClick={() => onChange(null)}>
              Remove
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="settings-field">
      <label className="settings-label" htmlFor={id}>
        {label}
      </label>
      <div className="key-input">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value ?? ''}
          placeholder="Paste the key"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="key-eye"
          aria-label={visible ? 'Hide key' : 'Show key'}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <EyeIcon crossed={visible} />
        </button>
        {view.set && (
          <button type="button" onClick={() => onChange(undefined)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
  )
}
