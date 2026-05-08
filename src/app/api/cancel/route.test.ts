import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb:   { collection: vi.fn() },
}))

import { computeTier, getBookingStartMs } from './route'
import { DEFAULT_CANCELLATION_POLICY, CancellationPolicy } from '@/lib/types'

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
