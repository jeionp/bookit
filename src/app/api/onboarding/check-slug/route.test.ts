/**
 * Unit tests for GET /api/onboarding/check-slug
 *
 * Tests slug validation, Firestore availability lookup, and rate limiting (S4a).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockDocGet,
  mockRatelimitLimit,
} = vi.hoisted(() => ({
  mockDocGet:         vi.fn(),
  mockRatelimitLimit: vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mockDocGet }),
    }),
  },
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    function MockRatelimit() { return { limit: mockRatelimitLimit }; },
    { slidingWindow: vi.fn() },
  ),
}))

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: vi.fn() },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(slug: string, ip?: string): NextRequest {
  const headers = new Headers()
  if (ip) headers.set('x-real-ip', ip)
  return new NextRequest(
    `http://localhost/api/onboarding/check-slug?slug=${encodeURIComponent(slug)}`,
    { method: 'GET', headers },
  )
}

// ─── Availability tests ───────────────────────────────────────────────────────

describe('GET /api/onboarding/check-slug — availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure rate limiter is inactive (no env vars)
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  test('returns { available: true } when slug does not exist', async () => {
    mockDocGet.mockResolvedValue({ exists: false })
    const { GET } = await import('./route')
    const res = await GET(makeReq('my-biz'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ available: true })
  })

  test('returns { available: false } when slug already exists', async () => {
    mockDocGet.mockResolvedValue({ exists: true })
    const { GET } = await import('./route')
    const res = await GET(makeReq('taken-slug'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ available: false })
  })
})

// ─── Validation tests ─────────────────────────────────────────────────────────

describe('GET /api/onboarding/check-slug — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  test('returns 400 for slug with uppercase letters', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeReq('MyBiz'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ available: false, error: 'Invalid slug format' })
    expect(mockDocGet).not.toHaveBeenCalled()
  })

  test('returns 400 for slug with spaces', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeReq('my biz'))
    expect(res.status).toBe(400)
    expect(mockDocGet).not.toHaveBeenCalled()
  })

  test('returns 400 for empty slug', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeReq(''))
    expect(res.status).toBe(400)
    expect(mockDocGet).not.toHaveBeenCalled()
  })

  test('returns 400 for single-character slug (too short)', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeReq('a'))
    expect(res.status).toBe(400)
    expect(mockDocGet).not.toHaveBeenCalled()
  })
})

// ─── Rate limiting tests (S4a) ────────────────────────────────────────────────

describe('GET /api/onboarding/check-slug — rate limiting (S4a)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.UPSTASH_REDIS_REST_URL   = 'https://fake.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
  })

  test('returns 429 when rate limit is exceeded', async () => {
    mockRatelimitLimit.mockResolvedValue({ success: false })
    const { GET } = await import('./route')
    const res = await GET(makeReq('my-biz', '1.2.3.4'))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: 'Too many requests' })
    expect(mockDocGet).not.toHaveBeenCalled()
  })

  test('proceeds normally when rate limit allows the request', async () => {
    mockRatelimitLimit.mockResolvedValue({ success: true })
    mockDocGet.mockResolvedValue({ exists: false })
    const { GET } = await import('./route')
    const res = await GET(makeReq('my-biz', '1.2.3.4'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ available: true })
  })
})
