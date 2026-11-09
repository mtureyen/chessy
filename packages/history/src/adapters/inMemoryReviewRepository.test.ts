import { InMemoryGameRepository } from '@pawnia/library'
import { reviewRepositoryContract } from '../testing'
import { InMemoryReviewRepository } from './inMemoryReviewRepository'

reviewRepositoryContract('in memory', () => {
  const games = new InMemoryGameRepository()
  return { games, reviews: new InMemoryReviewRepository(games) }
})
