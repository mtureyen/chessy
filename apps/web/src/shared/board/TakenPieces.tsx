import { TAKEN_ROLES, type Color, type Material, type TakenRole } from '@pawnia/chess'
import './TakenPieces.css'

/**
 * The small row of pieces next to a player: what `color` has taken, grouped by type, and how far
 * ahead it is. The pieces come from the chosen set (the board's CSS variables).
 */
export function TakenPieces({ material, color }: { material: Material; color: Color }) {
  const { pieces, lead } = material[color]
  const groups = TAKEN_ROLES.filter((role) => pieces[role] > 0)
  if (groups.length === 0 && lead === 0) return null
  // Taken pieces are the other side's; pieces a side has more of are its own.
  const shown = material.kind === 'extra' ? color : color === 'white' ? 'black' : 'white'
  const inWords = describe(material, color)
  return (
    <span
      className="taken"
      role="img"
      aria-label={inWords}
      title={inWords}
      data-testid={`taken-${color}`}
    >
      {groups.map((role) => (
        <span key={role} className="taken-group" data-role={role}>
          {Array.from({ length: pieces[role] }, (_, i) => (
            <span
              key={i}
              className={`taken-piece taken-piece-${shown}`}
              style={{ backgroundImage: `var(--piece-${shown}-${role})` }}
            />
          ))}
        </span>
      ))}
      {lead > 0 && <span className="taken-lead">+{lead}</span>}
    </span>
  )
}

/** "White has taken 2 pawns, 1 knight, ahead by 3": the row in words. */
function describe(material: Material, color: Color): string {
  const { pieces, lead } = material[color]
  const side = color === 'white' ? 'White' : 'Black'
  const list = TAKEN_ROLES.filter((role) => pieces[role] > 0)
    .map((role) => counted(pieces[role], role))
    .join(', ')
  if (!list) return `${side} is ahead by ${lead}`
  const has = material.kind === 'extra' ? `${side} has ${list} more` : `${side} has taken ${list}`
  return lead > 0 ? `${has}, ahead by ${lead}` : has
}

function counted(count: number, role: TakenRole): string {
  return count === 1 ? `1 ${role}` : `${count} ${role}s`
}
