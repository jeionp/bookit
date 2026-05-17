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
            where: () => ({
              where: () => ({ get: mockBookingsGet }),
            }),
          }),
        }
      }
      return {}
    },
  },
}))

import { GET } from './route'

function makeReq(params: Record<string, string>, token = 'valid-token'): NextRequest {
  const url = new URL('http://localhost/api/admin/revenue')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function makeBookingDoc(data: Record<string, unknown>, id = 'b1') {
  return { id, data: () => data }
}

const DEFAULT_PARAMS = { slug: 'biz-slug', from: '2026-05-01', to: '2026-05-31' }

beforeEach(() => {
  vi.resetAllMocks()
  mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid' })
  mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['biz-slug'] }) })
  mockBookingsGet.mockResolvedValue({ docs: [] })
})

describe('GET /api/admin/revenue', () => {
  // ── Auth ──────────────────────────────────────────────────────────────────

  test('returns 401 when Authorization header is absent', async () => {
    const req = new NextRequest('http://localhost/api/admin/revenue')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  test('returns 401 when token is not a Bearer token', async () => {
    const req = new NextRequest('http://localhost/api/admin/revenue', {
      headers: { Authorization: 'Basic abc123' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  test('returns 401 when verifyIdToken throws', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('invalid token'))
    const res = await GET(makeReq(DEFAULT_PARAMS))
    expect(res.status).toBe(401)
  })

  // ── Missing query params ──────────────────────────────────────────────────

  test('returns 400 when slug is missing', async () => {
    const res = await GET(makeReq({ from: '2026-05-01', to: '2026-05-31' }))
    expect(res.status).toBe(400)
  })

  test('returns 400 when from is missing', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', to: '2026-05-31' }))
    expect(res.status).toBe(400)
  })

  test('returns 400 when to is missing', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', from: '2026-05-01' }))
    expect(res.status).toBe(400)
  })

  // ── Date format validation ────────────────────────────────────────────────

  test('returns 400 when from is not YYYY-MM-DD format', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', from: '05/01/2026', to: '2026-05-31' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('YYYY-MM-DD') })
  })

  test('returns 400 when to is not YYYY-MM-DD format', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', from: '2026-05-01', to: 'May 31' }))
    expect(res.status).toBe(400)
  })

  test('returns 400 when from is after to', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', from: '2026-05-31', to: '2026-05-01' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('from') })
  })

  // from === to is valid (single day range)
  test('returns 200 when from equals to', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', from: '2026-05-01', to: '2026-05-01' }))
    expect(res.status).toBe(200)
  })

  // ── RBAC ──────────────────────────────────────────────────────────────────

  test('returns 403 when caller is not an admin of the slug', async () => {
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['other-biz'] }) })
    const res = await GET(makeReq(DEFAULT_PARAMS))
    expect(res.status).toBe(403)
  })

  test('returns 403 when admin document does not exist', async () => {
    mockAdminGet.mockResolvedValue({ exists: false, data: () => null })
    const res = await GET(makeReq(DEFAULT_PARAMS))
    expect(res.status).toBe(403)
  })

  test('returns 403 when slugs array is empty', async () => {
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: [] }) })
    const res = await GET(makeReq(DEFAULT_PARAMS))
    expect(res.status).toBe(403)
  })

  // ── Empty result ──────────────────────────────────────────────────────────

  test('returns totals with all zeros and default currency PHP when no bookings', async () => {
    const res = await GET(makeReq(DEFAULT_PARAMS))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totals.P2P_AI).toEqual({ count: 0, revenue: 0 })
    expect(body.totals.PAY_AT_VENUE).toEqual({ count: 0, revenue: 0 })
    expect(body.totals.GATEWAY_SPLIT).toEqual({ count: 0, revenue: 0 })
    expect(body.totals.instant).toEqual({ count: 0, revenue: 0 })
    expect(body.grand).toEqual({ count: 0, revenue: 0 })
    expect(body.currency).toBe('PHP')
  })

  // ── Revenue counting — legacy instant ─────────────────────────────────────

  test('counts confirmed booking with no checkout_type as instant revenue', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({ status: 'confirmed', totalPrice: 300, currency: 'PHP' }),
      ],
    })
    const res = await GET(makeReq(DEFAULT_PARAMS))
    const body = await res.json()
    expect(body.totals.instant).toEqual({ count: 1, revenue: 300 })
    expect(body.grand).toEqual({ count: 1, revenue: 300 })
  })

  test('does NOT count pending booking with no checkout_type as revenue', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({ status: 'pending', totalPrice: 300, currency: 'PHP' }),
      ],
    })
    const res = await GET(makeReq(DEFAULT_PARAMS))
    const body = await res.json()
    expect(body.totals.instant).toEqual({ count: 0, revenue: 0 })
  })

  test('does NOT count cancelled legacy booking as revenue', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({ status: 'cancelled', totalPrice: 500 }),
      ],
    })
    const body = await (await GET(makeReq(DEFAULT_PARAMS))).json()
    expect(body.grand).toEqual({ count: 0, revenue: 0 })
  })

  // ── Revenue counting — P2P_AI ─────────────────────────────────────────────

  test('counts P2P_AI booking with payment_status_v2=paid as revenue', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({
          checkout_type: 'P2P_AI',
          payment_status_v2: 'paid',
          status: 'confirmed',
          totalPrice: 500,
          currency: 'PHP',
        }),
      ],
    })
    const res = await GET(makeReq(DEFAULT_PARAMS))
    const body = await res.json()
    expect(body.totals.P2P_AI).toEqual({ count: 1, revenue: 500 })
  })

  test('does NOT count P2P_AI booking with payment_status_v2=ai_review', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({
          checkout_type: 'P2P_AI',
          payment_status_v2: 'ai_review',
          status: 'slot_held',
          totalPrice: 500,
        }),
      ],
    })
    const body = await (await GET(makeReq(DEFAULT_PARAMS))).json()
    expect(body.totals.P2P_AI).toEqual({ count: 0, revenue: 0 })
  })

  test('does NOT count P2P_AI booking with payment_status_v2=rejected', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({
          checkout_type: 'P2P_AI',
          payment_status_v2: 'rejected',
          status: 'slot_held',
          totalPrice: 500,
        }),
      ],
    })
    const body = await (await GET(makeReq(DEFAULT_PARAMS))).json()
    expect(body.grand).toEqual({ count: 0, revenue: 0 })
  })

  // ── Revenue counting — PAY_AT_VENUE ───────────────────────────────────────

  test('counts PAY_AT_VENUE booking with payment_status_v2=paid as revenue', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({
          checkout_type: 'PAY_AT_VENUE',
          payment_status_v2: 'paid',
          totalPrice: 250,
          currency: 'PHP',
        }),
      ],
    })
    const body = await (await GET(makeReq(DEFAULT_PARAMS))).json()
    expect(body.totals.PAY_AT_VENUE).toEqual({ count: 1, revenue: 250 })
  })

  test('does NOT count PAY_AT_VENUE booking with pending_cash status', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({
          checkout_type: 'PAY_AT_VENUE',
          payment_status_v2: 'pending_cash',
          totalPrice: 250,
        }),
      ],
    })
    const body = await (await GET(makeReq(DEFAULT_PARAMS))).json()
    expect(body.totals.PAY_AT_VENUE).toEqual({ count: 0, revenue: 0 })
  })

  // ── Revenue counting — GATEWAY_SPLIT ──────────────────────────────────────

  test('counts GATEWAY_SPLIT booking with payment_status_v2=paid as revenue', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({
          checkout_type: 'GATEWAY_SPLIT',
          payment_status_v2: 'paid',
          totalPrice: 800,
        }),
      ],
    })
    const body = await (await GET(makeReq(DEFAULT_PARAMS))).json()
    expect(body.totals.GATEWAY_SPLIT).toEqual({ count: 1, revenue: 800 })
  })

  // ── Multiple bookings, mixed types ────────────────────────────────────────

  test('aggregates revenue across multiple paid bookings of different types', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({ status: 'confirmed', totalPrice: 200, currency: 'PHP' }, 'b1'),
        makeBookingDoc({ checkout_type: 'P2P_AI', payment_status_v2: 'paid', totalPrice: 500 }, 'b2'),
        makeBookingDoc({ checkout_type: 'PAY_AT_VENUE', payment_status_v2: 'paid', totalPrice: 300 }, 'b3'),
        makeBookingDoc({ checkout_type: 'P2P_AI', payment_status_v2: 'ai_review', totalPrice: 999 }, 'b4'),
      ],
    })
    const body = await (await GET(makeReq(DEFAULT_PARAMS))).json()
    expect(body.totals.instant).toEqual({ count: 1, revenue: 200 })
    expect(body.totals.P2P_AI).toEqual({ count: 1, revenue: 500 })
    expect(body.totals.PAY_AT_VENUE).toEqual({ count: 1, revenue: 300 })
    expect(body.grand).toEqual({ count: 3, revenue: 1000 })
  })

  // ── Currency ──────────────────────────────────────────────────────────────

  test('returns currency from booking data', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({ status: 'confirmed', totalPrice: 100, currency: 'USD' }),
      ],
    })
    const body = await (await GET(makeReq(DEFAULT_PARAMS))).json()
    expect(body.currency).toBe('USD')
  })

  test('defaults to PHP when no booking has a currency field', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({ status: 'confirmed', totalPrice: 100 }),
      ],
    })
    const body = await (await GET(makeReq(DEFAULT_PARAMS))).json()
    expect(body.currency).toBe('PHP')
  })

  // ── Unknown checkout_type ─────────────────────────────────────────────────

  test('groups unknown checkout_type under instant bucket', async () => {
    mockBookingsGet.mockResolvedValue({
      docs: [
        makeBookingDoc({
          checkout_type: 'FUTURE_TYPE',
          payment_status_v2: 'paid',
          totalPrice: 400,
        }),
      ],
    })
    const body = await (await GET(makeReq(DEFAULT_PARAMS))).json()
    // Unknown types fall back to 'instant' bucket per route logic
    expect(body.totals.instant).toEqual({ count: 1, revenue: 400 })
  })

  // ── Response shape ────────────────────────────────────────────────────────

  test('response always contains totals, grand, and currency keys', async () => {
    const body = await (await GET(makeReq(DEFAULT_PARAMS))).json()
    expect(body).toHaveProperty('totals')
    expect(body).toHaveProperty('grand')
    expect(body).toHaveProperty('currency')
    expect(body.totals).toHaveProperty('P2P_AI')
    expect(body.totals).toHaveProperty('PAY_AT_VENUE')
    expect(body.totals).toHaveProperty('GATEWAY_SPLIT')
    expect(body.totals).toHaveProperty('instant')
  })
})
