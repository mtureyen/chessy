import {
  isValidUsername,
  SOURCE_IDS,
  sourceName,
  type LibrarySettings,
  type SourceId,
} from '@chessy/library'
import { useState } from 'react'

interface ImportFormProps {
  settings: LibrarySettings
  pending: boolean
  onImport: (source: SourceId, username: string) => void
}

/** Pick a platform, enter a username (remembered per platform), import the recent games. */
export function ImportForm({ settings, pending, onImport }: ImportFormProps) {
  const [source, setSource] = useState<SourceId>(settings.lastSource ?? 'lichess')
  const [username, setUsername] = useState(settings.usernames[source] ?? '')
  const valid = isValidUsername(username.trim())

  const switchSource = (next: SourceId) => {
    setSource(next)
    setUsername(settings.usernames[next] ?? '')
  }

  return (
    <form
      className="import-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && !pending) onImport(source, username.trim())
      }}
    >
      <div className="source-toggle" role="radiogroup" aria-label="Platform">
        {SOURCE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={source === id}
            className={source === id ? 'active' : ''}
            onClick={() => switchSource(id)}
          >
            {sourceName(id)}
          </button>
        ))}
      </div>
      <input
        className="import-username"
        aria-label={`${sourceName(source)} username`}
        placeholder={`${sourceName(source)} username`}
        value={username}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setUsername(e.target.value)}
      />
      <button type="submit" className="import-submit" disabled={!valid || pending}>
        {pending ? 'Importing…' : 'Import recent games'}
      </button>
    </form>
  )
}
