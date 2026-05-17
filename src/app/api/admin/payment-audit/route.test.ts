import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockVerifyIdToken,
  mockAdminGet,
  mockBookingsGet,
} = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockAdminGet: vi.fn(),
  mockBookingsGet: vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: (name: string) => {
      if (name === 'admins') {
        return { doc: () => ({ get: mockAdminGet }) }
      }
      if (name === 'bookings') {
        return {
          where: () => ({
            get: mockBookingsGet,
          }),
        }
      }
      return {}
    },
  },
}))

import { GET } from './route'

function makeReq(params: Record<string, string>, token = 'valid-token'): NextRequest {
  const url = new URL('http://localhost/api/admin/payment-audit')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function makeDoc(data: Record<string, unknown>, id = 'b1') {
  return { id, data: () => data }
}

const BASE_BOOKING = {
  userName: 'Test Player',
  userEmail: 'player@example.com',
  facilityName: 'Court A',
  date: '2026-06-01',
  hours: [9, 10],
  totalPrice: 500,
  currency: 'PHP',
  status: 'slot_held',
  checkout_type: 'P2P_AI',
  payment_status_v2: 'ai_review',
}

beforeEach(() => {
  vi.resetAllMocks()
  mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid' })
  mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['biz-slug'] }) })
  mockBookingsGet.mockResolvedValue({ docs: [] })
})

