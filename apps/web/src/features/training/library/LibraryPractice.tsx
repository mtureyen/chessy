import type { LibraryOpeningBody } from '@pawnia/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useServices } from '@/app/servicesContext'
import { lineText } from '@/features/stats/format'
import { PracticeBoard, type PracticeSetup } from '../openings/PracticeBoard'
import { openingPaths } from './arrows'
import { games, moveLabel, results, type BandChoice, type BandStats } from './format'
import { answersText, bandPlayers } from './practice'
import '../openings/Openings.css'

/**
 * Practising an opening of the library against real replies: from where the opening starts, the
 * opponent plays what players at the chosen rating play there, the common moves most often. A
 * reply that leaves the opening's named lines comes with what those players answer it with.
 */
export function LibraryPractice({
  opening,
  band,
  onExit,
}: {
  opening: LibraryOpeningBody
  band: BandChoice
  onExit: () => void
}) {
  const { openingLibrary } = useServices()
  const client = useQueryClient()
  const setup = useMemo((): PracticeSetup => {
    const main = opening.main.split(' ')
    const paths = openingPaths(opening.tree)
    /** What real games played after these moves, at the chosen rating. */
    const played = async (sans: readonly string[]) => {
      const position = await client.fetchQuery({
        // The same query as the explorer's.
        queryKey: ['opening-library', 'position', sans.join(',')],
        queryFn: () => openingLibrary.position(sans),
        staleTime: Infinity,
      })
      return (position?.moves ?? []).map((m) => ({
        san: m.san,
        r: results(m.stats as BandStats, band),
      }))
    }
    return {
      heading: opening.name,
      intro: `Starts where the opening does, after ${lineText(main)}. Your opponent plays what ${bandPlayers(band)} play there, the common moves most often.`,
      color: opening.side,
      start: main,
      replies: async (sans) =>
        (await played(sans))
          .map((m) => ({ san: m.san, games: games(m.r) }))
          .filter((m) => m.games > 0),
      theoryToo: false,
      about: async (sans) => {
        if (paths.has(sans.join(' '))) return undefined
        const reply = moveLabel(sans.length, sans.at(-1)!)
        const answers = answersText(await played(sans), opening.side, band, (san) =>
          moveLabel(sans.length + 1, san),
        )
        return `${reply} leaves this opening’s named lines. ${answers ?? 'The library has no games from here.'}`
      },
      missed: { title: `${opening.name}, missed in practice`, openingId: opening.id },
      ending: 'The library’s games end here',
    }
  }, [opening, band, client, openingLibrary])
  return <PracticeBoard setup={setup} onExit={onExit} />
}
