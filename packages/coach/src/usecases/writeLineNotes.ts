import {
  LINE_NOTES_PROMPT,
  lineNotesText,
  parseLineNotes,
  type LineNotes,
  type LineNotesFacts,
} from '../domain/lineNotes'
import type { CancelSignal } from '../domain/messages'
import type { CoachAgent } from '../ports/coachAgent'

/** Tries for a reply that can be used: models sometimes wrap or cut their JSON. */
const ATTEMPTS = 2

/** A line's notes by the agent, from the library's facts: no tools, no conversation. */
export async function writeLineNotes(
  agent: CoachAgent,
  facts: LineNotesFacts,
  signal?: CancelSignal,
): Promise<LineNotes> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const text = await agent.compose({
      system: LINE_NOTES_PROMPT,
      text: lineNotesText(facts),
      ...(signal && { signal }),
    })
    const notes = parseLineNotes(text, facts)
    if (notes) return notes
  }
  throw new Error('The coach gave no usable notes')
}
