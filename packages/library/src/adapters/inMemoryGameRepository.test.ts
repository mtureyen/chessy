import { gameRepositoryContract } from '../testing'
import { InMemoryGameRepository } from './inMemoryGameRepository'

gameRepositoryContract('in memory', () => new InMemoryGameRepository())
