import { useCallback, useEffect } from 'react'
import { PROMOTION_ROLES, type Color, type PromotionRole, type SquareName } from '../core/types'

interface PromotionDialogProps {
  color: Color
  square: SquareName
  orientation: Color
  onPick: (role: PromotionRole) => void
  onCancel: () => void
}

/** Lichess-style picker: the four pieces stacked in the promotion file, from the edge inward. */
export function PromotionDialog({
  color,
  square,
  orientation,
  onPick,
  onCancel,
}: PromotionDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const file = square.charCodeAt(0) - 'a'.charCodeAt(0)
  const column = orientation === 'white' ? file : 7 - file
  const edge = color === orientation ? 'top' : 'bottom'

  return (
    // `cg-wrap` scopes chessground's piece sprites to this overlay.
    <div className="cg-wrap promotion-dialog" onClick={onCancel}>
      {PROMOTION_ROLES.map((role, i) => (
        <button
          key={role}
          type="button"
          className="promotion-option"
          style={{ left: `${column * 12.5}%`, [edge]: `${i * 12.5}%` }}
          aria-label={`Promote to ${role}`}
          onClick={(e) => {
            e.stopPropagation()
            onPick(role)
          }}
        >
          <PieceIcon role={role} color={color} />
        </button>
      ))}
    </div>
  )
}

/** chessground styles pieces as `<piece class="queen white">`, a tag React doesn't know, so create it directly. */
function PieceIcon({ role, color }: { role: PromotionRole; color: Color }) {
  const ref = useCallback(
    (el: HTMLSpanElement | null) => {
      if (!el) return
      const piece = document.createElement('piece')
      piece.className = `${role} ${color}`
      el.replaceChildren(piece)
    },
    [role, color],
  )
  return <span ref={ref} className="piece-icon" />
}
