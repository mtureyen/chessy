/** URL search params of /training/openings: one opening to show; without them, all of them. */
export interface OpeningsSearch {
  color?: 'white' | 'black'
  family?: string
}

export function parseOpeningsSearch(search: Record<string, unknown>): OpeningsSearch {
  const { color, family } = search
  if ((color !== 'white' && color !== 'black') || typeof family !== 'string') return {}
  const name = family.trim()
  return name && name.length <= 100 ? { color, family: name } : {}
}
