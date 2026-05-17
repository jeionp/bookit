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

// ─── SaaS wallet enforcement tests ───────────────────────────────────────────
// Cover the suspension gate added in Phase 1 (still enforced at booking creation).
// Credit deduction and low-balance warnings moved to payment confirmation (Phase 7).

describe('POST /api/bookings — SaaS wallet enforcement', () => {
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

  // Helper: build an adminDb mock whose businesses collection returns bizData.
  function makeAdminDbMock(bizData: Record<string, unknown>) {
    return {
      collection: (name: string) => ({
        doc: () => ({
          id:  'new-booking-id',
          get: vi.fn().mockResolvedValue({ data: () => (name === 'businesses' ? bizData : {}) }),
        }),
        where: function () { return this },
      }),
      runTransaction: mockRunTransaction,
    }
  }

  // Helper: reset modules, apply per-test mocks, and import the route fresh.
  async function importRoute(
    bizData: Record<string, unknown>,
    emailOverrides: Record<string, unknown> = {},
  ) {
    vi.resetModules()
    vi.doMock('@/lib/firebase/admin-app', () => ({
      adminAuth: { verifyIdToken: mockVerifyIdToken },
      adminDb: makeAdminDbMock(bizData),
    }))
    vi.doMock('@/lib/firebase/businesses', () => ({
      getBusinessBySlug: vi.fn().mockResolvedValue({
        slug: 'paddleup', name: 'PaddleUp', email: 'admin@paddleup.com',
        facilities: [{ id: 'court-1', name: 'Court 1', pricePerHour: 500, currency: 'PHP' }],
      }),
    }))
    if (Object.keys(emailOverrides).length > 0) {
      vi.doMock('@/lib/notifications/email', () => ({
        sendBookingConfirmation:    vi.fn().mockResolvedValue(undefined),
        sendAdminBookingNotification: vi.fn().mockResolvedValue(undefined),
        sendLowBalanceWarning:      vi.fn().mockResolvedValue(undefined),
        ...emailOverrides,
      }))
    }
    return import('./route')
  }

  // tx stub used by tests that need a successful booking to complete
  function txSuccess(updateMock = vi.fn()) {
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ get: vi.fn().mockResolvedValue({ docs: [] }), set: vi.fn(), update: updateMock })
    })
    return updateMock
  }

  // ── Suspension gate ────────────────────────────────────────────────────────

  test('returns 503 SERVICE_SUSPENDED when saas_credit_balance is -5', async () => {
    const { POST } = await importRoute({ accepts_qr: true, saas_credit_balance: -5 })
    const res = await POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'SERVICE_SUSPENDED' })
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })

  test('returns 503 when saas_credit_balance is below -5', async () => {
    const { POST } = await importRoute({ accepts_cash: true, saas_credit_balance: -99 })
    const res = await POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(503)
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })

  test('proceeds when accepts_qr is set but saas_credit_balance is -4 (boundary — not yet suspended)', async () => {
    txSuccess()
    const { POST } = await importRoute({ accepts_qr: true, saas_credit_balance: -4 })
    const res = await POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
  })

  test('proceeds when accepts_qr is set but saas_credit_balance is absent (wallet not initialised)', async () => {
    txSuccess()
    const { POST } = await importRoute({ accepts_qr: true })
    const res = await POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
  })

  test('proceeds for legacy businesses with no payment options regardless of balance', async () => {
    txSuccess()
    const { POST } = await importRoute({ saas_credit_balance: -100 })
    const res = await POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
  })

  test('does NOT decrement saas_credit_balance at booking creation (deducted at payment confirmation)', async () => {
    const updateMock = txSuccess()
    const { POST } = await importRoute({ accepts_qr: true, saas_credit_balance: 10 })
    const res = await POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    expect(updateMock).not.toHaveBeenCalled()
  })

  test('returns 400 when both options are enabled but checkout_type is missing', async () => {
    const { POST } = await importRoute({ accepts_qr: true, accepts_cash: true, saas_credit_balance: 10 })
    const res = await POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'checkout_type required' })
  })

  test('returns 400 when player sends P2P_AI but business only accepts cash', async () => {
    const { POST } = await importRoute({ accepts_cash: true, saas_credit_balance: 10 })
    const res = await POST(makeReq({ ...VALID_BODY, checkout_type: 'P2P_AI' }, { token: 'tok' }))
    expect(res.status).toBe(400)
  })

  test('returns 400 when player sends PAY_AT_VENUE but business only accepts QR', async () => {
    const { POST } = await importRoute({ accepts_qr: true, saas_credit_balance: 10 })
    const res = await POST(makeReq({ ...VALID_BODY, checkout_type: 'PAY_AT_VENUE' }, { token: 'tok' }))
    expect(res.status).toBe(400)
  })

  test('returns 400 when player sends an invalid checkout_type value', async () => {
    const { POST } = await importRoute({ accepts_qr: true, accepts_cash: true, saas_credit_balance: 10 })
    const res = await POST(makeReq({ ...VALID_BODY, checkout_type: 'INVALID_TYPE' }, { token: 'tok' }))
    // "INVALID_TYPE" is not accepted by the route; both flags set → checkout_type required path
    // but since it is not "P2P_AI" or "PAY_AT_VENUE", the route falls to the both-flags guard
    expect(res.status).toBe(400)
  })

  test('succeeds (201) when both flags set and player supplies P2P_AI checkout_type', async () => {
    txSuccess()
    const { POST } = await importRoute({ accepts_qr: true, accepts_cash: true, saas_credit_balance: 10 })
    const res = await POST(makeReq({ ...VALID_BODY, checkout_type: 'P2P_AI' }, { token: 'tok' }))
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.checkout_type).toBe('P2P_AI')
  })

  test('succeeds (201) when both flags set and player supplies PAY_AT_VENUE checkout_type', async () => {
    txSuccess()
    const { POST } = await importRoute({ accepts_qr: true, accepts_cash: true, saas_credit_balance: 10 })
    const res = await POST(makeReq({ ...VALID_BODY, checkout_type: 'PAY_AT_VENUE' }, { token: 'tok' }))
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.checkout_type).toBe('PAY_AT_VENUE')
  })

  test('accepts_qr: false (explicit false) behaves same as absent — uses instant-confirm flow', async () => {
    // Explicit false should NOT enable the QR flow; business acts as legacy instant-confirm
    txSuccess()
    const { POST } = await importRoute({ accepts_qr: false })
    const res = await POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    // Legacy flow: no checkout_type in response
    expect(body.checkout_type).toBeUndefined()
  })

  test('accepts_cash: false (explicit false) behaves same as absent — legacy instant-confirm', async () => {
    txSuccess()
    const { POST } = await importRoute({ accepts_cash: false })
    const res = await POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.checkout_type).toBeUndefined()
  })

  test('suspension gate fires for accepts_cash-only business when balance <= -5', async () => {
    const { POST } = await importRoute({ accepts_cash: true, saas_credit_balance: -5 })
    const res = await POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'SERVICE_SUSPENDED' })
  })

  test('suspension gate does NOT fire for legacy business even with very negative balance', async () => {
    // accepts_qr: false, accepts_cash: false → hasPaymentOptions is false → no suspension check
    txSuccess()
    const { POST } = await importRoute({ accepts_qr: false, accepts_cash: false, saas_credit_balance: -999 })
    const res = await POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
  })
})

