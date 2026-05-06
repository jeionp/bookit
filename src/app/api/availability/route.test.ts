import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}))

// Build a fake query-chain that funnels all .where() calls back to the same
// object and terminates in .get() so we can assert on the resolved snapshot.
const fakeQuery = {
  where: () => fakeQuery,
  get: mockGet,
}

vi.mock('@/lib/firebase/admin-app', () => ({
  adminDb: {
    collection: () => fakeQuery,
  },
}))

import { GET } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/availability')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString())
}

function makeSnap(docs: { id: string; data: () => Record<string, unknown> }[]) {
  return { docs }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/availability', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  // ── Validation ──────────────────────────────────────────────────────────────

  test('returns 400 when businessSlug is missing', async () => {
    const res = await GET(makeReq({ facilityId: 'court-1', date: '2026-05-10' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  test('returns 400 when facilityId is missing', async () => {
    const res = await GET(makeReq({ businessSlug: 'paddleup', date: '2026-05-10' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  test('returns 400 when date is missing', async () => {
    const res = await GET(makeReq({ businessSlug: 'paddleup', facilityId: 'court-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  test('returns 400 when all required params are missing', async () => {
    const res = await GET(makeReq({}))
    expect(res.status).toBe(400)
  })

  // ── Happy-path: no bookings ─────────────────────────────────────────────────

  test('returns { bookedHours: [] } when no confirmed bookings exist', async () => {
    mockGet.mockResolvedValue(makeSnap([]))

    const res = await GET(
      makeReq({ businessSlug: 'paddleup', facilityId: 'court-1', date: '2026-05-10' })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ bookedHours: [] })
  })

  // ── Happy-path: bookings present ────────────────────────────────────────────

  test('returns the correct booked hours from confirmed bookings', async () => {
    mockGet.mockResolvedValue(
      makeSnap([
        { id: 'booking-a', data: () => ({ hours: [8, 9], userId: 'u1', userEmail: 'a@example.com', userName: 'Alice' }) },
        { id: 'booking-b', data: () => ({ hours: [14],   userId: 'u2', userEmail: 'b@example.com', userName: 'Bob' }) },
      ])
    )

    const res = await GET(
      makeReq({ businessSlug: 'paddleup', facilityId: 'court-1', date: '2026-05-10' })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.bookedHours).toEqual(expect.arrayContaining([8, 9, 14]))
    expect(body.bookedHours).toHaveLength(3)
  })

  test('aggregates hours from multiple booking documents', async () => {
    mockGet.mockResolvedValue(
      makeSnap([
        { id: 'bk-1', data: () => ({ hours: [6, 7], userId: 'u1', userEmail: 'x@x.com', userName: 'X' }) },
        { id: 'bk-2', data: () => ({ hours: [8],    userId: 'u2', userEmail: 'y@y.com', userName: 'Y' }) },
        { id: 'bk-3', data: () => ({ hours: [9, 10], userId: 'u3', userEmail: 'z@z.com', userName: 'Z' }) },
      ])
    )

    const res = await GET(
      makeReq({ businessSlug: 'paddleup', facilityId: 'court-1', date: '2026-05-10' })
    )

    const { bookedHours } = await res.json()
    expect(bookedHours.sort((a: number, b: number) => a - b)).toEqual([6, 7, 8, 9, 10])
  })

  // ── excludeBookingId ────────────────────────────────────────────────────────

  test('excludes hours from the booking matching excludeBookingId', async () => {
    mockGet.mockResolvedValue(
      makeSnap([
        { id: 'exclude-me', data: () => ({ hours: [10, 11], userId: 'u1', userEmail: 'a@a.com', userName: 'A' }) },
        { id: 'keep-me',    data: () => ({ hours: [12],     userId: 'u2', userEmail: 'b@b.com', userName: 'B' }) },
      ])
    )

    const res = await GET(
      makeReq({
        businessSlug:    'paddleup',
        facilityId:      'court-1',
        date:            '2026-05-10',
        excludeBookingId: 'exclude-me',
      })
    )

    expect(res.status).toBe(200)
    const { bookedHours } = await res.json()
    expect(bookedHours).toEqual([12])
    expect(bookedHours).not.toContain(10)
    expect(bookedHours).not.toContain(11)
  })

  test('returns all hours when excludeBookingId does not match any document', async () => {
    mockGet.mockResolvedValue(
      makeSnap([
        { id: 'bk-1', data: () => ({ hours: [8, 9], userId: 'u1', userEmail: 'a@a.com', userName: 'A' }) },
      ])
    )

    const res = await GET(
      makeReq({
        businessSlug:    'paddleup',
        facilityId:      'court-1',
        date:            '2026-05-10',
        excludeBookingId: 'no-match',
      })
    )

    const { bookedHours } = await res.json()
    expect(bookedHours).toEqual(expect.arrayContaining([8, 9]))
  })

  // ── No PII in response ──────────────────────────────────────────────────────

  test('response does not contain userId, userEmail, or userName fields', async () => {
    mockGet.mockResolvedValue(
      makeSnap([
        {
          id: 'bk-pii',
          data: () => ({
            hours:     [9],
            userId:    'secret-uid',
            userEmail: 'secret@example.com',
            userName:  'Secret Name',
          }),
        },
      ])
    )

    const res = await GET(
      makeReq({ businessSlug: 'paddleup', facilityId: 'court-1', date: '2026-05-10' })
    )

    const body = await res.json()
    expect(body).not.toHaveProperty('userId')
    expect(body).not.toHaveProperty('userEmail')
    expect(body).not.toHaveProperty('userName')
    // Only the safe field should be present
    expect(Object.keys(body)).toEqual(['bookedHours'])
  })
})
