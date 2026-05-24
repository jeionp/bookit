import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockVerifyIdToken,
  mockAdminGet,
  mockBookingGet,
  mockBookingUpdate,
  mockBizGet,
  mockCreditsDocRef,
  mockBatchSet,
  mockBatchUpdate,
  mockBatchCommit,
  mockCreateGateway,
} = vi.hoisted(() => ({
  mockVerifyIdToken:  vi.fn(),
  mockAdminGet:       vi.fn(),
  mockBookingGet:     vi.fn(),
  mockBookingUpdate:  vi.fn(),
  mockBizGet:         vi.fn(),
  mockCreditsDocRef:  {},
  mockBatchSet:       vi.fn(),
  mockBatchUpdate:    vi.fn(),
  mockBatchCommit:    vi.fn(),
  mockCreateGateway:  vi.fn(),
}))

const fakeBatch = {
  set:    mockBatchSet,
  update: mockBatchUpdate,
  commit: mockBatchCommit,
}

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: (name: string) => {
      if (name === 'admins') {
        return { doc: () => ({ get: mockAdminGet }) }
      }
      if (name === 'bookings') {
        return { doc: () => ({ get: mockBookingGet, update: mockBookingUpdate }) }
      }
      if (name === 'businesses') {
        return { doc: () => ({ get: mockBizGet }) }
      }
      // 'credits' — returns a ref-like object for batch.set
      return { doc: () => ({}) }
    },
    batch: () => fakeBatch,
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }) },
  Timestamp:  { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
}))

vi.mock('@/lib/payments/gateway', () => ({
  createGateway: mockCreateGateway,
}))

import { POST } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: object, token: string | null = 'valid-token'): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost/api/refund', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const VALID_BASE = {
  bookingId:    'booking-1',
  businessSlug: 'test-biz',
  amountCents:  5000,
}

function makeBookingData(overrides: Record<string, unknown> = {}) {
  return {
    userId:       'user-1',
    businessSlug: 'test-biz',
    businessName: 'Test Business',
    currency:     'PHP',
    ...overrides,
  }
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe('POST /api/refund — auth', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('returns 401 when Authorization header is missing', async () => {
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit' }, null))
    expect(res.status).toBe(401)
    expect(await res.json()).toHaveProperty('error', 'Unauthorized')
  })

  test('returns 401 when token is invalid (verifyIdToken throws)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token invalid'))
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit' }, 'bad-token'))
    expect(res.status).toBe(401)
    expect(await res.json()).toHaveProperty('error', 'Unauthorized')
  })
})

// ─── Input validation tests ───────────────────────────────────────────────────

describe('POST /api/refund — input validation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'admin-1' })
  })

  test('returns 400 when method is not "refund" or "credit"', async () => {
    const res = await POST(makeReq({ ...VALID_BASE, method: 'cashback' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid request')
  })

  test('returns 400 when method is missing', async () => {
    const res = await POST(makeReq({ ...VALID_BASE }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid request')
  })

  test('returns 400 when amountCents is 0', async () => {
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit', amountCents: 0 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid amount')
  })

  test('returns 400 when amountCents is negative', async () => {
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit', amountCents: -100 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid amount')
  })

  test('returns 400 when amountCents is not a number', async () => {
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit', amountCents: 'five-hundred' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid amount')
  })

  test('returns 400 when amountCents exceeds 10,000,000', async () => {
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit', amountCents: 10_000_001 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid amount')
  })

  test('returns 400 when bookingId is missing', async () => {
    const res = await POST(makeReq({ businessSlug: 'test-biz', method: 'credit', amountCents: 5000 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid request')
  })

  test('returns 400 when businessSlug is missing', async () => {
    const res = await POST(makeReq({ bookingId: 'booking-1', method: 'credit', amountCents: 5000 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid request')
  })
})

// ─── Admin authorization tests ────────────────────────────────────────────────

describe('POST /api/refund — admin authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'admin-1' })
  })

  test("returns 403 when uid's admin slugs don't include businessSlug", async () => {
    mockAdminGet.mockResolvedValue({
      exists: true,
      data: () => ({ slugs: ['other-biz', 'another-biz'] }),
    })
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toHaveProperty('error', 'Forbidden')
  })

  test('returns 403 when admins doc does not exist', async () => {
    mockAdminGet.mockResolvedValue({ exists: false, data: () => null })
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toHaveProperty('error', 'Forbidden')
  })
})

// ─── Booking lookup tests ──────────────────────────────────────────────────────

describe('POST /api/refund — booking lookup', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'admin-1' })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['test-biz'] }) })
  })

  test('returns 404 if booking doc does not exist', async () => {
    mockBookingGet.mockResolvedValue({ exists: false })
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toHaveProperty('error', 'Booking not found')
  })

  test('returns 403 if booking.businessSlug does not match request businessSlug (cross-tenant)', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => makeBookingData({ businessSlug: 'other-biz' }),
    })
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toHaveProperty('error', 'Forbidden')
  })
})

// ─── method: "credit" tests ───────────────────────────────────────────────────

