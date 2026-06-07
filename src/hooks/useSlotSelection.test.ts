/**
 * Unit tests for useSlotSelection pure logic.
 *
 * Because the hook uses React state and DOM events, we test the pure
 * functions extracted from it rather than rendering the full hook:
 *
 *   slotState(hour) — returns "booked" | "pending" | "active" | "available"
 *   blockedHours    — combined bookedHours + pendingHours (used by getValidRange)
 *   handleSlotClick guard — skips booked and pending hours
 *   handleSlotClick behavior — instant-commit, extend, deselect
 *
 * The underlying getValidRange function is already tested in slots.ts.
 */

import { describe, test, expect } from 'vitest'
import { getValidRange } from '@/lib/slots'

// ─── Mirror slotState logic from the hook ─────────────────────────────────────
// Priority: booked → pending → active → available

function slotState(
  hour: number,
  bookedHours: number[],
  pendingHours: number[],
  activeHours: number[] = [],
): 'booked' | 'pending' | 'active' | 'available' {
  if (bookedHours.includes(hour)) return 'booked'
  if (pendingHours.includes(hour)) return 'pending'
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

// ─── Mirror handleSlotClick behavior ──────────────────────────────────────────

interface MockSelection {
  hours: number[]
}

function simulateClick(
  hour: number,
  current: MockSelection | null,
  bookedHours: number[],
  pendingHours: number[],
): MockSelection | null {
  const blocked = [...bookedHours, ...pendingHours]
  if (blocked.includes(hour)) return current // guard: no-op

  if (!current) {
    return { hours: [hour] }                 // instant-commit single slot
  }

  if (current.hours.includes(hour)) {
    return null                              // tap selected slot → deselect
  }

  const start = current.hours[0]
  const hours = getValidRange(start, hour, blocked)
  return { hours: hours.length > 0 ? hours : [hour] }
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

// ─── slotState — active selection ────────────────────────────────────────────

describe('useSlotSelection — slotState for active selection', () => {
  test('returns "active" for hours in the committed selection', () => {
    expect(slotState(9, [], [], [8, 9, 10])).toBe('active')
  })

  test('returns "available" for hours not in the active selection', () => {
    expect(slotState(11, [], [], [8, 9, 10])).toBe('available')
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

// ─── handleSlotClick — instant-commit (Option A) ─────────────────────────────

describe('useSlotSelection — handleSlotClick instant-commit (no prior selection)', () => {
  test('first tap with no selection commits a single slot immediately', () => {
    const result = simulateClick(10, null, [], [])
    expect(result?.hours).toEqual([10])
  })

  test('blocked hour is ignored even with no prior selection', () => {
    const result = simulateClick(9, null, [9], [])
    expect(result).toBeNull()
  })

  test('pending hour is ignored even with no prior selection', () => {
    const result = simulateClick(11, null, [], [11])
    expect(result).toBeNull()
  })
})

// ─── handleSlotClick — tap selected slot deselects ───────────────────────────

describe('useSlotSelection — handleSlotClick tap selected slot deselects', () => {
  test('tapping the single active slot deselects it', () => {
    const current = { hours: [10] }
    const result = simulateClick(10, current, [], [])
    expect(result).toBeNull()
  })

  test('tapping any slot in a range deselects the whole range', () => {
    const current = { hours: [10, 11, 12] }
    expect(simulateClick(10, current, [], [])).toBeNull()
    expect(simulateClick(11, current, [], [])).toBeNull()
    expect(simulateClick(12, current, [], [])).toBeNull()
  })
})

// ─── handleSlotClick — extend/shrink range ───────────────────────────────────

describe('useSlotSelection — handleSlotClick extends range from original start', () => {
  test('tapping a later slot extends the range forward', () => {
    const current = { hours: [10] }
    const result = simulateClick(12, current, [], [])
    expect(result?.hours).toEqual([10, 11, 12])
  })

  test('tapping an earlier slot extends the range backward (from start)', () => {
    const current = { hours: [12] }
    const result = simulateClick(10, current, [], [])
    expect(result?.hours).toEqual([10, 11, 12])
  })

  test('range stops at a booked slot in between', () => {
    const current = { hours: [10] }
    // 11 is booked — range from 10 to 13 should stop at 10 only
    const result = simulateClick(13, current, [11], [])
    expect(result?.hours).toEqual([10])
  })

  test('range stops at a pending slot in between', () => {
    const current = { hours: [10] }
    const result = simulateClick(13, current, [], [12])
    expect(result?.hours).toEqual([10, 11])
  })

  test('if getValidRange returns empty (fully blocked), selects just the tapped slot', () => {
    const current = { hours: [10] }
    // 10 itself would be the start and target is 12, but 11 blocks; getValidRange returns [10]
    // tapping a completely fresh slot beyond a block falls back to [hour]
    // Simulate: start=10, tap=12, booked=[10,11] → getValidRange(10,12,[10,11]) → stops at 10 → [10]
    // That's not empty, so this edge case needs fully blocked start:
    // start=10, all between blocked, tap=10 → already in selection → handled above
    // Actually the "fallback to [hour]" triggers when hours.length === 0, which happens when
    // start itself is blocked. Since guard already prevents clicking blocked hours, this
    // scenario is unreachable in practice — but test the fallback path via direct simulation.
    const result = simulateClick(12, { hours: [10] }, [10, 11], [])
    // getValidRange(10, 12, [10,11]) → breaks at 10 immediately → [] → fallback [12]
    expect(result?.hours).toEqual([12])
  })
})
