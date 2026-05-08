import { describe, test, expect, vi, beforeEach } from 'vitest'

const { mockNow } = vi.hoisted(() => ({ mockNow: vi.fn() }))

vi.mock('firebase/firestore', () => ({
  collection:  vi.fn(),
  query:       vi.fn(),
  where:       vi.fn(),
  orderBy:     vi.fn(),
  getDocs:     vi.fn(),
  Timestamp: {
    now: mockNow,
  },
}))

vi.mock('./client', () => ({ db: {} }))

import { computeBalance, groupBalancesByBusiness } from './credits'
import { Credit } from '@/lib/types'

function ts(ms: number) {
  return { toMillis: () => ms } as import('firebase/firestore').Timestamp
}

const FAR_FUTURE  = Date.now() + 365 * 86_400_000
const FAR_PAST    = Date.now() - 1_000

function issued(amount: number, opts: { expired?: boolean; voided?: boolean } = {}): Credit {
  return {
    id:              'c-' + Math.random(),
    userId:          'user-1',
    businessSlug:    'paddleup',
    businessName:    'PaddleUp',
    amount,
    currency:        'PHP',
    type:            'issued',
    reason:          'cancellation',
    sourceBookingId: 'bk-1',
    expiresAt:       ts(opts.expired ? FAR_PAST : FAR_FUTURE),
    createdAt:       ts(Date.now()),
    ...(opts.voided !== undefined && { voided: opts.voided }),
  }
}

function redeemed(amount: number): Credit {
  return {
    id:                'c-' + Math.random(),
    userId:            'user-1',
    businessSlug:      'paddleup',
    businessName:      'PaddleUp',
    amount,
    currency:          'PHP',
    type:              'redeemed',
    reason:            'cancellation',
    sourceBookingId:   'bk-1',
    redeemedBookingId: 'bk-2',
    expiresAt:         ts(0),
    createdAt:         ts(Date.now()),
  }
}

beforeEach(() => {
  mockNow.mockReturnValue(ts(Date.now()))
})

describe('computeBalance', () => {
  test('empty array returns 0', () => {
    expect(computeBalance([])).toBe(0)
  })

  test('single issued credit not expired returns full amount', () => {
    expect(computeBalance([issued(500)])).toBe(500)
  })

  test('single issued credit that is expired returns 0', () => {
    expect(computeBalance([issued(500, { expired: true })])).toBe(0)
  })

  test('issued minus partial redemption returns remainder', () => {
    expect(computeBalance([issued(500), redeemed(200)])).toBe(300)
  })

  test('issued fully consumed by redemption returns 0', () => {
    expect(computeBalance([issued(500), redeemed(500)])).toBe(0)
  })

  test('redeemed exceeds issued — clamps to 0, never negative', () => {
    expect(computeBalance([issued(100), redeemed(200)])).toBe(0)
  })

  test('voided issued credit is excluded from balance', () => {
    expect(computeBalance([issued(500, { voided: true })])).toBe(0)
  })

  test('mix of voided and active issued — only active counted', () => {
    expect(computeBalance([issued(500, { voided: true }), issued(300)])).toBe(300)
  })

  test('multiple issued — some expired, some voided — correct net', () => {
    const credits = [
      issued(500),
      issued(200, { expired: true }),
      issued(100, { voided: true }),
      redeemed(100),
    ]
    expect(computeBalance(credits)).toBe(400)
  })

  test('redeemed exceeds non-voided issued — returns 0 not negative', () => {
    const credits = [issued(500, { voided: true }), issued(100), redeemed(300)]
    expect(computeBalance(credits)).toBe(0)
  })
})

describe('groupBalancesByBusiness', () => {
  test('credits for two businesses produce separate balance entries', () => {
    const c1: Credit = { ...issued(500), businessSlug: 'paddleup',   businessName: 'PaddleUp' }
    const c2: Credit = { ...issued(300), businessSlug: 'rival-courts', businessName: 'Rival Courts' }
    const result = groupBalancesByBusiness([c1, c2])
    expect(result['paddleup'].balance).toBe(500)
    expect(result['paddleup'].businessName).toBe('PaddleUp')
    expect(result['rival-courts'].balance).toBe(300)
    expect(result['rival-courts'].businessName).toBe('Rival Courts')
  })

  test('only redeemed credits for a business produces balance 0 (issued absent)', () => {
    const c1: Credit = {
      ...redeemed(200),
      businessSlug: 'paddleup',
      businessName: 'PaddleUp',
    }
    const result = groupBalancesByBusiness([c1])
    expect(result['paddleup'].balance).toBe(0)
  })

  test('mix of issued and redeemed at one business and issued-only at another', () => {
    const c1: Credit = { ...issued(1000), businessSlug: 'biz-a', businessName: 'Biz A' }
    const c2: Credit = { ...redeemed(400), businessSlug: 'biz-a', businessName: 'Biz A' }
    const c3: Credit = { ...issued(250), businessSlug: 'biz-b', businessName: 'Biz B' }
    const result = groupBalancesByBusiness([c1, c2, c3])
    expect(result['biz-a'].balance).toBe(600)
    expect(result['biz-b'].balance).toBe(250)
  })

  test('currency is taken from the first credit of that business', () => {
    const c1: Credit = { ...issued(500), businessSlug: 'paddleup', currency: 'PHP' }
    const result = groupBalancesByBusiness([c1])
    expect(result['paddleup'].currency).toBe('PHP')
  })
})
