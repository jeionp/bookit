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
      doc:   () => ({ id: 'new-booking-id' }),
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

// ─── require.cache helpers for CJS Upstash packages ──────────────────────────
// vi.mock() does not intercept the CJS require() calls that getRatelimit() makes
// for @upstash/ratelimit and @upstash/redis because those packages are externalized
// (not transformed by Vitest's ESM pipeline).  The only reliable approach is to
// inject fakes directly into Node's require.cache before the route is (re)loaded.

const RL_PATH    = require.resolve('@upstash/ratelimit')
const REDIS_PATH = require.resolve('@upstash/redis')

function injectFakeUpstash(mockLimit: ReturnType<typeof vi.fn>): void {
  require.cache[RL_PATH] = {
    id: RL_PATH, filename: RL_PATH, loaded: true, path: RL_PATH, paths: [],
    children: [], parent: null,
    exports: {
      Ratelimit: class {
        static slidingWindow() { return {} }
        limit = mockLimit
      },
    },
  } as unknown as NodeJS.Module

  require.cache[REDIS_PATH] = {
    id: REDIS_PATH, filename: REDIS_PATH, loaded: true, path: REDIS_PATH, paths: [],
    children: [], parent: null,
    exports: { Redis: { fromEnv: () => ({}) } },
  } as unknown as NodeJS.Module
}

function restoreUpstash(
  savedRl:    NodeJS.Module | undefined,
  savedRedis: NodeJS.Module | undefined,
): void {
  if (savedRl)    require.cache[RL_PATH]    = savedRl
  else            delete require.cache[RL_PATH]
  if (savedRedis) require.cache[REDIS_PATH] = savedRedis
  else            delete require.cache[REDIS_PATH]
}

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

  // Re-register ESM mocks after resetModules cleared them
  vi.doMock('@/lib/firebase/admin-app', () => ({
    adminAuth: { verifyIdToken: mockVerifyIdToken },
    adminDb: {
      collection: () => ({
        doc:   () => ({ id: 'new-booking-id' }),
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

  // Inject CJS fakes so the route's require() calls get our mock
  injectFakeUpstash(mockLimit)

  return import('./route')
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/bookings — rate limiting', () => {
  let savedUrl:   string | undefined
  let savedToken: string | undefined
  let savedRl:    NodeJS.Module | undefined
  let savedRedis: NodeJS.Module | undefined

  beforeEach(() => {
    mockVerifyIdToken.mockReset()
    mockRunTransaction.mockReset()
    savedUrl   = process.env.UPSTASH_REDIS_REST_URL
    savedToken = process.env.UPSTASH_REDIS_REST_TOKEN
    savedRl    = require.cache[RL_PATH]
    savedRedis = require.cache[REDIS_PATH]
  })

  afterEach(() => {
    if (savedUrl === undefined)   delete process.env.UPSTASH_REDIS_REST_URL
    else                          process.env.UPSTASH_REDIS_REST_URL = savedUrl
    if (savedToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN
    else                          process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    restoreUpstash(savedRl, savedRedis)
    // Always reset modules at the end so the main import() alias cache is clean
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
