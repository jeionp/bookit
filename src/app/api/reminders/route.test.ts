import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockSendBookingReminder, mockGetBusinessBySlug, mockAdminDbQuery } = vi.hoisted(() => ({
  mockSendBookingReminder: vi.fn().mockResolvedValue(undefined),
  mockGetBusinessBySlug:   vi.fn(),
  mockAdminDbQuery:        vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminDb: {
    collection: () => ({
      where: function () { return this },
      get:   mockAdminDbQuery,
    }),
  },
}))

vi.mock('@/lib/firebase/businesses', () => ({
  getBusinessBySlug: mockGetBusinessBySlug,
}))

vi.mock('@/lib/notifications/email', () => ({
  sendBookingReminder: mockSendBookingReminder,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(secret?: string): NextRequest {
  const headers = new Headers()
  if (secret !== undefined) headers.set('Authorization', `Bearer ${secret}`)
  return new NextRequest('http://localhost/api/reminders', { method: 'GET', headers })
}

function makeBookingDoc(overrides: Record<string, unknown> = {}) {
  const data = {
    userEmail:    'player@example.com',
    userName:     'Alice',
    businessSlug: 'paddleup',
    facilityName: 'Court A',
    date:         '2026-06-16',
    hours:        [9, 10],
    ...overrides,
  }
  return {
    id:   'bk_001',
    data: () => data,
    ref:  { update: vi.fn().mockResolvedValue(undefined) },
  }
}

const DEFAULT_BIZ = {
  slug:    'paddleup',
  name:    'PaddleUp',
  email:   'info@paddleup.com',
  address: '123 Main St',
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('GET /api/reminders — auth', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    mockAdminDbQuery.mockResolvedValue({ docs: [] })
    mockGetBusinessBySlug.mockResolvedValue(DEFAULT_BIZ)
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
    vi.clearAllMocks()
  })

  test('returns 401 when Authorization header is missing', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  test('returns 401 when secret does not match', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeReq('wrong-secret'))
    expect(res.status).toBe(401)
  })

  test('returns 401 when CRON_SECRET env var is not set', async () => {
    delete process.env.CRON_SECRET
    const { GET } = await import('./route')
    const res = await GET(makeReq('any-value'))
    expect(res.status).toBe(401)
  })

  // An empty-string CRON_SECRET is falsy — the guard treats it as "not set"
  // rather than a valid secret, so callers cannot authenticate with an empty bearer.
  test('returns 401 when CRON_SECRET is an empty string', async () => {
    process.env.CRON_SECRET = ''
    const { GET } = await import('./route')
    const res = await GET(makeReq(''))
    expect(res.status).toBe(401)
  })

  test('returns 200 with correct secret', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    expect(res.status).toBe(200)
  })
})

// ─── Sending logic ────────────────────────────────────────────────────────────

