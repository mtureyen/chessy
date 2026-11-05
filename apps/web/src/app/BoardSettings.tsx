import { useEffect, useRef, useState } from 'react'
import {
  BOARD_THEMES,
  PIECE_SETS,
  pieceUrl,
  type BoardThemeId,
  type PieceSetId,
} from '@/shared/board/appearance'
import { setBoardAppearance, useBoardAppearance } from '@/shared/board/appearanceStore'
import { Link } from '@tanstack/react-router'
import './BoardSettings.css'

/** Header menu for the board's look; every change applies to all boards at once. */
export function BoardSettings() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <div className="board-settings" ref={root}>
      <button
        type="button"
        className="board-settings-toggle"
        aria-label="Board settings"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⚙
      </button>
      {open && (
        <div className="board-settings-panel" role="dialog" aria-label="Board settings">
          <BoardAppearanceForm />
          <Link to="/settings" className="board-settings-more" onClick={() => setOpen(false)}>
            All settings →
          </Link>
        </div>
      )}
    </div>
  )
}

/** Board theme, piece set and coordinates: in the header menu and on the settings page. */
export function BoardAppearanceForm() {
  const appearance = useBoardAppearance()
  return (
    <>
      <h3>Board</h3>
      <div className="board-settings-grid">
        {(
          Object.entries(BOARD_THEMES) as [BoardThemeId, (typeof BOARD_THEMES)[BoardThemeId]][]
        ).map(([id, theme]) => (
          <button
            key={id}
            type="button"
            className="board-settings-option"
            aria-pressed={appearance.theme === id}
            onClick={() => setBoardAppearance({ theme: id })}
          >
            <span
              className="board-settings-swatch"
              style={{
                background: `repeating-conic-gradient(${theme.dark} 0 25%, ${theme.light} 0 50%) 0 0 / 50% 50%`,
              }}
            />
            {theme.label}
          </button>
        ))}
      </div>

      <h3>Pieces</h3>
      <div className="board-settings-grid">
        {(Object.entries(PIECE_SETS) as [PieceSetId, (typeof PIECE_SETS)[PieceSetId]][]).map(
          ([id, set]) => (
            <button
              key={id}
              type="button"
              className="board-settings-option"
              aria-pressed={appearance.pieces === id}
              title={`${set.author} · ${set.license}`}
              onClick={() => setBoardAppearance({ pieces: id })}
            >
              <span className="board-settings-pieces">
                <img src={pieceUrl(id, 'white', 'knight', import.meta.env.BASE_URL)} alt="" />
                <img src={pieceUrl(id, 'black', 'queen', import.meta.env.BASE_URL)} alt="" />
              </span>
              {set.label}
            </button>
          ),
        )}
      </div>

      <label className="board-settings-check">
        <input
          type="checkbox"
          checked={appearance.coordinates}
          onChange={(e) => setBoardAppearance({ coordinates: e.target.checked })}
        />
        Coordinates
      </label>
    </>
  )
}
