import { describe, expect, it } from 'vitest'
import { createApp } from './app'

const app = createApp({ version: '9.9.9', startedAt: 1_000, now: () => 61_000 })

describe('api', () => {
  it('GET /api/v1/health', async () => {
    const res = await app.request('/api/v1/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'ok',
      service: 'chessy-api',
      version: '9.9.9',
      uptimeSeconds: 60,
    })
  })

  it('serves the OpenAPI document generated from the contracts', async () => {
    const res = await app.request('/api/v1/openapi.json')
    const doc = (await res.json()) as { paths: Record<string, unknown>; servers: { url: string }[] }
    expect(doc.servers[0]?.url).toBe('/api/v1')
    expect(Object.keys(doc.paths)).toContain('/health')
  })

  it('serves API docs', async () => {
    const res = await app.request('/api/v1/docs')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('answers unknown routes with a problem document', async () => {
    const res = await app.request('/api/v1/nope')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(await res.json()).toMatchObject({
      status: 404,
      title: 'Not Found',
      instance: '/api/v1/nope',
    })
  })
})
