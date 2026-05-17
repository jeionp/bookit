import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockBookingGet,
  mockProcessWebhookEvent,
} = vi.hoisted(() => ({
  mockBookingGet:          vi.fn(),
  mockProcessWebhookEvent: vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mockBookingGet }),
    }),
  },
}))

vi.mock('@/lib/payments/process-webhook', () => ({
  processWebhookEvent: mockProcessWebhookEvent,
}))

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/payments/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const GATEWAY_BOOKING = {
  userId:            'user-1',
  totalPrice:        800,
  gateway_session_id: 'stub_booking-1_123',
  payment_status_v2:  'pending_gateway',
  checkout_type:      'GATEWAY_SPLIT',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PAYMENT_GATEWAY_PROVIDER', 'stub')
  vi.stubEnv('NODE_ENV', 'test')
  mockBookingGet.mockResolvedValue({ exists: true, data: () => GATEWAY_BOOKING })
  mockProcessWebhookEvent.mockResolvedValue({ ok: true })
})

import { POST } from './route'

describe('POST /api/payments/simulate', () => {
  test('404 — non-stub provider', async () => {
    vi.stubEnv('PAYMENT_GATEWAY_PROVIDER', 'paymongo')
    const res = await POST(makeReq({ bookingId: 'booking-1', outcome: 'success' }))
    expect(res.status).toBe(404)
  })

  test('404 — stub but NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await POST(makeReq({ bookingId: 'booking-1', outcome: 'success' }))
    expect(res.status).toBe(404)
  })

  test('400 — missing bookingId', async () => {
    const res = await POST(makeReq({ outcome: 'success' }))
    expect(res.status).toBe(400)
  })

  test('400 — invalid outcome', async () => {
    const res = await POST(makeReq({ bookingId: 'booking-1', outcome: 'maybe' }))
    expect(res.status).toBe(400)
  })

  test('404 — booking not found', async () => {
    mockBookingGet.mockResolvedValue({ exists: false, data: () => undefined })
    const res = await POST(makeReq({ bookingId: 'missing', outcome: 'success' }))
    expect(res.status).toBe(404)
  })

  test('200 — success outcome calls processWebhookEvent with payment.succeeded', async () => {
    const res = await POST(makeReq({ bookingId: 'booking-1', outcome: 'success' }))
    expect(res.status).toBe(200)
    expect(mockProcessWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payment.succeeded', bookingId: 'booking-1' })
    )
  })

  test('200 — failure outcome calls processWebhookEvent with payment.failed', async () => {
    const res = await POST(makeReq({ bookingId: 'booking-1', outcome: 'failure' }))
    expect(res.status).toBe(200)
    expect(mockProcessWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payment.failed', bookingId: 'booking-1' })
    )
  })

  test('200 — amountCents is totalPrice * 100', async () => {
    await POST(makeReq({ bookingId: 'booking-1', outcome: 'success' }))
    const call = mockProcessWebhookEvent.mock.calls[0][0] as { amountCents: number }
    expect(call.amountCents).toBe(80000) // 800 * 100
  })

  test('200 — uses gateway_session_id from booking when present', async () => {
    await POST(makeReq({ bookingId: 'booking-1', outcome: 'success' }))
    const call = mockProcessWebhookEvent.mock.calls[0][0] as { sessionId: string }
    expect(call.sessionId).toBe('stub_booking-1_123')
  })

  test('200 — falls back to stub sessionId when gateway_session_id absent', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...GATEWAY_BOOKING, gateway_session_id: undefined }),
    })
    await POST(makeReq({ bookingId: 'booking-1', outcome: 'success' }))
    const call = mockProcessWebhookEvent.mock.calls[0][0] as { sessionId: string }
    expect(call.sessionId).toBe('stub_booking-1')
  })

  test('500 — processWebhookEvent throws', async () => {
    mockProcessWebhookEvent.mockRejectedValue(new Error('db error'))
    const res = await POST(makeReq({ bookingId: 'booking-1', outcome: 'success' }))
    expect(res.status).toBe(500)
  })
})
