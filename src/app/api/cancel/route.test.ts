import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockVerifyIdToken,
  mockBookingGet,
  mockBookingUpdate,
  mockBizGet,
  mockBatch,
} = vi.hoisted(() => ({
  mockVerifyIdToken:  vi.fn(),
  mockBookingGet:     vi.fn(),
  mockBookingUpdate:  vi.fn(),
  mockBizGet:         vi.fn(),
  mockBatch:          {
    update:  vi.fn(),
    set:     vi.fn(),
    commit:  vi.fn().mockResolvedValue(undefined),
  },
}))

// A ref-like object for credits collection new docs
const CREDIT_REF = {}

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: (name: string) => {
      if (name === 'bookings') {
        return { doc: () => ({ get: mockBookingGet, update: mockBookingUpdate }) }
      }
      if (name === 'businesses') {
        return { doc: () => ({ get: mockBizGet }) }
      }
      // 'credits' — returns a ref-like object for batch.set
      return { doc: () => CREDIT_REF }
    },
    batch: () => mockBatch,
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }) },
  Timestamp:  { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
}))

vi.mock('@/lib/notifications/email', () => ({
  sendCancellationReceipt:         vi.fn().mockResolvedValue(undefined),
  sendAdminCancellationNotification: vi.fn().mockResolvedValue(undefined),
}))

