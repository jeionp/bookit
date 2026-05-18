/**
 * Unit tests for getAllBookingsForDay.
 *
 * Verifies that the Firestore query uses `status in ["confirmed", "slot_held"]`
 * so that pending slot_held bookings appear in the admin schedule view.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockWhere, mockGetDocs } = vi.hoisted(() => ({
  mockWhere:   vi.fn(),
  mockGetDocs: vi.fn(),
}))

// Build a fake query chain that captures .where() arguments.
// We accumulate calls so we can assert on all three where() calls.
const whereCalls: Array<[string, string, unknown]> = []

const fakeQuery = {
  where: (field: string, op: string, value: unknown) => {
    whereCalls.push([field, op, value])
    mockWhere(field, op, value)
    return fakeQuery
  },
}

vi.mock('firebase/firestore', () => ({
  collection:  vi.fn(() => fakeQuery),
  query:       vi.fn((...args: unknown[]) => args[0]),   // returns the first arg (fakeQuery)
  where:       (field: string, op: string, val: unknown) => {
    whereCalls.push([field, op, val])
    mockWhere(field, op, val)
    return fakeQuery
  },
  orderBy:     vi.fn(),
  limit:       vi.fn(),
  getDocs:     mockGetDocs,
  updateDoc:   vi.fn(),
  doc:         vi.fn(),
  Timestamp:   { now: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })) },
  runTransaction: vi.fn(),
}))

vi.mock('./client', () => ({ db: {} }))

import { getAllBookingsForDay } from './bookings'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSnap(docs: { id: string; data: () => Record<string, unknown> }[]) {
  return { docs }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getAllBookingsForDay', () => {
  beforeEach(() => {
    mockGetDocs.mockReset()
    mockWhere.mockReset()
    whereCalls.length = 0
  })

  test('queries with status in ["confirmed", "slot_held"]', async () => {
    mockGetDocs.mockResolvedValue(makeSnap([]))
    await getAllBookingsForDay('paddleup', '2026-05-10')

    // Find the status where() call (field === "status")
    const statusCall = whereCalls.find(([field]) => field === 'status')
    expect(statusCall).toBeDefined()
    expect(statusCall![1]).toBe('in')
    expect(statusCall![2]).toEqual(['confirmed', 'slot_held'])
  })

  test('includes slot_held bookings in the result', async () => {
    mockGetDocs.mockResolvedValue(makeSnap([
      { id: 'bk-held', data: () => ({ status: 'slot_held', hours: [10, 11], userId: 'u1', userEmail: 'a@a.com', userName: 'Alice', businessSlug: 'paddleup', facilityId: 'court-1', date: '2026-05-10', totalPrice: 500, currency: 'PHP', createdAt: { seconds: 0, nanoseconds: 0 } }) },
    ]))

    const bookings = await getAllBookingsForDay('paddleup', '2026-05-10')
    expect(bookings).toHaveLength(1)
    expect(bookings[0].status).toBe('slot_held')
    expect(bookings[0].id).toBe('bk-held')
  })

  test('includes confirmed bookings in the result', async () => {
    mockGetDocs.mockResolvedValue(makeSnap([
      { id: 'bk-confirmed', data: () => ({ status: 'confirmed', hours: [8, 9], userId: 'u2', userEmail: 'b@b.com', userName: 'Bob', businessSlug: 'paddleup', facilityId: 'court-1', date: '2026-05-10', totalPrice: 500, currency: 'PHP', createdAt: { seconds: 0, nanoseconds: 0 } }) },
    ]))

    const bookings = await getAllBookingsForDay('paddleup', '2026-05-10')
    expect(bookings).toHaveLength(1)
    expect(bookings[0].status).toBe('confirmed')
  })

  test('returns both confirmed and slot_held bookings together', async () => {
    mockGetDocs.mockResolvedValue(makeSnap([
      { id: 'bk-1', data: () => ({ status: 'confirmed',  hours: [8],  userId: 'u1', userEmail: 'a@a.com', userName: 'A', businessSlug: 'paddleup', facilityId: 'court-1', date: '2026-05-10', totalPrice: 500, currency: 'PHP', createdAt: { seconds: 0, nanoseconds: 0 } }) },
      { id: 'bk-2', data: () => ({ status: 'slot_held', hours: [10], userId: 'u2', userEmail: 'b@b.com', userName: 'B', businessSlug: 'paddleup', facilityId: 'court-1', date: '2026-05-10', totalPrice: 500, currency: 'PHP', createdAt: { seconds: 0, nanoseconds: 0 } }) },
    ]))

    const bookings = await getAllBookingsForDay('paddleup', '2026-05-10')
    expect(bookings).toHaveLength(2)
    const statuses = bookings.map((b) => b.status)
    expect(statuses).toContain('confirmed')
    expect(statuses).toContain('slot_held')
  })

  test('returns empty array when no bookings exist', async () => {
    mockGetDocs.mockResolvedValue(makeSnap([]))
    const bookings = await getAllBookingsForDay('paddleup', '2026-05-10')
    expect(bookings).toEqual([])
  })

  test('does NOT query with status == "confirmed" only (old behaviour)', async () => {
    mockGetDocs.mockResolvedValue(makeSnap([]))
    await getAllBookingsForDay('paddleup', '2026-05-10')

    // Should not find a "==" operator for status
    const eqStatusCall = whereCalls.find(([field, op]) => field === 'status' && op === '==')
    expect(eqStatusCall).toBeUndefined()
  })
})
