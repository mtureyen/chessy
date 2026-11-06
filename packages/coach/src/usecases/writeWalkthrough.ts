import type { CancelSignal } from '../domain/messages'
import {
  parseWalkthrough,
  WALKTHROUGH_PROMPT,
  walkthroughText,
  type Walkthrough,
  type WalkthroughFacts,
} from '../domain/walkthrough'
import type { CoachAgent } from '../ports/coachAgent'

/** Tries for a reply that can be used: models sometimes wrap or cut their JSON. */
const ATTEMPTS = 2

/** A game's walkthrough by the agent, from the facts alone: no tools, no conversation. */
export async function writeWalkthrough(
  agent: CoachAgent,
  facts: WalkthroughFacts,
  signal?: CancelSignal,
): Promise<Walkthrough> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const text = await agent.compose({
      system: WALKTHROUGH_PROMPT,
      text: walkthroughText(facts),
      ...(signal && { signal }),
    })
    const walkthrough = parseWalkthrough(text, facts)
    if (walkthrough) return walkthrough
  }
  throw new Error('The coach gave no usable walkthrough')
}