describe('GET /api/admin/payment-audit', () => {
  // ── Auth ──────────────────────────────────────────────────────────────────

  test('returns 401 when Authorization header is absent', async () => {
    const req = new NextRequest('http://localhost/api/admin/payment-audit')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  test('returns 401 when Authorization header does not start with Bearer', async () => {
    const req = new NextRequest('http://localhost/api/admin/payment-audit', {
      headers: { Authorization: 'Token abc' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  test('returns 401 when verifyIdToken throws', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad token'))
    const res = await GET(makeReq({ slug: 'biz-slug' }))
    expect(res.status).toBe(401)
  })

  // ── Missing params ────────────────────────────────────────────────────────

  test('returns 400 when slug is missing', async () => {
    const res = await GET(makeReq({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'slug is required' })
  })

  // ── Status param validation ───────────────────────────────────────────────

  test.each([
    'pending_proof',
    'ai_review',
    'paid',
    'rejected',
    'pending_cash',
    'pending_gateway',
  ])('accepts valid status value "%s"', async (status) => {
    const res = await GET(makeReq({ slug: 'biz-slug', status }))
    expect(res.status).toBe(200)
  })

  test('returns 400 for invalid status value', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', status: 'nonsense' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid status value' })
  })

  test('returns 400 for status value with extra spaces', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', status: ' paid' }))
    expect(res.status).toBe(400)
  })

  test('returns 200 when status param is absent (all bookings)', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug' }))
    expect(res.status).toBe(200)
  })

  // ── RBAC ──────────────────────────────────────────────────────────────────

  test('returns 403 when caller is not admin of slug', async () => {
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['other'] }) })
    const res = await GET(makeReq({ slug: 'biz-slug' }))
    expect(res.status).toBe(403)
  })

  test('returns 403 when admin document does not exist', async () => {
    mockAdminGet.mockResolvedValue({ exists: false, data: () => null })
    const res = await GET(makeReq({ slug: 'biz-slug' }))
    expect(res.status).toBe(403)
  })

  test('returns 403 when slugs array is empty', async () => {
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: [] }) })
    const res = await GET(makeReq({ slug: 'biz-slug' }))
    expect(res.status).toBe(403)
  })

  // ── Happy path: empty result ──────────────────────────────────────────────

  test('returns empty bookings array when no bookings exist', async () => {
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body).toEqual({ bookings: [] })
  })

  // ── Happy path: booking shape ─────────────────────────────────────────────

  test('returns correct fields for each booking', async () => {
    const createdAt = { toDate: () => new Date('2026-05-17T10:00:00Z') }
    mockBookingsGet.mockResolvedValue({
      docs: [makeDoc({ ...BASE_BOOKING, createdAt })],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    const b = body.bookings[0]
    expect(b.id).toBe('b1')
    expect(b.userName).toBe('Test Player')
    expect(b.userEmail).toBe('player@example.com')
    expect(b.facilityName).toBe('Court A')
    expect(b.date).toBe('2026-06-01')
    expect(b.hours).toEqual([9, 10])
    expect(b.totalPrice).toBe(500)
    expect(b.currency).toBe('PHP')
    expect(b.status).toBe('slot_held')
    expect(b.checkout_type).toBe('P2P_AI')
    expect(b.payment_status_v2).toBe('ai_review')
    expect(b.createdAt).toBe('2026-05-17T10:00:00.000Z')
  })

  test('serializes held_until Timestamp to ISO string', async () => {
    const held_until = { toDate: () => new Date('2026-05-18T08:00:00Z') }
    mockBookingsGet.mockResolvedValue({
      docs: [makeDoc({ ...BASE_BOOKING, held_until })],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.bookings[0].held_until).toBe('2026-05-18T08:00:00.000Z')
  })

  test('returns null for createdAt when Timestamp is absent', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [makeDoc({ ...BASE_BOOKING })],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.bookings[0].createdAt).toBeNull()
  })

  test('returns null for held_until when field is absent', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [makeDoc({ ...BASE_BOOKING })],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.bookings[0].held_until).toBeNull()
  })

  // ── Status filtering ──────────────────────────────────────────────────────

  test('filters bookings by payment_status_v2 when status param is provided', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeDoc({ ...BASE_BOOKING, payment_status_v2: 'ai_review' }, 'b1'),
        makeDoc({ ...BASE_BOOKING, payment_status_v2: 'paid' }, 'b2'),
        makeDoc({ ...BASE_BOOKING, payment_status_v2: 'rejected' }, 'b3'),
      ],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug', status: 'ai_review' }))).json()
    expect(body.bookings).toHaveLength(1)
    expect(body.bookings[0].id).toBe('b1')
  })

  test('returns all bookings when status param is absent', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeDoc({ ...BASE_BOOKING, payment_status_v2: 'ai_review' }, 'b1'),
        makeDoc({ ...BASE_BOOKING, payment_status_v2: 'paid' }, 'b2'),
      ],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.bookings).toHaveLength(2)
  })

  test('returns empty array when no bookings match the status filter', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeDoc({ ...BASE_BOOKING, payment_status_v2: 'paid' }, 'b1'),
      ],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug', status: 'rejected' }))).json()
    expect(body.bookings).toEqual([])
  })

  // ── Sorting ───────────────────────────────────────────────────────────────

  test('sorts bookings by createdAt descending', async () => {
    const older = { toDate: () => new Date('2026-05-10T00:00:00Z') }
    const newer = { toDate: () => new Date('2026-05-17T00:00:00Z') }
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeDoc({ ...BASE_BOOKING, createdAt: older }, 'old'),
        makeDoc({ ...BASE_BOOKING, createdAt: newer }, 'new'),
      ],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.bookings[0].id).toBe('new')
    expect(body.bookings[1].id).toBe('old')
  })

  test('bookings with null createdAt go last in sort', async () => {
    const ts = { toDate: () => new Date('2026-05-17T00:00:00Z') }
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeDoc({ ...BASE_BOOKING }, 'no-date'),
        makeDoc({ ...BASE_BOOKING, createdAt: ts }, 'has-date'),
      ],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.bookings[0].id).toBe('has-date')
    expect(body.bookings[1].id).toBe('no-date')
  })

  // ── Limit param ───────────────────────────────────────────────────────────

  test('defaults to limit 100 when limit param is absent', async () => {
    const docs = Array.from({ length: 150 }, (_, i) =>
      makeDoc({ ...BASE_BOOKING, createdAt: { toDate: () => new Date(`2026-05-${String(i % 28 + 1).padStart(2, '0')}`) } }, `b${i}`),
    )
    mockBookingsGet.mockResolvedValue({ docs })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.bookings).toHaveLength(100)
  })

  test('respects explicit limit param', async () => {
    const docs = Array.from({ length: 50 }, (_, i) => makeDoc({ ...BASE_BOOKING }, `b${i}`))
    mockBookingsGet.mockResolvedValue({ docs })
    const body = await (await GET(makeReq({ slug: 'biz-slug', limit: '10' }))).json()
    expect(body.bookings).toHaveLength(10)
  })

  test('clamps limit to 200 max (falls back to default 100 for out-of-range)', async () => {
    const docs = Array.from({ length: 250 }, (_, i) => makeDoc({ ...BASE_BOOKING }, `b${i}`))
    mockBookingsGet.mockResolvedValue({ docs })
    const body = await (await GET(makeReq({ slug: 'biz-slug', limit: '999' }))).json()
    // 999 is out of range (> 200), so defaults to 100
    expect(body.bookings).toHaveLength(100)
  })

  test('uses default limit 100 when limit is 0 (invalid)', async () => {
    const docs = Array.from({ length: 150 }, (_, i) => makeDoc({ ...BASE_BOOKING }, `b${i}`))
    mockBookingsGet.mockResolvedValue({ docs })
    const body = await (await GET(makeReq({ slug: 'biz-slug', limit: '0' }))).json()
    expect(body.bookings).toHaveLength(100)
  })

  test('uses default limit 100 when limit is not a number', async () => {
    const docs = Array.from({ length: 150 }, (_, i) => makeDoc({ ...BASE_BOOKING }, `b${i}`))
    mockBookingsGet.mockResolvedValue({ docs })
    const body = await (await GET(makeReq({ slug: 'biz-slug', limit: 'abc' }))).json()
    expect(body.bookings).toHaveLength(100)
  })

  test('accepts limit = 1', async () => {
    const docs = Array.from({ length: 5 }, (_, i) => makeDoc({ ...BASE_BOOKING }, `b${i}`))
    mockBookingsGet.mockResolvedValue({ docs })
    const body = await (await GET(makeReq({ slug: 'biz-slug', limit: '1' }))).json()
    expect(body.bookings).toHaveLength(1)
  })

  test('accepts limit = 200', async () => {
    const docs = Array.from({ length: 250 }, (_, i) => makeDoc({ ...BASE_BOOKING }, `b${i}`))
    mockBookingsGet.mockResolvedValue({ docs })
    const body = await (await GET(makeReq({ slug: 'biz-slug', limit: '200' }))).json()
    expect(body.bookings).toHaveLength(200)
  })

  // ── Default field values ──────────────────────────────────────────────────

  test('defaults userName, userEmail, facilityName, date to empty string when absent', async () => {
    mockBookingsGet.mockResolvedValue({ docs: [makeDoc({})] })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    const b = body.bookings[0]
    expect(b.userName).toBe('')
    expect(b.userEmail).toBe('')
    expect(b.facilityName).toBe('')
    expect(b.date).toBe('')
  })

  test('defaults totalPrice to 0 and currency to PHP when absent', async () => {
    mockBookingsGet.mockResolvedValue({ docs: [makeDoc({})] })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    const b = body.bookings[0]
    expect(b.totalPrice).toBe(0)
    expect(b.currency).toBe('PHP')
  })

  test('defaults hours to empty array when absent', async () => {
    mockBookingsGet.mockResolvedValue({ docs: [makeDoc({})] })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.bookings[0].hours).toEqual([])
  })

  test('defaults checkout_type and payment_status_v2 to null when absent', async () => {
    mockBookingsGet.mockResolvedValue({ docs: [makeDoc({})] })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    const b = body.bookings[0]
    expect(b.checkout_type).toBeNull()
    expect(b.payment_status_v2).toBeNull()
  })
})
