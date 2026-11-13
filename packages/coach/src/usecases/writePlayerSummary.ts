import type { CancelSignal } from '../domain/messages'
import {
  parsePlayerSummary,
  playerSummaryPrompt,
  playerSummaryText,
  type PlayerSummary,
  type PlayerSummaryFacts,
} from '../domain/playerSummary'
import type { CoachAgent } from '../ports/coachAgent'

/** Tries for a reply that can be used: models sometimes wrap or cut their JSON. */
const ATTEMPTS = 2

/** The coach's summary of a player's numbers: one turn, no tools, no conversation. */
export async function writePlayerSummary(
  agent: CoachAgent,
  facts: PlayerSummaryFacts,
  signal?: CancelSignal,
): Promise<PlayerSummary> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const text = await agent.compose({
      system: playerSummaryPrompt(facts),
      text: playerSummaryText(facts),
      ...(signal && { signal }),
    })
    const summary = parsePlayerSummary(text)
    if (summary) return summary
  }
  throw new Error('The coach gave no usable summary')
}