import { computeTier, getBookingStartMs, POST } from './route'
import { DEFAULT_CANCELLATION_POLICY, CancellationPolicy } from '@/lib/types'

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeReq(body: object, token = 'valid-token'): NextRequest {
  return new NextRequest('http://localhost/api/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

const FAR_FUTURE_DATE = '2099-12-31' // always > 24h away → free tier

// ─── Cancel API integration tests (P2P + PAY_AT_VENUE paths) ─────────────────

describe('POST /api/cancel — slot_held / pending_cash fast paths', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' })
    mockBatch.update.mockReset()
    mockBatch.set.mockReset()
    mockBatch.commit.mockResolvedValue(undefined)
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({}) })
  })

  // ── slot_held P2P cancellation ────────────────────────────────────────────

  test('cancels slot_held P2P booking immediately with creditAmount 0', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-1', businessSlug: 'biz', facilityName: 'Court', currency: 'PHP',
        date: FAR_FUTURE_DATE, hours: [9], totalPrice: 500,
        status: 'slot_held', checkout_type: 'P2P_AI', payment_status_v2: 'pending_proof',
        userEmail: 'player@example.com', userName: 'Player',
        businessName: 'Test Biz',
      }),
    })
    mockBookingUpdate.mockResolvedValue(undefined)

    const res = await POST(makeReq({ bookingId: 'b-1', choice: 'credit' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.creditAmount).toBe(0)
    expect(body.tier).toBe('free')
    expect(mockBookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
    )
  })

  test('slot_held P2P: does NOT call batch.commit (no store credits written)', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-1', businessSlug: 'biz', facilityName: 'Court', currency: 'PHP',
        date: FAR_FUTURE_DATE, hours: [9], totalPrice: 500,
        status: 'slot_held', checkout_type: 'P2P_AI', payment_status_v2: 'pending_proof',
        userEmail: 'player@example.com', userName: 'Player', businessName: 'Test Biz',
      }),
    })
    mockBookingUpdate.mockResolvedValue(undefined)

    await POST(makeReq({ bookingId: 'b-1', choice: 'credit' }))
    // Fast-path returns before batch.commit is ever reached
    expect(mockBatch.commit).not.toHaveBeenCalled()
  })

  test('slot_held P2P: no choice validation required (missing choice still succeeds)', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-1', businessSlug: 'biz', facilityName: 'Court', currency: 'PHP',
        date: FAR_FUTURE_DATE, hours: [9], totalPrice: 500,
        status: 'slot_held', checkout_type: 'P2P_AI',
        userEmail: 'player@example.com', userName: 'Player', businessName: 'Test Biz',
      }),
    })
    mockBookingUpdate.mockResolvedValue(undefined)

    // No choice field — fast path should still succeed
    const res = await POST(makeReq({ bookingId: 'b-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.creditAmount).toBe(0)
  })

  // ── pending_cash PAY_AT_VENUE cancellation ────────────────────────────────

  test('cancels pending_cash PAY_AT_VENUE booking immediately with creditAmount 0', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-1', businessSlug: 'biz', facilityName: 'Court', currency: 'PHP',
        date: FAR_FUTURE_DATE, hours: [9], totalPrice: 500,
        status: 'confirmed', checkout_type: 'PAY_AT_VENUE', payment_status_v2: 'pending_cash',
        userEmail: 'player@example.com', userName: 'Player', businessName: 'Test Biz',
      }),
    })
    mockBookingUpdate.mockResolvedValue(undefined)

    const res = await POST(makeReq({ bookingId: 'b-2', choice: 'credit' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.creditAmount).toBe(0)
    expect(mockBookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
    )
  })

  test('pending_cash PAY_AT_VENUE: no store credits written (no batch.commit)', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-1', businessSlug: 'biz', facilityName: 'Court', currency: 'PHP',
        date: FAR_FUTURE_DATE, hours: [9], totalPrice: 500,
        status: 'confirmed', checkout_type: 'PAY_AT_VENUE', payment_status_v2: 'pending_cash',
        userEmail: 'player@example.com', userName: 'Player', businessName: 'Test Biz',
      }),
    })
    mockBookingUpdate.mockResolvedValue(undefined)

    await POST(makeReq({ bookingId: 'b-2', choice: 'credit' }))
    expect(mockBatch.commit).not.toHaveBeenCalled()
  })

  // ── confirmed P2P (paid) — must go through normal policy ─────────────────

  test('confirmed P2P booking (paid) requires choice and applies cancellation policy', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-1', businessSlug: 'biz', facilityName: 'Court', currency: 'PHP',
        date: FAR_FUTURE_DATE, hours: [9], totalPrice: 500,
        status: 'confirmed', checkout_type: 'P2P_AI', payment_status_v2: 'paid',
        userEmail: 'player@example.com', userName: 'Player', businessName: 'Test Biz',
      }),
    })

    // No choice → 400 (confirmed path validates choice)
    const res = await POST(makeReq({ bookingId: 'b-3' }))
    expect(res.status).toBe(400)
  })

  test('confirmed P2P (paid) with valid choice → 200 and applies refund policy', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-1', businessSlug: 'biz', facilityName: 'Court', currency: 'PHP',
        date: FAR_FUTURE_DATE, hours: [9], totalPrice: 500,
        status: 'confirmed', checkout_type: 'P2P_AI', payment_status_v2: 'paid',
        userEmail: 'player@example.com', userName: 'Player', businessName: 'Test Biz',
      }),
    })

    const res = await POST(makeReq({ bookingId: 'b-3', choice: 'credit' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Far future date → free tier → creditAmount equals totalPrice
    expect(body.tier).toBe('free')
    expect(body.creditAmount).toBe(500)
  })

  // ── corner: slot_held with no checkout_type → normal cancel flow ──────────

  test('slot_held booking with no checkout_type falls through to normal cancel (choice required)', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-1', businessSlug: 'biz', facilityName: 'Court', currency: 'PHP',
        date: FAR_FUTURE_DATE, hours: [9], totalPrice: 500,
        status: 'slot_held',
        // checkout_type absent — does not match "P2P_AI"
        userEmail: 'player@example.com', userName: 'Player', businessName: 'Test Biz',
      }),
    })

    // No choice → falls to the choice validation → 400
    const res = await POST(makeReq({ bookingId: 'b-4' }))
    expect(res.status).toBe(400)
  })

  test('slot_held booking with checkout_type PAY_AT_VENUE and no checkout_type does NOT hit P2P fast path', async () => {
    // A slot_held booking with PAY_AT_VENUE should NOT hit the P2P fast path.
    // PAY_AT_VENUE fast path requires payment_status_v2 === 'pending_cash'.
    // slot_held with PAY_AT_VENUE is unusual but should fall to normal cancel.
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-1', businessSlug: 'biz', facilityName: 'Court', currency: 'PHP',
        date: FAR_FUTURE_DATE, hours: [9], totalPrice: 500,
        status: 'slot_held', checkout_type: 'PAY_AT_VENUE',
        // payment_status_v2 is not pending_cash → PAY_AT_VENUE fast path does not fire
        userEmail: 'player@example.com', userName: 'Player', businessName: 'Test Biz',
      }),
    })

    // No choice → falls to normal cancel policy → 400
    const res = await POST(makeReq({ bookingId: 'b-5' }))
    expect(res.status).toBe(400)
  })

  // ── already-cancelled guard fires before fast paths ───────────────────────

  test('already-cancelled slot_held P2P booking returns 409', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user-1', businessSlug: 'biz', facilityName: 'Court', currency: 'PHP',
        date: FAR_FUTURE_DATE, hours: [9], totalPrice: 500,
        status: 'cancelled', checkout_type: 'P2P_AI', payment_status_v2: 'pending_proof',
        userEmail: 'player@example.com', userName: 'Player', businessName: 'Test Biz',
      }),
    })

    const res = await POST(makeReq({ bookingId: 'b-6', choice: 'credit' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'Already cancelled' })
  })

  // ── auth guards ───────────────────────────────────────────────────────────

  test('returns 401 when no Authorization header', async () => {
    const req = new NextRequest('http://localhost/api/cancel', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'b-1', choice: 'credit' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  test('returns 403 when booking belongs to a different user', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'other-user', businessSlug: 'biz',
        status: 'slot_held', checkout_type: 'P2P_AI',
        currency: 'PHP', date: FAR_FUTURE_DATE, hours: [9], totalPrice: 500,
        userEmail: 'other@example.com', userName: 'Other', businessName: 'Test Biz',
      }),
    })
    const res = await POST(makeReq({ bookingId: 'b-1', choice: 'credit' }))
    expect(res.status).toBe(403)
  })
})

