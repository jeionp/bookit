import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockCreateGateway,
  mockProcessWebhookEvent,
} = vi.hoisted(() => ({
  mockCreateGateway:       vi.fn(),
  mockProcessWebhookEvent: vi.fn(),
}))

vi.mock('@/lib/payments/gateway', () => ({
  createGateway: mockCreateGateway,
}))

vi.mock('@/lib/payments/process-webhook', () => ({
  processWebhookEvent: mockProcessWebhookEvent,
}))

function makeReq(rawBody: string): NextRequest {
  return new NextRequest('http://localhost/api/payments/webhook', {
    method: 'POST',
    body: rawBody,
  })
}

const SUCCEEDED_EVENT = {
  type: 'payment.succeeded',
  sessionId: 'stub_booking-1_123',
  bookingId: 'booking-1',
  amountCents: 80000,
}

function makeGateway(verifyResult: unknown) {
  return {
    verifyWebhook: vi.fn().mockReturnValue(verifyResult),
  }
}

function makeThrowingGateway(error: Error) {
  return {
    verifyWebhook: vi.fn().mockImplementation(() => { throw error }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateGateway.mockReturnValue(makeGateway(SUCCEEDED_EVENT))
  mockProcessWebhookEvent.mockResolvedValue({ ok: true })
})

import { POST } from './route'

describe('POST /api/payments/webhook', () => {
  test('400 — invalid signature (verifyWebhook throws)', async () => {
    mockCreateGateway.mockReturnValue(makeThrowingGateway(new Error('bad sig')))
    const res = await POST(makeReq('bad payload'))
    expect(res.status).toBe(400)
  })

  test('200 — unknown event type (verifyWebhook returns null)', async () => {
    mockCreateGateway.mockReturnValue(makeGateway(null))
    const res = await POST(makeReq('{"type":"some.unknown.event"}'))
    expect(res.status).toBe(200)
    expect(mockProcessWebhookEvent).not.toHaveBeenCalled()
  })

  test('200 — payment.succeeded delegates to processWebhookEvent', async () => {
    const res = await POST(makeReq(JSON.stringify(SUCCEEDED_EVENT)))
    expect(res.status).toBe(200)
    expect(mockProcessWebhookEvent).toHaveBeenCalledWith(SUCCEEDED_EVENT)
  })

  test('200 — payment.failed delegates to processWebhookEvent', async () => {
    const failedEvent = { ...SUCCEEDED_EVENT, type: 'payment.failed' }
    mockCreateGateway.mockReturnValue(makeGateway(failedEvent))
    const res = await POST(makeReq(JSON.stringify(failedEvent)))
    expect(res.status).toBe(200)
    expect(mockProcessWebhookEvent).toHaveBeenCalledWith(failedEvent)
  })

  test('404 — processWebhookEvent returns not found', async () => {
    mockProcessWebhookEvent.mockResolvedValue({ ok: false, error: 'Booking not found', status: 404 })
    const res = await POST(makeReq(JSON.stringify(SUCCEEDED_EVENT)))
    expect(res.status).toBe(404)
  })

  test('500 — processWebhookEvent throws', async () => {
    mockProcessWebhookEvent.mockRejectedValue(new Error('db error'))
    const res = await POST(makeReq(JSON.stringify(SUCCEEDED_EVENT)))
    expect(res.status).toBe(500)
  })
})

describe('StubGateway.verifyWebhook', () => {
  test('returns null for unknown event type', async () => {
    const { StubGateway } = await import('@/lib/payments/gateway/stub')
    const gateway = new StubGateway()
    const result = gateway.verifyWebhook(
      JSON.stringify({ type: 'unknown', sessionId: 's', bookingId: 'b', amountCents: 100 }),
      new Headers(),
    )
    expect(result).toBeNull()
  })

  test('returns null for malformed JSON', async () => {
    const { StubGateway } = await import('@/lib/payments/gateway/stub')
    const gateway = new StubGateway()
    expect(gateway.verifyWebhook('not-json', new Headers())).toBeNull()
  })

  test('returns null when required fields are missing', async () => {
    const { StubGateway } = await import('@/lib/payments/gateway/stub')
    const gateway = new StubGateway()
    const result = gateway.verifyWebhook(
      JSON.stringify({ type: 'payment.succeeded' }),
      new Headers(),
    )
    expect(result).toBeNull()
  })

  test('returns event for valid payment.succeeded payload', async () => {
    const { StubGateway } = await import('@/lib/payments/gateway/stub')
    const gateway = new StubGateway()
    const payload = { type: 'payment.succeeded', sessionId: 'stub_abc', bookingId: 'abc', amountCents: 80000 }
    expect(gateway.verifyWebhook(JSON.stringify(payload), new Headers())).toEqual(payload)
  })

  test('returns event for payment.failed', async () => {
    const { StubGateway } = await import('@/lib/payments/gateway/stub')
    const gateway = new StubGateway()
    const payload = { type: 'payment.failed', sessionId: 'stub_abc', bookingId: 'abc', amountCents: 80000 }
    expect(gateway.verifyWebhook(JSON.stringify(payload), new Headers())).toEqual(payload)
  })
})
