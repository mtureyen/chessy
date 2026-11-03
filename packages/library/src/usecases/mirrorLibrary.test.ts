import { describe, expect, it } from 'vitest'
import { InMemoryGameRepository } from '../adapters/inMemoryGameRepository'
import { MirroredGameRepository } from '../adapters/mirroredGameRepository'
import type { LibraryGame } from '../domain/game'
import type { LibraryMirror } from '../ports/libraryMirror'
import { gameRepositoryContract, sampleGame } from '../testing'
import { mirrorLibrary } from './mirrorLibrary'

/** A mirror kept in memory that can be switched off, like a server that is down. */
function fakeMirror() {
  const stored = new Map<string, LibraryGame>()
  const state = { down: false, uploads: 0 }
  const mirror: LibraryMirror = {
    async missing(ids) {
      if (state.down) throw new Error('down')
      return ids.filter((id) => !stored.has(id))
    },
    async upload(games) {
      if (state.down) throw new Error('down')
      state.uploads++
      for (const game of games) stored.set(game.id, game)
    },
  }
  return { mirror, stored, state }
}

/** Lets the uploads started in the background finish (they only await other promises). */
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

gameRepositoryContract(
  'mirrored',
  () => new MirroredGameRepository(new InMemoryGameRepository(), fakeMirror().mirror),
)

describe('MirroredGameRepository', () => {
  it('saves locally even when the mirror is down, and reports the failure', async () => {
    const { mirror, stored, state } = fakeMirror()
    const errors: unknown[] = []
    const repo = new MirroredGameRepository(new InMemoryGameRepository(), mirror, (e) =>
      errors.push(e),
    )
    const game = sampleGame()
    await repo.saveAll([game])
    await settle()
    expect(stored.has(game.id)).toBe(true)

    state.down = true
    const later = sampleGame()
    await repo.saveAll([later])
    await settle()
    expect(await repo.get(later.id)).toEqual(later)
    expect(errors).toHaveLength(1)
  })
})

describe('mirrorLibrary', () => {
  it('uploads only the games the mirror lacks, in batches', async () => {
    const games = new InMemoryGameRepository()
    const local = Array.from({ length: 450 }, () => sampleGame())
    await games.saveAll(local)
    const { mirror, stored, state } = fakeMirror()
    stored.set(local[0]!.id, local[0]!)

    expect(await mirrorLibrary({ games, mirror })).toEqual({ uploaded: 449 })
    expect(stored.size).toBe(450)
    expect(state.uploads).toBe(3) // 200 + 200 + 49
    expect(await mirrorLibrary({ games, mirror })).toEqual({ uploaded: 0 })
  })
})
