import { describe, test, expect, beforeEach, afterEach } from 'vitest'

// Each test manipulates process.env directly and restores it in afterEach.
// We import createGateway dynamically so env changes take effect per-call.
import { createGateway } from './index'
import { StubGateway } from './stub'
import { PayMongoGateway } from './paymongo'

const ORIGINAL_ENV = process.env

describe('createGateway — provider selection', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  test('returns StubGateway when PAYMENT_GATEWAY_PROVIDER is undefined (default)', () => {
    delete process.env.PAYMENT_GATEWAY_PROVIDER
    const gw = createGateway()
    expect(gw).toBeInstanceOf(StubGateway)
  })

  test('returns StubGateway when PAYMENT_GATEWAY_PROVIDER is "stub"', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'stub'
    const gw = createGateway()
    expect(gw).toBeInstanceOf(StubGateway)
  })

  test('returns PayMongoGateway when PAYMENT_GATEWAY_PROVIDER is "paymongo" with valid env vars', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER     = 'paymongo'
    process.env.PAYMENT_GATEWAY_SECRET_KEY   = 'sk_test_abc123'
    process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET = 'whsec_xyz789'
    const gw = createGateway()
    expect(gw).toBeInstanceOf(PayMongoGateway)
  })

  test('throws when PAYMENT_GATEWAY_PROVIDER is "paymongo" but keys are missing', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'paymongo'
    delete process.env.PAYMENT_GATEWAY_SECRET_KEY
    delete process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET
    expect(() => createGateway()).toThrow(
      'PAYMENT_GATEWAY_SECRET_KEY and PAYMENT_GATEWAY_WEBHOOK_SECRET are required',
    )
  })

  test('throws with "Unknown PAYMENT_GATEWAY_PROVIDER" for an unrecognised value (S2 regression)', () => {
    process.env.PAYMENT_GATEWAY_PROVIDER = 'typo_value'
    expect(() => createGateway()).toThrow('Unknown PAYMENT_GATEWAY_PROVIDER')
  })
})