// ─── P2P slot-held flow tests (phase 2) ──────────────────────────────────────
// Cover the branching introduced by payment_mode === "MANUAL_AI":
//   1. Booking written with slot_held status and P2P fields (checkout_type, etc.)
//   2. Response includes checkout_type and static_qr_url
//   3. Confirmation emails suppressed for slot_held bookings
//   4. Legacy flow unchanged: confirmed status + emails fire
//   5. slot_held conflicts block new bookings (same as confirmed)

describe('POST /api/bookings — P2P slot-held flow', () => {
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

  function makeAdminDbMock(bizData: Record<string, unknown>) {
    return {
      collection: (name: string) => ({
        doc: () => ({
          id:  'new-booking-id',
          get: vi.fn().mockResolvedValue({ data: () => (name === 'businesses' ? bizData : {}) }),
        }),
        where: function () { return this },
      }),
      runTransaction: mockRunTransaction,
    }
  }

  // Returns route + captured email mock fns for assertion
  async function importRoute(bizData: Record<string, unknown>) {
    vi.resetModules()
    const mockSendConfirm  = vi.fn().mockResolvedValue(undefined)
    const mockSendAdmin    = vi.fn().mockResolvedValue(undefined)
    const mockSendWarning  = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/firebase/admin-app', () => ({
      adminAuth: { verifyIdToken: mockVerifyIdToken },
      adminDb: makeAdminDbMock(bizData),
    }))
    vi.doMock('@/lib/firebase/businesses', () => ({
      getBusinessBySlug: vi.fn().mockResolvedValue({
        slug: 'paddleup', name: 'PaddleUp', email: 'admin@paddleup.com',
        facilities: [{ id: 'court-1', name: 'Court 1', pricePerHour: 500, currency: 'PHP' }],
      }),
    }))
    vi.doMock('@/lib/notifications/email', () => ({
      sendBookingConfirmation:      mockSendConfirm,
      sendAdminBookingNotification: mockSendAdmin,
      sendLowBalanceWarning:        mockSendWarning,
    }))
    const route = await import('./route')
    return { route, mockSendConfirm, mockSendAdmin }
  }

  function txWithSet(setMock = vi.fn()) {
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ get: vi.fn().mockResolvedValue({ docs: [] }), set: setMock, update: vi.fn() })
    })
    return setMock
  }

  // ── Booking document fields ────────────────────────────────────────────────

  test('writes slot_held booking with P2P fields when accepts_qr is true', async () => {
    const setMock = txWithSet()
    const { route } = await importRoute({ accepts_qr: true, saas_credit_balance: 10 })
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    const payload = setMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload.status).toBe('slot_held')
    expect(payload.checkout_type).toBe('P2P_AI')
    expect(payload.payment_status_v2).toBe('pending_proof')
    expect(payload.held_until).toBeDefined()
  })

  test('legacy booking still writes confirmed status without P2P fields', async () => {
    const setMock = txWithSet()
    const { route } = await importRoute({})
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    const payload = setMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload.status).toBe('confirmed')
    expect(payload.checkout_type).toBeUndefined()
    expect(payload.payment_status_v2).toBeUndefined()
    expect(payload.held_until).toBeUndefined()
  })

  // ── Response body ─────────────────────────────────────────────────────────

  test('response includes checkout_type P2P_AI and static_qr_url when accepts_qr is true', async () => {
    txWithSet()
    const { route } = await importRoute({
      accepts_qr: true, saas_credit_balance: 10, static_qr_url: 'https://example.com/qr.png',
    })
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.checkout_type).toBe('P2P_AI')
    expect(body.static_qr_url).toBe('https://example.com/qr.png')
  })

  test('static_qr_url is null in response when not set on the business document', async () => {
    txWithSet()
    const { route } = await importRoute({ accepts_qr: true, saas_credit_balance: 10 })
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    const body = await res.json() as Record<string, unknown>
    expect(body.checkout_type).toBe('P2P_AI')
    expect(body.static_qr_url).toBeNull()
  })

  test('legacy response does not include checkout_type or static_qr_url', async () => {
    txWithSet()
    const { route } = await importRoute({})
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    const body = await res.json() as Record<string, unknown>
    expect(body.checkout_type).toBeUndefined()
    expect(body.static_qr_url).toBeUndefined()
  })

  // ── Email suppression ─────────────────────────────────────────────────────

  test('does NOT send confirmation emails for P2P slot_held bookings', async () => {
    txWithSet()
    const { route, mockSendConfirm, mockSendAdmin } = await importRoute({
      accepts_qr: true, saas_credit_balance: 10,
    })
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    expect(mockSendConfirm).not.toHaveBeenCalled()
    expect(mockSendAdmin).not.toHaveBeenCalled()
  })

  test('sends confirmation emails for legacy confirmed bookings', async () => {
    txWithSet()
    const { route, mockSendConfirm, mockSendAdmin } = await importRoute({})
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    expect(mockSendConfirm).toHaveBeenCalled()
    expect(mockSendAdmin).toHaveBeenCalled()
  })

  // ── slot_held conflict check ───────────────────────────────────────────────

  test('returns 409 when a slot_held booking already occupies the requested hours', async () => {
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        get: vi.fn().mockResolvedValue({
          docs: [{ data: () => ({ status: 'slot_held', hours: [8] }) }],
        }),
        set: vi.fn(),
        update: vi.fn(),
      })
    })
    const { route } = await importRoute({ accepts_qr: true, saas_credit_balance: 10 })
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'SLOT_UNAVAILABLE' })
  })
})

