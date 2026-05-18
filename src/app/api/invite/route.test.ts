/**
 * Unit tests for POST /api/invite
 *
 * Tests auth (S7), admin-slug authorization, rate limiting, input validation,
 * and the happy-path stub response.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockVerifyIdToken,
  mockAdminDocGet,
  mockRatelimitLimit,
} = vi.hoisted(() => ({
  mockVerifyIdToken:   vi.fn(),
  mockAdminDocGet:     vi.fn(),
  mockRatelimitLimit:  vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mockAdminDocGet }),
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

import { POST } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(
  body: object,
  token: string | null = 'valid-token',
): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost/api/invite', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  email:        'customer@example.com',
  name:         'Test User',
  businessSlug: 'paddleup',
  businessName: 'PaddleUp Ortigas',
}

// ─── Auth tests (S7) ─────────────────────────────────────────────────────────

describe('POST /api/invite — auth (S7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  test('returns 401 when Authorization header is absent', async () => {
    const res = await POST(makeReq(VALID_BODY, null))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Unauthorized' })
    expect(mockVerifyIdToken).not.toHaveBeenCalled()
  })

  test('returns 401 when token verification throws (invalid token)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token expired'))
    const res = await POST(makeReq(VALID_BODY, 'bad-token'))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Unauthorized' })
  })
})

// ─── Input validation tests ───────────────────────────────────────────────────

describe('POST /api/invite — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid' })
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  test('returns 400 when email is missing', async () => {
    // body validation happens before admin lookup, so no admin mock needed
    const res = await POST(makeReq({ businessSlug: 'paddleup', businessName: 'PaddleUp' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid request' })
    expect(mockAdminDocGet).not.toHaveBeenCalled()
  })

  test('returns 400 when businessSlug is missing', async () => {
    const res = await POST(makeReq({ email: 'x@example.com', businessName: 'PaddleUp' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid request' })
    expect(mockAdminDocGet).not.toHaveBeenCalled()
  })
})

// ─── Admin authorization tests (S7) ──────────────────────────────────────────

describe('POST /api/invite — admin slug authorization (S7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid' })
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  test('returns 403 when uid is not an admin of the businessSlug', async () => {
    mockAdminDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ slugs: ['other-biz'] }),
    })
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'Forbidden' })
  })

  test('returns 403 when admin doc does not exist', async () => {
    mockAdminDocGet.mockResolvedValue({ exists: false, data: () => undefined })
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'Forbidden' })
  })
})

// ─── Rate limiting tests (S7) ─────────────────────────────────────────────────

describe('POST /api/invite — rate limiting (S7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid' })
    mockAdminDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ slugs: ['paddleup'] }),
    })
    process.env.UPSTASH_REDIS_REST_URL   = 'https://fake.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
  })

  test('returns 429 when per uid:businessSlug rate limit is exceeded', async () => {
    mockRatelimitLimit.mockResolvedValue({ success: false })
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: 'Too many requests' })
  })
})

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('POST /api/invite — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid' })
    mockAdminDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ slugs: ['paddleup'] }),
    })
    // Ensure any cached rate-limiter singleton passes through
    mockRatelimitLimit.mockResolvedValue({ success: true })
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  test('returns 200 { ok: true, stub: true } for valid admin request', async () => {
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, stub: true })
  })
})
