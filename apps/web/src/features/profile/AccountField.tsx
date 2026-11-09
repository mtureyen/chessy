import { isValidUsername, sourceName, type SourceId } from '@pawnia/library'
import { useEffect, useRef, useState } from 'react'
import { PlayerCard } from './PlayerCard'
import { usePlayer } from './useProfile'

interface AccountFieldProps {
  source: SourceId
  initial?: string
  /** The confirmed username as the platform spells it, or undefined while unconfirmed. */
  onChange: (username: string | undefined) => void
}

/** A username for one platform, looked up so the user can confirm "is this you?". */
export function AccountField({ source, initial = '', onChange }: AccountFieldProps) {
  const [input, setInput] = useState(initial)
  const [checked, setChecked] = useState<string | undefined>(initial || undefined)
  const player = usePlayer(source, checked)
  const name = sourceName(source)
  // Confirmed: the lookup found the account for what's in the field right now.
  const found = player.data && checked === input.trim() ? player.data : undefined

  const report = useRef(onChange)
  useEffect(() => {
    report.current = onChange
  })
  useEffect(() => {
    report.current(found?.username)
  }, [found?.username])

  const check = () => {
    const username = input.trim()
    if (!isValidUsername(username)) return
    setChecked(username)
  }

  return (
    <div className="account-field">
      <label htmlFor={`account-${source}`}>{name}</label>
      <div className="account-field-row">
        <input
          id={`account-${source}`}
          placeholder={`${name} username`}
          value={input}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setInput(e.target.value)}
          onBlur={check}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            check()
          }}
        />
        <button type="button" onClick={check} disabled={!isValidUsername(input.trim())}>
          Check
        </button>
      </div>
      {player.isFetching && <p className="message message-info">Looking up {checked}…</p>}
      {player.isError && checked === input.trim() && (
        <p className="message message-error" role="alert">
          {player.error.message}
        </p>
      )}
      {found && <PlayerCard player={found} />}
    </div>
  )
}