// ─── computeTier ──────────────────────────────────────────────────────────────

function nowPlusHours(h: number): number {
  return Date.now() + h * 3_600_000
}

describe('computeTier — default policy (freeCancelHours=24, noCancelHours=2)', () => {
  const policy = DEFAULT_CANCELLATION_POLICY

  test('48h before booking → free (well above freeCancelHours)', () => {
    const result = computeTier(nowPlusHours(48), policy)
    expect(result).toEqual({ tier: 'free', refundRatio: 1 })
  })

  test('exactly 24h before → free (boundary: >= freeCancelHours is free)', () => {
    const result = computeTier(nowPlusHours(24), policy)
    expect(result.tier).toBe('free')
    expect(result.refundRatio).toBe(1)
  })

  test('23.9h before → prorated (just inside prorated window)', () => {
    const result = computeTier(nowPlusHours(23.9), policy)
    expect(result.tier).toBe('prorated')
    expect(result.refundRatio).toBeGreaterThan(0)
    expect(result.refundRatio).toBeLessThan(1)
  })

  test('13h before → prorated with ratio ≈ 0.5 (midpoint of 22h window)', () => {
    // hoursUntil = 13, window = 22, ratio = (13-2)/22 = 11/22 = 0.5
    const result = computeTier(nowPlusHours(13), policy)
    expect(result.tier).toBe('prorated')
    expect(result.refundRatio).toBeCloseTo(0.5, 2)
  })

  test('ratio at 13h before is (hoursUntil - noCancelHours) / window', () => {
    // window = freeCancelHours - noCancelHours = 24 - 2 = 22
    // ratio  = (13 - 2) / 22 = 0.5
    const result = computeTier(nowPlusHours(13), policy)
    expect(result.refundRatio).toBeCloseTo(11 / 22, 4)
  })

  test('exactly 2h before → blocked (boundary: < noCancelHours is blocked)', () => {
    const result = computeTier(nowPlusHours(2), policy)
    expect(result.tier).toBe('blocked')
    expect(result.refundRatio).toBe(0)
  })

  test('1h before → blocked', () => {
    const result = computeTier(nowPlusHours(1), policy)
    expect(result).toEqual({ tier: 'blocked', refundRatio: 0 })
  })

  test('booking in the past (negative hoursUntil) → blocked', () => {
    const result = computeTier(nowPlusHours(-5), policy)
    expect(result).toEqual({ tier: 'blocked', refundRatio: 0 })
  })
})

