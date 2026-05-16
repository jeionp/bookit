import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks (used for the "no env vars" / base tests) ─────────────────

const { mockVerifyIdToken, mockRunTransaction } = vi.hoisted(() => ({
  mockVerifyIdToken:  vi.fn(),
  mockRunTransaction: vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: () => ({
      doc:   () => ({
        id:  'new-booking-id',
        get: vi.fn().mockResolvedValue({ data: () => ({}) }),
      }),
      where: function () { return this },
    }),
    runTransaction: mockRunTransaction,
  },
}))

vi.mock('@/lib/firebase/businesses', () => ({
  getBusinessBySlug: vi.fn().mockResolvedValue({
    slug: 'paddleup',
    name: 'PaddleUp',
    facilities: [
      {
        id:                'court-1',
        name:              'Court 1',
        pricePerHour:      500,
        primePricePerHour: 600,
        primeTimeStart:    17,
        currency:          'PHP',
      },
    ],
  }),
}))


// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(
  body: object,
  opts: { token?: string | null; ip?: string } = {}
): NextRequest {
  const { token = null, ip } = opts
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (ip)    headers.set('x-real-ip', ip)

  return new NextRequest('http://localhost/api/bookings', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  businessSlug: 'paddleup',
  facilityId:   'court-1',
  date:         '2026-05-10',
  hours:        [8],
}

// ─── Helper: fresh route import with rate-limiter active ─────────────────────
// Resets Vitest's ESM module registry (clears the module-level ratelimit singleton)
// then injects fake Upstash CJS modules and re-applies ESM mocks before importing
// the route fresh.

async function importFreshRouteWithRatelimit(
  mockLimit: ReturnType<typeof vi.fn>
): Promise<{ POST: (req: NextRequest) => Promise<Response> }> {
  vi.resetModules()

  vi.doMock('@upstash/ratelimit', () => ({
    Ratelimit: class {
      static slidingWindow() { return {} }
      limit = mockLimit
    },
  }))
  vi.doMock('@upstash/redis', () => ({
    Redis: { fromEnv: () => ({}) },
  }))
  vi.doMock('@/lib/firebase/admin-app', () => ({
    adminAuth: { verifyIdToken: mockVerifyIdToken },
    adminDb: {
      collection: () => ({
        doc:   () => ({
          id:  'new-booking-id',
          get: vi.fn().mockResolvedValue({ data: () => ({}) }),
        }),
        where: function () { return this },
      }),
      runTransaction: mockRunTransaction,
    },
  }))
  vi.doMock('@/lib/firebase/businesses', () => ({
    getBusinessBySlug: vi.fn().mockResolvedValue({
      slug: 'paddleup',
      name: 'PaddleUp',
      facilities: [{
        id: 'court-1', name: 'Court 1',
        pricePerHour: 500, primePricePerHour: 600,
        primeTimeStart: 17, currency: 'PHP',
      }],
    }),
  }))

  return import('./route')
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/bookings — rate limiting', () => {
  let savedUrl:   string | undefined
  let savedToken: string | undefined

  beforeEach(() => {
    mockVerifyIdToken.mockReset()
    mockRunTransaction.mockReset()
    savedUrl   = process.env.UPSTASH_REDIS_REST_URL
    savedToken = process.env.UPSTASH_REDIS_REST_TOKEN
  })

  afterEach(() => {
    if (savedUrl === undefined)   delete process.env.UPSTASH_REDIS_REST_URL
    else                          process.env.UPSTASH_REDIS_REST_URL = savedUrl
    if (savedToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN
    else                          process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    vi.resetModules()
  })

  // ── Rate limiting skipped when env vars are absent ──────────────────────────

  test('proceeds to auth check (401) when Upstash env vars are absent', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { POST } = await import('./route')

    // getRatelimit() returns null because env vars are absent.
    // No auth header → auth check fires → 401.
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(401)
  })

  test('skips rate limiting when only UPSTASH_REDIS_REST_URL is set', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { POST } = await import('./route')

    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(401)
  })

  test('skips rate limiting when only UPSTASH_REDIS_REST_TOKEN is set', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    process.env.UPSTASH_REDIS_REST_TOKEN = 'some-token'

    const { POST } = await import('./route')

    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(401)
  })

  // ── Rate limit exceeded ─────────────────────────────────────────────────────

  test('returns 429 with { error: "Too many requests" } when rate limit is exceeded', async () => {
    process.env.UPSTASH_REDIS_REST_URL   = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'

    const mockLimit = vi.fn().mockResolvedValue({ success: false })
    const { POST } = await importFreshRouteWithRatelimit(mockLimit)

    const res = await POST(makeReq(VALID_BODY, { ip: '1.2.3.4' }))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Too many requests' })
  })

  test('continues past rate limiter and returns 401 when limit passes but no auth token', async () => {
    process.env.UPSTASH_REDIS_REST_URL   = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'

    const mockLimit = vi.fn().mockResolvedValue({ success: true })
    const { POST } = await importFreshRouteWithRatelimit(mockLimit)

    // Rate limit passes; no auth header → auth check → 401
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(401)
  })

  // ── IP extraction ───────────────────────────────────────────────────────────

  test('uses x-real-ip as the rate-limit key', async () => {
    process.env.UPSTASH_REDIS_REST_URL   = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'

    const mockLimit = vi.fn().mockResolvedValue({ success: false })
    const { POST } = await importFreshRouteWithRatelimit(mockLimit)

    await POST(makeReq(VALID_BODY, { ip: '203.0.113.5' }))
    expect(mockLimit).toHaveBeenCalledWith('203.0.113.5')
  })

  test('falls back to "anonymous" as the rate-limit key when x-real-ip is absent', async () => {
    process.env.UPSTASH_REDIS_REST_URL   = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'

    const mockLimit = vi.fn().mockResolvedValue({ success: false })
    const { POST } = await importFreshRouteWithRatelimit(mockLimit)

    await POST(makeReq(VALID_BODY))
    expect(mockLimit).toHaveBeenCalledWith('anonymous')
  })

  // ── Redis failure — fail open ────────────────────────────────────────────────

  test('fails open (proceeds to auth check) when Redis throws during limit call', async () => {
    process.env.UPSTASH_REDIS_REST_URL   = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'

    const mockLimit = vi.fn().mockRejectedValue(new Error('Redis connection refused'))
    const { POST } = await importFreshRouteWithRatelimit(mockLimit)

    // Rate limiter throws → fail open → continues to auth check → 401 (no token)
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(401)
  })
})

