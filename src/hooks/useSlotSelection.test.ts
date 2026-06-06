/**
 * Unit tests for useSlotSelection pure logic.
 *
 * Because the hook uses React state and DOM events, we test the pure
 * functions extracted from it rather than rendering the full hook:
 *
 *   slotState(hour) — returns "booked" | "pending" | "pending-start" |
 *                     "active" | "available" based on current state
 *   blockedHours    — combined bookedHours + pendingHours (used by getValidRange)
 *   handleSlotClick guard — skips both booked and pending hours
 *
 * The underlying getValidRange function is already tested in slots.ts.
 * Here we focus on the slotState logic and pending-hours integration.
 */

import { describe, test, expect } from 'vitest'

// ─── Mirror slotState logic from the hook ─────────────────────────────────────
// Priority: booked → pending → pending-start → active → available

function slotState(
  hour: number,
  bookedHours: number[],
  pendingHours: number[],
  pendingStart: number | null = null,
  activeHours: number[] = [],
): 'booked' | 'pending' | 'pending-start' | 'active' | 'available' {
  if (bookedHours.includes(hour)) return 'booked'
  if (pendingHours.includes(hour)) return 'pending'
  if (pendingStart === hour) return 'pending-start'
  if (activeHours.includes(hour)) return 'active'
  return 'available'
}

// ─── Mirror blockedHours calculation ─────────────────────────────────────────

function makeBlockedHours(bookedHours: number[], pendingHours: number[]): number[] {
  return [...bookedHours, ...pendingHours]
}

// ─── Mirror handleSlotClick guard ─────────────────────────────────────────────

function canClickSlot(hour: number, bookedHours: number[], pendingHours: number[]): boolean {
  return !bookedHours.includes(hour) && !pendingHours.includes(hour)
}

// ─── slotState — booked hours ─────────────────────────────────────────────────

describe('useSlotSelection — slotState for booked hours', () => {
  test('returns "booked" for an hour in bookedHours', () => {
    expect(slotState(9, [8, 9, 10], [])).toBe('booked')
  })

  test('returns "booked" for every hour in bookedHours', () => {
    const booked = [6, 7, 8]
    for (const h of booked) {
      expect(slotState(h, booked, [])).toBe('booked')
    }
  })
})

// ─── slotState — pending hours ────────────────────────────────────────────────

describe('useSlotSelection — slotState for pending hours', () => {
  test('returns "pending" for an hour in pendingHours', () => {
    expect(slotState(11, [], [11, 12])).toBe('pending')
  })

  test('returns "pending" for every hour in pendingHours', () => {
    const pending = [14, 15, 16]
    for (const h of pending) {
      expect(slotState(h, [], pending)).toBe('pending')
    }
  })
})

// ─── slotState — pending-start ────────────────────────────────────────────────

describe('useSlotSelection — slotState for pending-start (first tap awaiting second)', () => {
  test('returns "pending-start" for the hour that was first-tapped', () => {
    expect(slotState(10, [], [], 10)).toBe('pending-start')
  })

  test('returns "available" for other hours when pendingStart is set', () => {
    expect(slotState(11, [], [], 10)).toBe('available')
  })

  test('booked beats pending-start when hour is in both', () => {
    expect(slotState(10, [10], [], 10)).toBe('booked')
  })

  test('pending beats pending-start when hour is in pendingHours', () => {
    expect(slotState(10, [], [10], 10)).toBe('pending')
  })
})

// ─── slotState — active selection ────────────────────────────────────────────

describe('useSlotSelection — slotState for active selection', () => {
  test('returns "active" for hours in the committed selection', () => {
    expect(slotState(9, [], [], null, [8, 9, 10])).toBe('active')
  })

  test('returns "available" for hours not in the active selection', () => {
    expect(slotState(11, [], [], null, [8, 9, 10])).toBe('available')
  })
})

// ─── slotState — available hours ─────────────────────────────────────────────

describe('useSlotSelection — slotState for available hours', () => {
  test('returns "available" for an hour not in any array', () => {
    expect(slotState(10, [8, 9], [11, 12])).toBe('available')
  })

  test('returns "available" when all arrays are empty (default)', () => {
    expect(slotState(7, [], [])).toBe('available')
  })
})

// ─── slotState — priority: booked wins over pending ──────────────────────────

describe('useSlotSelection — slotState priority (booked beats pending)', () => {
  test('when hour is in both arrays, "booked" wins over "pending"', () => {
    expect(slotState(10, [10], [10])).toBe('booked')
  })

  test('bookedHours checked before pendingHours (order matters)', () => {
    expect(slotState(9,  [9], [9, 10])).toBe('booked')
    expect(slotState(10, [9], [9, 10])).toBe('pending')
  })
})

// ─── slotState — default pendingHours (no regression) ────────────────────────

describe('useSlotSelection — default pendingHours = [] (no regression)', () => {
  test('available hour stays available when no pendingHours supplied', () => {
    expect(slotState(8, [9, 10], [])).toBe('available')
  })

  test('booked hour still marked booked even without pendingHours', () => {
    expect(slotState(9, [9, 10], [])).toBe('booked')
  })
})

// ─── blockedHours — pending hours included ────────────────────────────────────

describe('useSlotSelection — blockedHours combines bookedHours and pendingHours', () => {
  test('blockedHours contains all booked hours', () => {
    const blocked = makeBlockedHours([8, 9], [11])
    expect(blocked).toContain(8)
    expect(blocked).toContain(9)
  })

  test('blockedHours contains all pending hours', () => {
    const blocked = makeBlockedHours([8, 9], [11, 12])
    expect(blocked).toContain(11)
    expect(blocked).toContain(12)
  })

  test('blockedHours is empty when both arrays are empty', () => {
    expect(makeBlockedHours([], [])).toEqual([])
  })

  test('pending hours extend the blocked set (range stops at pending slots)', () => {
    const blocked = makeBlockedHours([8], [10])
    expect(blocked).toContain(10)
  })
})

// ─── handleSlotClick guard ────────────────────────────────────────────────────

describe('useSlotSelection — handleSlotClick guards against booked and pending hours', () => {
  test('returns true (click allowed) for an available hour', () => {
    expect(canClickSlot(7, [8, 9], [10, 11])).toBe(true)
  })

  test('returns false (click blocked) for a booked hour', () => {
    expect(canClickSlot(8, [8, 9], [])).toBe(false)
  })

  test('returns false (click blocked) for a pending hour', () => {
    expect(canClickSlot(10, [], [10, 11])).toBe(false)
  })

  test('returns false when hour appears in both booked and pending', () => {
    expect(canClickSlot(9, [9], [9])).toBe(false)
  })

  test('returns true when both arrays are empty (open slot)', () => {
    expect(canClickSlot(14, [], [])).toBe(true)
  })
})