describe('GET /api/reminders — sending logic', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    mockSendBookingReminder.mockClear()
    mockGetBusinessBySlug.mockResolvedValue(DEFAULT_BIZ)
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
    vi.clearAllMocks()
  })

  test('returns { sent: 0, failed: 0 } when no bookings for tomorrow', async () => {
    mockAdminDbQuery.mockResolvedValue({ docs: [] })
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(body.failed).toBe(0)
    expect(mockSendBookingReminder).not.toHaveBeenCalled()
  })

  test('sends reminder for each pending booking', async () => {
    mockAdminDbQuery.mockResolvedValue({
      docs: [makeBookingDoc(), makeBookingDoc({ userEmail: 'bob@example.com', userName: 'Bob' })],
    })
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    const body = await res.json()
    expect(body.sent).toBe(2)
    expect(body.failed).toBe(0)
    expect(mockSendBookingReminder).toHaveBeenCalledTimes(2)
  })

  test('skips bookings with reminderSent: true', async () => {
    mockAdminDbQuery.mockResolvedValue({
      docs: [
        makeBookingDoc({ reminderSent: true }),
        makeBookingDoc({ userEmail: 'bob@example.com', userName: 'Bob' }),
      ],
    })
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    const body = await res.json()
    expect(body.sent).toBe(1)
    expect(mockSendBookingReminder).toHaveBeenCalledTimes(1)
    expect(mockSendBookingReminder.mock.calls[0][0].customerEmail).toBe('bob@example.com')
  })

  // reminderSent: false (explicit) and field absent must both be processed.
  test('treats reminderSent: false the same as field absent', async () => {
    mockAdminDbQuery.mockResolvedValue({
      docs: [
        makeBookingDoc({ reminderSent: false }),
        makeBookingDoc({ userEmail: 'bob@example.com', userName: 'Bob' }),
      ],
    })
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    const body = await res.json()
    expect(body.sent).toBe(2)
    expect(mockSendBookingReminder).toHaveBeenCalledTimes(2)
  })

  test('skips bookings with an empty hours array', async () => {
    mockAdminDbQuery.mockResolvedValue({
      docs: [
        makeBookingDoc({ hours: [] }),
        makeBookingDoc({ userEmail: 'bob@example.com', userName: 'Bob' }),
      ],
    })
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    const body = await res.json()
    expect(body.sent).toBe(1)
    expect(mockSendBookingReminder).toHaveBeenCalledTimes(1)
    expect(mockSendBookingReminder.mock.calls[0][0].customerEmail).toBe('bob@example.com')
  })

  test('skips bookings with a missing hours field', async () => {
    mockAdminDbQuery.mockResolvedValue({
      docs: [makeBookingDoc({ hours: undefined })],
    })
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(mockSendBookingReminder).not.toHaveBeenCalled()
  })

  test('marks each booking with reminderSent: true after sending', async () => {
    const doc = makeBookingDoc()
    mockAdminDbQuery.mockResolvedValue({ docs: [doc] })
    const { GET } = await import('./route')
    await GET(makeReq('test-secret'))
    expect(doc.ref.update).toHaveBeenCalledWith({ reminderSent: true })
  })

  test('passes correct data to sendBookingReminder', async () => {
    mockAdminDbQuery.mockResolvedValue({ docs: [makeBookingDoc()] })
    const { GET } = await import('./route')
    await GET(makeReq('test-secret'))
    const call = mockSendBookingReminder.mock.calls[0][0]
    expect(call.customerEmail).toBe('player@example.com')
    expect(call.customerName).toBe('Alice')
    expect(call.bookingId).toBe('bk_001')
    expect(call.businessName).toBe('PaddleUp')
    expect(call.businessEmail).toBe('info@paddleup.com')
    expect(call.businessAddress).toBe('123 Main St')
    expect(call.facilityName).toBe('Court A')
    expect(call.hours).toEqual([9, 10])
  })

  // A deleted business is a no-op (no email, no stamp). It does not count as failed
  // because there is nothing actionable — the booking is simply orphaned.
  test('skips booking silently when business is not found', async () => {
    mockAdminDbQuery.mockResolvedValue({ docs: [makeBookingDoc()] })
    mockGetBusinessBySlug.mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    const body = await res.json()
    expect(mockSendBookingReminder).not.toHaveBeenCalled()
    expect(body.sent).toBe(1)   // early return counts as fulfilled
    expect(body.failed).toBe(0)
  })

  test('fetches each unique business only once for same slug', async () => {
    mockAdminDbQuery.mockResolvedValue({
      docs: [
        makeBookingDoc(),
        makeBookingDoc({ userEmail: 'bob@example.com', userName: 'Bob' }),
      ],
    })
    const { GET } = await import('./route')
    await GET(makeReq('test-secret'))
    expect(mockGetBusinessBySlug).toHaveBeenCalledTimes(1)
    expect(mockGetBusinessBySlug).toHaveBeenCalledWith('paddleup')
  })

  // Two different slugs must each fetch their own business, and each booking must
  // receive the data from its own business — not from the other slug's entry.
  test('fetches separate business for each distinct slug and pairs data correctly', async () => {
    const biz2 = { slug: 'courtside', name: 'Courtside', email: 'info@courtside.com', address: '456 Oak Ave' }
    mockGetBusinessBySlug.mockImplementation((slug: string) =>
      Promise.resolve(slug === 'paddleup' ? DEFAULT_BIZ : biz2),
    )
    mockAdminDbQuery.mockResolvedValue({
      docs: [
        makeBookingDoc({ businessSlug: 'paddleup' }),
        makeBookingDoc({ userEmail: 'bob@example.com', userName: 'Bob', businessSlug: 'courtside' }),
      ],
    })
    const { GET } = await import('./route')
    await GET(makeReq('test-secret'))
    expect(mockGetBusinessBySlug).toHaveBeenCalledTimes(2)
    const calls = mockSendBookingReminder.mock.calls
    const aliceCall = calls.find((c: [{ customerEmail: string }]) => c[0].customerEmail === 'player@example.com')
    const bobCall   = calls.find((c: [{ customerEmail: string }]) => c[0].customerEmail === 'bob@example.com')
    expect(aliceCall[0].businessName).toBe('PaddleUp')
    expect(bobCall[0].businessName).toBe('Courtside')
  })

  test('response body includes the target date', async () => {
    mockAdminDbQuery.mockResolvedValue({ docs: [] })
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    const body = await res.json()
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('returns 500 when Firestore query throws', async () => {
    mockAdminDbQuery.mockRejectedValueOnce(new Error('Firestore unavailable'))
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
    expect(mockSendBookingReminder).not.toHaveBeenCalled()
  })

  test('counts ref.update failure in failed, not sent', async () => {
    const doc = makeBookingDoc()
    doc.ref.update = vi.fn().mockRejectedValueOnce(new Error('write failed'))
    mockAdminDbQuery.mockResolvedValue({ docs: [doc] })
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(body.failed).toBe(1)
  })

  // allSettled — one update failure must not abort the rest of the batch.
  test('remaining bookings still process when one ref.update throws', async () => {
    const failDoc    = makeBookingDoc()
    failDoc.ref.update = vi.fn().mockRejectedValueOnce(new Error('write failed'))
    const successDoc = makeBookingDoc({ userEmail: 'bob@example.com', userName: 'Bob' })
    mockAdminDbQuery.mockResolvedValue({ docs: [failDoc, successDoc] })
    const { GET } = await import('./route')
    const res = await GET(makeReq('test-secret'))
    const body = await res.json()
    expect(body.sent).toBe(1)
    expect(body.failed).toBe(1)
    expect(mockSendBookingReminder).toHaveBeenCalledTimes(2)
    expect(successDoc.ref.update).toHaveBeenCalledWith({ reminderSent: true })
  })
})

// ─── getTomorrowDateString ────────────────────────────────────────────────────

describe('getTomorrowDateString', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('returns a YYYY-MM-DD string one day ahead of UTC today', async () => {
    const { getTomorrowDateString } = await import('./route')
    const result = getTomorrowDateString()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const today = new Date()
    const expected = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1))
      .toISOString()
      .slice(0, 10)
    expect(result).toBe(expected)
  })

  // Pinned-clock tests guard against regressions that use local time instead of UTC.
  // In UTC+8 (Manila), local midnight is 16:00 UTC the prior day — a local-time
  // implementation would return the wrong date for bookings on the boundary.
  test('returns correct date at 23:59:59 UTC (day-boundary — one second before midnight)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-13T23:59:59Z'))
    const { getTomorrowDateString } = await import('./route')
    expect(getTomorrowDateString()).toBe('2026-05-14')
  })

  test('returns correct date at exactly midnight UTC', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T00:00:00Z'))
    const { getTomorrowDateString } = await import('./route')
    expect(getTomorrowDateString()).toBe('2026-05-15')
  })
})