// ─── Input validation tests ───────────────────────────────────────────────────
// These run without Upstash env vars so rate limiting is skipped.
// An auth token is provided so the route reaches the validation logic.

describe('POST /api/bookings — input validation', () => {
  beforeEach(() => {
    mockVerifyIdToken.mockReset()
    mockRunTransaction.mockReset()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1', email: 'a@b.com', name: 'Alice' })
  })

  afterEach(() => {
    vi.resetModules()
  })

  test('returns 400 for date without dashes (YYYYMMDD)', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({ ...VALID_BODY, date: '20260510' }, { token: 'tok' }))
    expect(res.status).toBe(400)
  })

  test('returns 400 for date in MM/DD/YYYY format', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({ ...VALID_BODY, date: '05/10/2026' }, { token: 'tok' }))
    expect(res.status).toBe(400)
  })

  test('returns 400 when hours array exceeds 24 entries', async () => {
    const { POST } = await import('./route')
    const tooMany = Array.from({ length: 25 }, (_, i) => i % 24)
    const res = await POST(makeReq({ ...VALID_BODY, hours: tooMany }, { token: 'tok' }))
    expect(res.status).toBe(400)
  })

  test('returns 400 when an hour value is out of range (24)', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({ ...VALID_BODY, hours: [8, 24] }, { token: 'tok' }))
    expect(res.status).toBe(400)
  })

  test('returns 400 when an hour value is negative', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({ ...VALID_BODY, hours: [-1, 8] }, { token: 'tok' }))
    expect(res.status).toBe(400)
  })

  test('returns 400 when an hour value is a float', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({ ...VALID_BODY, hours: [8.5] }, { token: 'tok' }))
    expect(res.status).toBe(400)
  })

  test('deduplicates hours before storing — tx.set receives unique values', async () => {
    const { POST } = await import('./route')
    const setMock = vi.fn()
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ get: vi.fn().mockResolvedValue({ docs: [] }), set: setMock })
    })
    const res = await POST(makeReq({ ...VALID_BODY, hours: [8, 8, 9] }, { token: 'tok' }))
    expect(res.status).toBe(201)
    const storedHours = setMock.mock.calls[0][1].hours as number[]
    expect(storedHours).toEqual([8, 9])
  })
})
