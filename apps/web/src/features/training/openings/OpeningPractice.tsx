import type { OpeningBody } from '@pawnia/contracts'
import { useMemo } from 'react'
import { openingLabel } from './format'
import { nextMoves } from './practice'
import { PracticeBoard, type PracticeSetup } from './PracticeBoard'

/**
 * Practising one of the user's openings from the start: the opponent plays the replies the user
 * really met (the common ones most often), else theory's.
 */
export function OpeningPractice({ opening, onExit }: { opening: OpeningBody; onExit: () => void }) {
  const setup = useMemo((): PracticeSetup => {
    const table = nextMoves(opening.lines)
    const label = openingLabel(opening.family, opening.color)
    return {
      heading: label,
      intro: 'Your opponent plays the replies you met in your games, the common ones most often.',
      color: opening.color,
      replies: (sans) => Promise.resolve(table.get(sans.join(' ')) ?? []),
      theoryToo: true,
      missed: { title: `${label.charAt(0).toUpperCase()}${label.slice(1)}, missed in practice` },
      ending: 'Theory and your games stop here',
    }
  }, [opening])
  return <PracticeBoard setup={setup} onExit={onExit} />
}
