import type { CancelSignal } from '../domain/messages'
import {
  OPENING_GUIDE_PROMPT,
  openingGuideText,
  parseOpeningGuide,
  type OpeningGuide,
  type OpeningGuideFacts,
} from '../domain/openingGuide'
import type { CoachAgent } from '../ports/coachAgent'

/** Tries for a reply that can be used: models sometimes wrap or cut their JSON. */
const ATTEMPTS = 2

/** An opening's study guide by the agent, from the library's facts: no tools, no conversation. */
export async function writeOpeningGuide(
  agent: CoachAgent,
  facts: OpeningGuideFacts,
  signal?: CancelSignal,
): Promise<OpeningGuide> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const text = await agent.compose({
      system: OPENING_GUIDE_PROMPT,
      text: openingGuideText(facts),
      ...(signal && { signal }),
    })
    const guide = parseOpeningGuide(text, facts)
    if (guide) return guide
  }
  throw new Error('The coach gave no usable guide')
}
