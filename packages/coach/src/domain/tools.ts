import { z } from 'zod'
import type { BoardDrawing } from './messages'

/** What a tool hands back: text for the model, and maybe something to draw for the user. */
export interface ToolOutput {
  content: string
  board?: BoardDrawing
}

/**
 * A capability the coach can use (engine evaluation, the user's games, drawing on the board).
 * Written once; every provider gets it as a JSON Schema and every input is checked against the
 * schema before `run`, because model output is untrusted.
 */
export interface CoachTool {
  name: string
  description: string
  /** JSON Schema of the input object. */
  inputSchema: Record<string, unknown>
  parse(input: unknown): { ok: true; value: unknown } | { ok: false; error: string }
  run(input: unknown): Promise<ToolOutput>
}

/** A tool from a Zod schema: the schema gives both the JSON Schema and the input check. */
export function defineTool<S extends z.ZodObject>(spec: {
  name: string
  description: string
  input: S
  run: (input: z.infer<S>) => Promise<ToolOutput>
}): CoachTool {
  const { $schema: _dialect, ...inputSchema } = z.toJSONSchema(spec.input) as Record<
    string,
    unknown
  >
  return {
    name: spec.name,
    description: spec.description,
    inputSchema,
    parse(input) {
      const parsed = spec.input.safeParse(input)
      return parsed.success
        ? { ok: true, value: parsed.data }
        : { ok: false, error: z.prettifyError(parsed.error) }
    },
    run: (input) => spec.run(input as z.infer<S>),
  }
}
