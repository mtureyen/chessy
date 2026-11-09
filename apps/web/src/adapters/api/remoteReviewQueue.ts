import type { Problem, ReviewQueueBody, StartReviewQueueBody } from '@pawnia/contracts'
import type { ApiClient } from './client'

/** The review of the user's recent games, which runs on the server. */
export class RemoteReviewQueue {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  async status(): Promise<ReviewQueueBody> {
    const res = await this.api.api.v1.library['review-queue'].$get()
    return (await res.json()) as ReviewQueueBody
  }

  async start(request: StartReviewQueueBody): Promise<ReviewQueueBody> {
    const res = await this.api.api.v1.library['review-queue'].$post({ json: request })
    if (res.status !== 200) {
      const problem = (await res.json().catch(() => ({}))) as Partial<Problem>
      throw new Error(problem.detail ?? problem.title ?? `HTTP ${res.status}`)
    }
    return (await res.json()) as ReviewQueueBody
  }

  async pause(): Promise<ReviewQueueBody> {
    const res = await this.api.api.v1.library['review-queue'].pause.$post()
    return (await res.json()) as ReviewQueueBody
  }

  async resume(): Promise<ReviewQueueBody> {
    const res = await this.api.api.v1.library['review-queue'].resume.$post()
    return (await res.json()) as ReviewQueueBody
  }
}
