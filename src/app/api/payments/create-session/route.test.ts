import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockVerifyIdToken,
  mockBookingGet,
  mockBookingUpdate,
  mockCreateSession,
} = vi.hoisted(() => ({
  mockVerifyIdToken:  vi.fn(),
  mockBookingGet:     vi.fn(),
  mockBookingUpdate:  vi.fn(),
  mockCreateSession:  vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: () => ({
      doc: () => ({
        get:    mockBookingGet,
        update: mockBookingUpdate,
      }),
    }),
  },
}))

vi.mock('@/lib/payments/gateway', () => ({
  createGateway: () => ({ createSession: mockCreateSession }),
}))

function makeReq(body: unknown, token: string | null = 'valid-token'): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  headers.set('host', 'localhost:3000')
  return new NextRequest('http://localhost/api/payments/create-session', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const GATEWAY_BOOKING = {
  userId:             'user-1',
  businessSlug:       'paddleup',
  businessName:       'PaddleUp Ortigas',
  facilityName:       'Court A',
  date:               '2026-05-18',
  totalPrice:         800,
  currency:           'PHP',
  checkout_type:      'GATEWAY_SPLIT',
  payment_status_v2:  'pending_gateway',
}

const STUB_SESSION = {
  sessionId:   'stub_booking-1_1234567890',
  checkoutUrl: '/pay/stub?bookingId=booking-1&sessionId=stub_booking-1_1234567890',
  expiresAt:   new Date(Date.now() + 86400000),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' })
  mockBookingGet.mockResolvedValue({ exists: true, data: () => GATEWAY_BOOKING })
  mockBookingUpdate.mockResolvedValue(undefined)
  mockCreateSession.mockResolvedValue(STUB_SESSION)
})

import { POST } from './route'

describe('POST /api/payments/create-session', () => {
  test('401 — no token', async () => {
    const res = await POST(makeReq({ bookingId: 'booking-1' }, null))
    expect(res.status).toBe(401)
  })

  test('401 — invalid token', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad token'))
    const res = await POST(makeReq({ bookingId: 'booking-1' }))
    expect(res.status).toBe(401)
  })

  test('400 — missing bookingId', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  test('400 — empty bookingId', async () => {
    const res = await POST(makeReq({ bookingId: '   ' }))
    expect(res.status).toBe(400)
  })

  test('404 — booking not found', async () => {
    mockBookingGet.mockResolvedValue({ exists: false, data: () => undefined })
    const res = await POST(makeReq({ bookingId: 'missing' }))
    expect(res.status).toBe(404)
  })

  test('403 — not the booking owner', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...GATEWAY_BOOKING, userId: 'other-user' }),
    })
    const res = await POST(makeReq({ bookingId: 'booking-1' }))
    expect(res.status).toBe(403)
  })

  test('400 — not a gateway booking', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...GATEWAY_BOOKING, checkout_type: 'P2P_AI' }),
    })
    const res = await POST(makeReq({ bookingId: 'booking-1' }))
    expect(res.status).toBe(400)
  })

  test('409 — not in pending_gateway state', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...GATEWAY_BOOKING, payment_status_v2: 'paid' }),
    })
    const res = await POST(makeReq({ bookingId: 'booking-1' }))
    expect(res.status).toBe(409)
  })

  test('200 — returns checkoutUrl and sessionId', async () => {
    const res = await POST(makeReq({ bookingId: 'booking-1' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { checkoutUrl: string; sessionId: string }
    expect(body.checkoutUrl).toContain('/pay/stub')
    expect(body.sessionId).toBe(STUB_SESSION.sessionId)
  })

  test('200 — stores gateway_session_id on booking', async () => {
    await POST(makeReq({ bookingId: 'booking-1' }))
    expect(mockBookingUpdate).toHaveBeenCalledWith({
      gateway_session_id: STUB_SESSION.sessionId,
    })
  })

  test('502 — gateway error', async () => {
    mockCreateSession.mockRejectedValue(new Error('gateway down'))
    const res = await POST(makeReq({ bookingId: 'booking-1' }))
    expect(res.status).toBe(502)
  })

  test('successUrl and cancelUrl include businessSlug', async () => {
    await POST(makeReq({ bookingId: 'booking-1' }))
    const call = mockCreateSession.mock.calls[0][0] as { successUrl: string; cancelUrl: string }
    expect(call.successUrl).toContain('/paddleup')
    expect(call.cancelUrl).toContain('/paddleup')
    expect(call.successUrl).toContain('payment=success')
    expect(call.cancelUrl).toContain('payment=cancelled')
  })
})