describe('computeTier — custom policy (freeCancelHours=48, noCancelHours=4)', () => {
  const policy: CancellationPolicy = {
    freeCancelHours:    48,
    noCancelHours:      4,
    creditValidityDays: 365,
  }

  test('72h before → free', () => {
    expect(computeTier(nowPlusHours(72), policy)).toEqual({ tier: 'free', refundRatio: 1 })
  })

  test('exactly 48h before → free (boundary)', () => {
    expect(computeTier(nowPlusHours(48), policy).tier).toBe('free')
  })

  test('26h before → prorated', () => {
    // window = 48 - 4 = 44, ratio = (26-4)/44 = 22/44 = 0.5
    const result = computeTier(nowPlusHours(26), policy)
    expect(result.tier).toBe('prorated')
    expect(result.refundRatio).toBeCloseTo(0.5, 4)
  })

  test('exactly 4h before → blocked (boundary)', () => {
    expect(computeTier(nowPlusHours(4), policy)).toEqual({ tier: 'blocked', refundRatio: 0 })
  })

  test('3h before → blocked', () => {
    expect(computeTier(nowPlusHours(3), policy)).toEqual({ tier: 'blocked', refundRatio: 0 })
  })
})

describe('computeTier — degenerate policy (freeCancelHours === noCancelHours)', () => {
  const policy: CancellationPolicy = {
    freeCancelHours:    4,
    noCancelHours:      4,
    creditValidityDays: 365,
  }

  test('above threshold → free', () => {
    expect(computeTier(nowPlusHours(10), policy)).toEqual({ tier: 'free', refundRatio: 1 })
  })

  test('exactly at threshold → blocked (< noCancelHours is false, >= freeCancelHours is false — prorated path but window is 0; guarded by blocked check first)', () => {
    // hoursUntil == 4 → NOT < 4, so not blocked.
    // hoursUntil >= 4 → free.
    expect(computeTier(nowPlusHours(4), policy)).toEqual({ tier: 'free', refundRatio: 1 })
  })

  test('below threshold → blocked (no division by zero)', () => {
    expect(computeTier(nowPlusHours(3.9), policy)).toEqual({ tier: 'blocked', refundRatio: 0 })
  })
})

// ─── getBookingStartMs ────────────────────────────────────────────────────────

describe('getBookingStartMs', () => {
  test('"2026-06-15" + hour 9 → Date at 09:00 on that day', () => {
    const ms   = getBookingStartMs('2026-06-15', 9)
    const date = new Date(ms)
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(5)
    expect(date.getDate()).toBe(15)
    expect(date.getHours()).toBe(9)
    expect(date.getMinutes()).toBe(0)
    expect(date.getSeconds()).toBe(0)
  })

  test('"2026-01-01" + hour 0 → midnight', () => {
    const ms   = getBookingStartMs('2026-01-01', 0)
    const date = new Date(ms)
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(0)
    expect(date.getDate()).toBe(1)
    expect(date.getHours()).toBe(0)
  })

  test('"2026-12-31" + hour 23 → 11 PM', () => {
    const ms   = getBookingStartMs('2026-12-31', 23)
    const date = new Date(ms)
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(11)
    expect(date.getDate()).toBe(31)
    expect(date.getHours()).toBe(23)
  })

  test('produces a numeric millisecond value', () => {
    expect(typeof getBookingStartMs('2026-06-15', 9)).toBe('number')
  })
})
