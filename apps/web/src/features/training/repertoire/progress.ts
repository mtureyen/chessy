import type { RepertoireLineBody } from '@pawnia/contracts'
import { useQuery } from '@tanstack/react-query'
import { useServices } from '@/app/servicesContext'

/** The user's repertoire, for the places that show how far they are; quiet without a database. */
export function useRepertoire() {
  const { repertoire } = useServices()
  return useQuery({ queryKey: ['repertoire'], queryFn: () => repertoire.list(), retry: false })
}

/** How far the user is with an opening: the lines they keep of it, and how many are due. */
export interface Progress {
  kept: number
  due: number
}

export function openingProgress(
  lines: readonly Pick<RepertoireLineBody, 'openingId' | 'due'>[],
  openingId: string,
): Progress {
  const mine = lines.filter((line) => line.openingId === openingId)
  return { kept: mine.length, due: mine.filter((line) => line.due).length }
}

/** "3 lines in your repertoire, 1 due"; undefined without any. */
export function progressText({ kept, due }: Progress): string | undefined {
  if (kept === 0) return undefined
  return `${kept} ${kept === 1 ? 'line' : 'lines'} in your repertoire${due > 0 ? `, ${due} due` : ''}`
}

/** What tells a kept line apart: its side and its moves. */
export function lineKey(side: 'white' | 'black', moves: readonly string[]): string {
  return `${side} ${moves.join(' ')}`
}