// ─── PAY_AT_VENUE booking creation tests (phase 6) ───────────────────────────
// Cover the isPayAtVenue branch in POST /api/bookings:
//   1. Booking written with confirmed status and PAY_AT_VENUE fields
//   2. Response includes checkout_type: PAY_AT_VENUE
//   3. Confirmation emails fire immediately (unlike P2P slot_held)
//   4. Legacy/instant-confirm flow still does NOT set checkout_type or payment_status_v2

describe('POST /api/bookings — PAY_AT_VENUE flow', () => {
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

  function makeAdminDbMock(bizData: Record<string, unknown>) {
    return {
      collection: (name: string) => ({
        doc: () => ({
          id:  'new-booking-id',
          get: vi.fn().mockResolvedValue({ data: () => (name === 'businesses' ? bizData : {}) }),
        }),
        where: function () { return this },
      }),
      runTransaction: mockRunTransaction,
    }
  }

  async function importRoute(bizData: Record<string, unknown>) {
    vi.resetModules()
    const mockSendConfirm  = vi.fn().mockResolvedValue(undefined)
    const mockSendAdmin    = vi.fn().mockResolvedValue(undefined)
    const mockSendWarning  = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/firebase/admin-app', () => ({
      adminAuth: { verifyIdToken: mockVerifyIdToken },
      adminDb: makeAdminDbMock(bizData),
    }))
    vi.doMock('@/lib/firebase/businesses', () => ({
      getBusinessBySlug: vi.fn().mockResolvedValue({
        slug: 'paddleup', name: 'PaddleUp', email: 'admin@paddleup.com', address: '1 Court Lane',
        facilities: [{ id: 'court-1', name: 'Court 1', pricePerHour: 500, currency: 'PHP' }],
      }),
    }))
    vi.doMock('@/lib/notifications/email', () => ({
      sendBookingConfirmation:      mockSendConfirm,
      sendAdminBookingNotification: mockSendAdmin,
      sendLowBalanceWarning:        mockSendWarning,
    }))
    const route = await import('./route')
    return { route, mockSendConfirm, mockSendAdmin }
  }

  function txWithSet(setMock = vi.fn()) {
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({ get: vi.fn().mockResolvedValue({ docs: [] }), set: setMock, update: vi.fn() })
    })
    return setMock
  }

  // ── Booking document fields ────────────────────────────────────────────────

  test('writes confirmed booking with PAY_AT_VENUE fields when accepts_cash is true', async () => {
    const setMock = txWithSet()
    const { route } = await importRoute({ accepts_cash: true, saas_credit_balance: 10 })
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    const payload = setMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload.status).toBe('confirmed')
    expect(payload.checkout_type).toBe('PAY_AT_VENUE')
    expect(payload.payment_status_v2).toBe('pending_cash')
    // PAY_AT_VENUE bookings are not held — held_until should not be set
    expect(payload.held_until).toBeUndefined()
  })

  // ── Response body ─────────────────────────────────────────────────────────

  test('response includes checkout_type PAY_AT_VENUE when accepts_cash is true', async () => {
    txWithSet()
    const { route } = await importRoute({ accepts_cash: true, saas_credit_balance: 10 })
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body.checkout_type).toBe('PAY_AT_VENUE')
    // static_qr_url should NOT appear in PAY_AT_VENUE response (it is a P2P field)
    expect(body.static_qr_url).toBeUndefined()
  })

  // ── Emails fire immediately ────────────────────────────────────────────────

  test('sends confirmation emails immediately for PAY_AT_VENUE bookings', async () => {
    txWithSet()
    const { route, mockSendConfirm, mockSendAdmin } = await importRoute({
      accepts_cash: true, saas_credit_balance: 10,
    })
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    // Emails fire for all non-P2P bookings (PAY_AT_VENUE is not P2P)
    await vi.waitFor(() => expect(mockSendConfirm).toHaveBeenCalled())
    await vi.waitFor(() => expect(mockSendAdmin).toHaveBeenCalled())
  })

  // ── Legacy flow regression ────────────────────────────────────────────────

  test('instant-confirm (no payment options) still does NOT set checkout_type or payment_status_v2', async () => {
    const setMock = txWithSet()
    const { route } = await importRoute({})
    const res = await route.POST(makeReq(VALID_BODY, { token: 'tok' }))
    expect(res.status).toBe(201)
    const payload = setMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload.status).toBe('confirmed')
    expect(payload.checkout_type).toBeUndefined()
    expect(payload.payment_status_v2).toBeUndefined()
    expect(payload.held_until).toBeUndefined()
  })
})
