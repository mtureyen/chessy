import { describe, expect, it } from 'vitest'
import { botBudget } from './budget'
import { botLevel } from './levels'

describe('botBudget', () => {
  it('thinks at full strength with time to spare and faster when low', () => {
    const master = botLevel(8)
    expect(botBudget(master).nodes).toBe(master.nodes)
    expect(botBudget(master, 120_000)).toEqual(botBudget(master))
    const budgets = [40_000, 10_000, 2_000].map((ms) => botBudget(master, ms))
    for (const [i, budget] of budgets.entries()) {
      const before = i === 0 ? botBudget(master) : budgets[i - 1]!
      expect(budget.nodes).toBeLessThanOrEqual(before.nodes)
      expect(budget.delayMs.max).toBeLessThanOrEqual(before.delayMs.max)
    }
    expect(budgets.at(-1)!.delayMs.max).toBe(0)
    expect(botBudget(botLevel(1), 2_000).nodes).toBeLessThanOrEqual(botLevel(1).nodes)
  })
})
