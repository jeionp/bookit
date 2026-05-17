import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockExpireHeldSlots } = vi.hoisted(() => ({
  mockExpireHeldSlots: vi.fn(),
}))

vi.mock('@/lib/payments/expire-slots', () => ({
  expireHeldSlots: mockExpireHeldSlots,
}))

function makeReq(token: string | null = 'test-secret'): NextRequest {
  const headers = new Headers()
  if (token !== null) headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost/api/cron/expire-slots', { headers })
}

import { GET } from './route'

describe('GET /api/cron/expire-slots', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  test('returns 401 when no Authorization header', async () => {
    const res = await GET(makeReq(null))
    expect(res.status).toBe(401)
    expect(mockExpireHeldSlots).not.toHaveBeenCalled()
  })

  test('returns 401 when secret does not match', async () => {
    const res = await GET(makeReq('wrong-secret'))
    expect(res.status).toBe(401)
    expect(mockExpireHeldSlots).not.toHaveBeenCalled()
  })

  test('returns 401 when CRON_SECRET env is not set', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeReq('test-secret'))
    expect(res.status).toBe(401)
  })

  test('returns expired count on success', async () => {
    mockExpireHeldSlots.mockResolvedValue({ expired: 3 })

    const res = await GET(makeReq())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ expired: 3 })
    expect(mockExpireHeldSlots).toHaveBeenCalledOnce()
  })

  test('returns expired: 0 when no slots have passed held_until', async () => {
    mockExpireHeldSlots.mockResolvedValue({ expired: 0 })

    const res = await GET(makeReq())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ expired: 0 })
  })

  test('returns 500 when expireHeldSlots throws', async () => {
    mockExpireHeldSlots.mockRejectedValue(new Error('DB error'))

    const res = await GET(makeReq())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})
