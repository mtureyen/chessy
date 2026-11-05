import { describe, expect, it } from 'vitest'
import { showOnBoardTool } from './showOnBoard'

const tool = showOnBoardTool()
const parsed = (input: unknown) => {
  const result = tool.parse(input)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('show_on_board', () => {
  it('draws what it is given, in default colours', async () => {
    const output = await tool.run(
      parsed({ arrows: [{ from: 'g1', to: 'f3' }], squares: [{ square: 'f7', color: 'red' }] }),
      {},
    )
    expect(output.board).toEqual({
      arrows: [{ from: 'g1', to: 'f3', color: 'green' }],
      squares: [{ square: 'f7', color: 'red' }],
    })
    expect(output.content).toBe('Shown to the user: 1 arrow and 1 square.')
  })

  it('can show another position', async () => {
    const fen = '8/8/8/8/8/2k5/1q6/4K3 b - - 0 1'
    const output = await tool.run(parsed({ arrows: [{ from: 'b2', to: 'b1' }], fen }), {})
    expect(output.board?.fen).toBe(fen)
    await expect(
      tool.run(parsed({ squares: [{ square: 'e4' }], fen: 'nonsense' }), {}),
    ).rejects.toThrow()
  })

  it('refuses drawings that are empty or not on the board', () => {
    expect(tool.parse({}).ok).toBe(false)
    expect(tool.parse({ squares: [{ square: 'i9' }] }).ok).toBe(false)
    expect(tool.parse({ arrows: [{ from: 'e2', to: 'e2' }] }).ok).toBe(false)
    expect(tool.parse({ squares: [{ square: 'e4', color: 'purple' }] }).ok).toBe(false)
  })
})
