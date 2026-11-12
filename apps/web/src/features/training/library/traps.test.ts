import { describe, expect, it } from 'vitest'
import { avoidDrill, springDrill } from './traps'

// The Fried Liver: after 7.Qf3+ most play 7...Ke8, and 8.Bxd5 wins.
const friedLiver = {
  moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+',
  trapper: 'white' as const,
  yours: true,
  bait: 'Ke8',
  baitShare: 36,
  trapperScore: 78,
  games: 424,
  loss: 20,
  best: 'Ke6',
  punish: '8. Bxd5 Qf6 9. Bxc6+ bxc6 10. Qh5+',
}

describe('springDrill', () => {
  it('is the way there, the mistake, and how to punish it, for the side that sets it', () => {
    const drill = springDrill(friedLiver)!
    expect(drill.side).toBe('white')
    expect(drill.title).toBe('Trap after 7...Ke8: spring it')
    expect(drill.line.slice(-7)).toEqual(['Qf3+', 'Ke8', 'Bxd5', 'Qf6', 'Bxc6+', 'bxc6', 'Qh5+'])
    expect(drill.notes.get(14)).toContain('36% of players under 1600')
    expect(drill.notes.get(15)).toContain('White scores 78%')
    expect(drill.pitfalls.size).toBe(0)
  })

  it('reads a line that starts with Black’s move, and stops at a move that cannot be played', () => {
    const drill = springDrill({
      ...friedLiver,
      moves: 'e4 e5',
      trapper: 'black',
      bait: 'Nc3',
      punish: '2... Nf6 3. Qh8 Bc5',
    })!
    expect(drill.line).toEqual(['e4', 'e5', 'Nc3', 'Nf6'])
    expect(springDrill({ ...friedLiver, punish: '8. Qh8' })).toBeUndefined()
  })
})

describe('avoidDrill', () => {
  it('is the way there and the better move, for the other side; the bait is the pitfall', () => {
    const drill = avoidDrill(friedLiver)!
    expect(drill.side).toBe('black')
    expect(drill.title).toBe('Trap after 7...Ke8: avoid it')
    expect(drill.line.at(-1)).toBe('Ke6')
    expect(drill.line).toHaveLength(14)
    expect(drill.pitfalls.get(14)).toEqual({
      san: 'Ke8',
      text: '7...Ke8 is the trap: after 8. Bxd5 Qf6 9. Bxc6+ bxc6 10. Qh5+ White scores 78% under 1600.',
    })
    expect(drill.notes.get(14)).toContain('This stays out of the trap.')
  })

  it('needs a better move the library knows', () => {
    const { best: _, ...unknown } = friedLiver
    expect(avoidDrill(unknown)).toBeUndefined()
    expect(avoidDrill({ ...friedLiver, best: 'Qh4' })).toBeUndefined()
  })
})
