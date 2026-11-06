import type { GameLine } from '@chessy/history'
import { queryOptions } from '@tanstack/react-query'
import type { Services } from '@/app/services'

/**
 * The server's review of a main line; null when it has none. Asked each time a line comes up
 * (nothing cached), so what was reviewed in the meantime, here or on the server, shows.
 */
export function storedReviewQuery(review: Services['review'], line: GameLine) {
  return queryOptions({
    queryKey: ['stored-review', line],
    queryFn: () => review.stored(line),
    gcTime: 0,
    // Without the server for a moment the review on screen shouldn't go away.
    refetchOnWindowFocus: false,
  })
}