describe('POST /api/refund — method: "credit"', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'admin-1' })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['test-biz'] }) })
    mockBookingGet.mockResolvedValue({ exists: true, data: () => makeBookingData() })
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({ cancellationPolicy: { creditValidityDays: 90 } }) })
    mockBatchSet.mockReturnValue(fakeBatch)
    mockBatchUpdate.mockReturnValue(fakeBatch)
    mockBatchCommit.mockResolvedValue(undefined)
  })

  test('happy path: batch.commit is called; response has { ok: true, creditAmount }', async () => {
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit', amountCents: 5000 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, creditAmount: 50 })
    expect(mockBatchCommit).toHaveBeenCalledOnce()
  })

  test('credit amount equals amountCents / 100', async () => {
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit', amountCents: 12500 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.creditAmount).toBe(125)
  })

  test('credit doc has correct shape written via batch.set', async () => {
    await POST(makeReq({ ...VALID_BASE, method: 'credit', amountCents: 5000 }))

    expect(mockBatchSet).toHaveBeenCalledOnce()
    const [, creditData] = mockBatchSet.mock.calls[0]
    expect(creditData).toMatchObject({
      userId:          'user-1',
      businessSlug:    'test-biz',
      businessName:    'Test Business',
      amount:          50,
      currency:        'PHP',
      type:            'issued',
      reason:          'admin_credit',
      sourceBookingId: 'booking-1',
    })
  })

  test('batch.update cancels and credits the booking', async () => {
    await POST(makeReq({ ...VALID_BASE, method: 'credit', amountCents: 5000 }))

    expect(mockBatchUpdate).toHaveBeenCalledOnce()
    const [, updateData] = mockBatchUpdate.mock.calls[0]
    expect(updateData).toEqual({ status: 'cancelled', paymentStatus: 'credited' })
  })

  test('falls back to DEFAULT_CANCELLATION_POLICY.creditValidityDays when business has none', async () => {
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({}) })
    const res = await POST(makeReq({ ...VALID_BASE, method: 'credit', amountCents: 5000 }))
    expect(res.status).toBe(200)
    expect(mockBatchCommit).toHaveBeenCalledOnce()
  })
})

// ─── method: "refund" tests ───────────────────────────────────────────────────

describe('POST /api/refund — method: "refund"', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'admin-1' })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['test-biz'] }) })
    mockBookingUpdate.mockResolvedValue(undefined)
  })

  test('returns 422 if booking has no gateway_session_id', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => makeBookingData({ gateway_session_id: undefined }),
    })
    const res = await POST(makeReq({ ...VALID_BASE, method: 'refund' }))
    expect(res.status).toBe(422)
  })

  test('calls gateway.issueRefund with correct params', async () => {
    const mockIssueRefund = vi.fn().mockResolvedValue({ refundId: 'ref-1', status: 'succeeded' })
    mockCreateGateway.mockReturnValue({ issueRefund: mockIssueRefund })
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => makeBookingData({ gateway_session_id: 'session-abc' }),
    })

    await POST(makeReq({ ...VALID_BASE, method: 'refund', amountCents: 5000 }))

    expect(mockIssueRefund).toHaveBeenCalledOnce()
    expect(mockIssueRefund).toHaveBeenCalledWith({
      sessionId:   'session-abc',
      amountCents: 5000,
      reason:      'Admin-initiated refund',
    })
  })

  test('on gateway "succeeded": updates booking with paymentStatus "refunded" and returns { ok: true }', async () => {
    mockCreateGateway.mockReturnValue({
      issueRefund: vi.fn().mockResolvedValue({ refundId: 'ref-1', status: 'succeeded' }),
    })
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => makeBookingData({ gateway_session_id: 'session-abc' }),
    })

    const res = await POST(makeReq({ ...VALID_BASE, method: 'refund' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true })

    expect(mockBookingUpdate).toHaveBeenCalledOnce()
    const [updateData] = mockBookingUpdate.mock.calls[0]
    expect(updateData).toMatchObject({ paymentStatus: 'refunded', payment_status_v2: 'refunded' })
  })

  test('on gateway "pending": updates booking with paymentStatus "refund_pending"', async () => {
    mockCreateGateway.mockReturnValue({
      issueRefund: vi.fn().mockResolvedValue({ refundId: 'ref-2', status: 'pending' }),
    })
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => makeBookingData({ gateway_session_id: 'session-abc' }),
    })

    const res = await POST(makeReq({ ...VALID_BASE, method: 'refund' }))
    expect(res.status).toBe(200)

    expect(mockBookingUpdate).toHaveBeenCalledOnce()
    const [updateData] = mockBookingUpdate.mock.calls[0]
    expect(updateData).toMatchObject({ paymentStatus: 'refund_pending', payment_status_v2: 'refund_pending' })
  })

  test('on gateway "failed": returns 502', async () => {
    mockCreateGateway.mockReturnValue({
      issueRefund: vi.fn().mockResolvedValue({ refundId: 'ref-3', status: 'failed' }),
    })
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => makeBookingData({ gateway_session_id: 'session-abc' }),
    })

    const res = await POST(makeReq({ ...VALID_BASE, method: 'refund' }))
    expect(res.status).toBe(502)
  })

  test('on gateway throw: returns 502', async () => {
    mockCreateGateway.mockReturnValue({
      issueRefund: vi.fn().mockRejectedValue(new Error('Gateway unreachable')),
    })
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => makeBookingData({ gateway_session_id: 'session-abc' }),
    })

    const res = await POST(makeReq({ ...VALID_BASE, method: 'refund' }))
    expect(res.status).toBe(502)
  })
})
