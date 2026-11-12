import { describe, expect, it } from 'vitest'
import { InMemoryGameRepository } from '../adapters/inMemoryGameRepository'
import { MirroredGameRepository } from '../adapters/mirroredGameRepository'
import type { LibraryGame } from '../domain/game'
import type { LibraryMirror } from '../ports/libraryMirror'
import { gameRepositoryContract, sampleGame } from '../testing'
import { mirrorLibrary } from './mirrorLibrary'

/**
 * A mirror kept in memory that can be switched off, like a server that is down. Like the server
 * it keeps a platform game once: sent again under another id, it answers with its own id.
 */
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
      const renamed = []
      for (const game of games) {
        const kept = [...stored.values()].find(
          (g) => g.source === game.source && g.externalId === game.externalId,
        )
        if (kept && kept.id !== game.id) renamed.push({ id: game.id, as: kept.id })
        else stored.set(game.id, game)
      }
      return { renamed }
    },
    async remove(id) {
      if (state.down) throw new Error('down')
      stored.delete(id)
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
  it('uploads many games in batches the mirror takes', async () => {
    const sizes: number[] = []
    const mirror: LibraryMirror = {
      missing: async () => [],
      async upload(games) {
        sizes.push(games.length)
        return { renamed: [] }
      },
      remove: async () => undefined,
    }
    const repo = new MirroredGameRepository(new InMemoryGameRepository(), mirror)
    await repo.saveAll(Array.from({ length: 1201 }, () => sampleGame()))
    await settle()
    expect(sizes).toEqual([500, 500, 201])
  })

  it('deletes in the mirror too, also a game the mirror keeps under another id', async () => {
    const { mirror, stored } = fakeMirror()
    const repo = new MirroredGameRepository(new InMemoryGameRepository(), mirror)
    const game = sampleGame()
    await repo.saveAll([game])
    await settle()
    expect(stored.has(game.id)).toBe(true)
    await repo.delete(game.id)
    await settle()
    expect(stored.has(game.id)).toBe(false)
    expect(await repo.get(game.id)).toBeUndefined()

    // Imported in another browser first: here it gets that browser's id, and goes by both.
    const theirs = sampleGame()
    stored.set(theirs.id, theirs)
    const mine = { ...theirs, id: 'local-copy' }
    await repo.saveAll([mine])
    await settle()
    await repo.delete('local-copy')
    await settle()
    expect(stored.has(theirs.id)).toBe(false)
    expect(await repo.get(theirs.id)).toBeUndefined()
  })

  it('deletes locally even when the mirror is down, and reports the failure', async () => {
    const { mirror, state } = fakeMirror()
    const errors: unknown[] = []
    const repo = new MirroredGameRepository(new InMemoryGameRepository(), mirror, (e) =>
      errors.push(e),
    )
    const game = sampleGame()
    await repo.saveAll([game])
    await settle()
    state.down = true
    await repo.delete(game.id)
    await settle()
    expect(await repo.get(game.id)).toBeUndefined()
    expect(errors).toHaveLength(1)
  })

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

describe('MirroredGameRepository uploads', () => {
  it('reach the mirror in the order of the saves, also when an upload is slow', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const firstDone = new Promise<void>((resolve) => (releaseFirst = resolve))
    const mirror: LibraryMirror = {
      missing: async () => [],
      async upload(games) {
        if (games[0]!.result === '*') await firstDone
        order.push(games[0]!.result)
        return { renamed: [] }
      },
      remove: async () => undefined,
    }
    const repo = new MirroredGameRepository(new InMemoryGameRepository(), mirror)
    const game = sampleGame({ result: '*' })
    await repo.saveAll([game])
    await repo.saveAll([{ ...game, result: '1-0' }])
    await settle()
    expect(order).toEqual([])
    releaseFirst()
    await settle()
    expect(order).toEqual(['*', '1-0'])
  })
})

describe('a game the mirror already holds under another id', () => {
  it('takes the mirror’s id locally when it is saved', async () => {
    const { mirror, stored } = fakeMirror()
    const theirs = sampleGame({ id: 'server-id' })
    stored.set(theirs.id, theirs)
    const local = new InMemoryGameRepository()
    const renamed: unknown[] = []
    const repo = new MirroredGameRepository(local, mirror, undefined, (r) => renamed.push(...r))
    const mine = { ...theirs, id: 'browser-id' }
    const fresh = sampleGame()
    await repo.saveAll([mine, fresh])
    await settle()
    expect(await repo.get('server-id')).toEqual({ ...mine, id: 'server-id' })
    expect(stored.has(fresh.id)).toBe(true) // the new one in the same batch got through
    expect(stored.size).toBe(2)
    expect(renamed).toEqual([{ id: 'browser-id', as: 'server-id' }])
    // A page opened by the old id (just before the upload) still finds the game.
    expect(await repo.get('browser-id')).toEqual({ ...mine, id: 'server-id' })
    expect(await local.get('browser-id')).toBeUndefined()
  })

  it('takes the mirror’s id when catching up', async () => {
    const { mirror, stored } = fakeMirror()
    const theirs = sampleGame({ id: 'server-id' })
    stored.set(theirs.id, theirs)
    const games = new InMemoryGameRepository()
    await games.saveAll([{ ...theirs, id: 'browser-id' }])
    expect(await mirrorLibrary({ games, mirror })).toEqual({ uploaded: 1 })
    expect((await games.list()).map((g) => g.id)).toEqual(['server-id'])
    expect(await mirrorLibrary({ games, mirror })).toEqual({ uploaded: 0 })
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
