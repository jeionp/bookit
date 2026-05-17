import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const {
  mockBookingGet,
  mockBookingUpdate,
  mockBizGet,
  mockMessagesCreate,
  mockSendBookingConfirmation,
  mockSendAdminBookingNotification,
  mockSendPaymentRejected,
} = vi.hoisted(() => ({
  mockBookingGet:                  vi.fn(),
  mockBookingUpdate:               vi.fn(),
  mockBizGet:                      vi.fn(),
  mockMessagesCreate:              vi.fn(),
  mockSendBookingConfirmation:     vi.fn(),
  mockSendAdminBookingNotification: vi.fn(),
  mockSendPaymentRejected:         vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: () => (name === 'businesses'
        ? { get: mockBizGet }
        : { get: mockBookingGet, update: mockBookingUpdate }
      ),
    }),
  },
}))

vi.mock('@anthropic-ai/sdk', () => ({
  // Use a class so `new Anthropic()` works; arrow functions throw "is not a constructor"
  default: class {
    messages = { create: mockMessagesCreate }
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }) },
}))

vi.mock('@/lib/notifications/email', () => ({
  sendBookingConfirmation:      mockSendBookingConfirmation,
  sendAdminBookingNotification: mockSendAdminBookingNotification,
  sendPaymentRejected:          mockSendPaymentRejected,
}))

const VALID_BOOKING = {
  userId:            'user-123',
  userEmail:         'player@example.com',
  userName:          'Test Player',
  businessSlug:      'biz-slug',
  businessName:      'Test Biz',
  facilityName:      'Court A',
  date:              '2026-06-01',
  hours:             [9, 10],
  totalPrice:        500,
  currency:          'PHP',
  checkout_type:     'P2P_AI',
  status:            'slot_held',
  payment_status_v2: 'ai_review',
  proof_url:         'https://firebasestorage.googleapis.com/v0/b/bucket/o/proof.jpg',
}

const BIZ_DATA = { email: 'admin@biz.com', address: '123 Main St' }

// Stub fetch globally once; reset implementation in each beforeEach.
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('verifyPaymentProof', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('fake-image-data').buffer,
      headers: { get: (h: string) => h === 'content-type' ? 'image/jpeg' : null },
    })
    mockBookingGet.mockResolvedValue({ exists: true, data: () => ({ ...VALID_BOOKING }) })
    mockBookingUpdate.mockResolvedValue(undefined)
    mockBizGet.mockResolvedValue({ data: () => ({ ...BIZ_DATA }) })
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"amount": 500}' }],
    })
    mockSendBookingConfirmation.mockResolvedValue(undefined)
    mockSendAdminBookingNotification.mockResolvedValue(undefined)
    mockSendPaymentRejected.mockResolvedValue(undefined)
  })

  // ─── Happy path ───────────────────────────────────────────────────────────────

  test('marks booking as paid and confirmed when amount matches', async () => {
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status_v2: 'paid', status: 'confirmed' }),
    )
  })

  test('sends confirmation and admin emails when paid', async () => {
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    // Promise.all is fire-and-forget — flush microtasks
    await Promise.resolve()
    expect(mockSendBookingConfirmation).toHaveBeenCalledOnce()
    expect(mockSendAdminBookingNotification).toHaveBeenCalledOnce()
    expect(mockSendPaymentRejected).not.toHaveBeenCalled()
  })

  test('includes booking details in confirmation email', async () => {
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    await Promise.resolve()
    expect(mockSendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail:   'player@example.com',
        businessEmail:   'admin@biz.com',
        businessAddress: '123 Main St',
        facilityName:    'Court A',
        totalPrice:      500,
      }),
    )
  })

  // ─── Mismatch / rejection ─────────────────────────────────────────────────────

  test('marks booking as rejected when amount does not match', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"amount": 300}' }],
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).toHaveBeenCalledWith({ payment_status_v2: 'rejected', rejected_amount: 300 })
    expect(mockBookingUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }))
  })

  test('sends rejection email when amount does not match', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"amount": 300}' }],
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    await Promise.resolve()
    expect(mockSendPaymentRejected).toHaveBeenCalledWith(
      expect.objectContaining({ submittedAmount: 300, totalPrice: 500 }),
    )
    expect(mockSendBookingConfirmation).not.toHaveBeenCalled()
  })

  test('marks as rejected when Claude returns null amount', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"amount": null}' }],
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).toHaveBeenCalledWith({ payment_status_v2: 'rejected', rejected_amount: null })
  })

  // ─── Amount tolerance ─────────────────────────────────────────────────────────

  test('marks as paid when amounts match within 1-cent tolerance (499.995)', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"amount": 499.995}' }],
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).toHaveBeenCalledWith(expect.objectContaining({ payment_status_v2: 'paid' }))
  })

  test('marks as rejected when amounts differ by more than 1 cent (500.02)', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"amount": 500.02}' }],
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).toHaveBeenCalledWith(expect.objectContaining({ payment_status_v2: 'rejected' }))
  })

  // ─── Graceful fallbacks ───────────────────────────────────────────────────────

  test('leaves booking at ai_review when Claude API throws', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('API unavailable'))
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('leaves booking at ai_review when proof image fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).not.toHaveBeenCalled()
    expect(mockMessagesCreate).not.toHaveBeenCalled()
  })

  test('leaves booking at ai_review when proof image returns non-OK status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).not.toHaveBeenCalled()
    expect(mockMessagesCreate).not.toHaveBeenCalled()
  })

  test('leaves booking at ai_review when Claude returns malformed JSON', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  // ─── Guard: booking state ─────────────────────────────────────────────────────

  test('no-ops when booking does not exist', async () => {
    mockBookingGet.mockResolvedValue({ exists: false, data: () => undefined })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('no-ops when payment_status_v2 is already paid', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, payment_status_v2: 'paid' }),
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('no-ops when payment_status_v2 is rejected (already processed)', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, payment_status_v2: 'rejected' }),
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBookingUpdate).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ─── SSRF guard ───────────────────────────────────────────────────────────────

  test('does not fetch a cloud-metadata SSRF URL stored in proof_url', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, proof_url: 'http://169.254.169.254/latest/meta-data/' }),
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('does not fetch an arbitrary external URL stored in proof_url', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, proof_url: 'https://evil.example.com/receipt.jpg' }),
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('does not fetch when proof_url is not a valid URL', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, proof_url: 'not-a-url' }),
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('accepts storage.googleapis.com as a valid proof URL domain', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, proof_url: 'https://storage.googleapis.com/bucket/proof.jpg' }),
    })
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockFetch).toHaveBeenCalledWith('https://storage.googleapis.com/bucket/proof.jpg')
  })

})

// ─── SaaS credit deduction (separate describe to use fresh module imports) ────
// These tests need to: (a) track biz-doc updates separately from booking updates,
// and (b) mock FieldValue.increment. They use vi.resetModules() + vi.doMock pattern.

describe('verifyPaymentProof — SaaS credit deduction', () => {
  // Helper: reset modules and re-apply all mocks with per-test overrides, then import fresh.
  async function importFresh({
    bizData = { email: 'admin@biz.com', address: '123 Main St', saas_credit_balance: 10 } as Record<string, unknown>,
    claudeResponse = '{"amount": 500}',
    mockBizUpdate = vi.fn().mockResolvedValue(undefined),
    mockLowBalance = vi.fn().mockResolvedValue(undefined),
  }: {
    bizData?: Record<string, unknown>
    claudeResponse?: string
    mockBizUpdate?: ReturnType<typeof vi.fn>
    mockLowBalance?: ReturnType<typeof vi.fn>
  } = {}) {
    vi.resetModules()

    vi.doMock('@/lib/firebase/admin-app', () => ({
      adminDb: {
        collection: (name: string) => ({
          doc: () => (name === 'businesses'
            ? { get: vi.fn().mockResolvedValue({ data: () => bizData }), update: mockBizUpdate }
            : {
                get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ ...VALID_BOOKING }) }),
                update: vi.fn().mockResolvedValue(undefined),
              }
          ),
        }),
      },
    }))
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class { messages = { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: claudeResponse }] }) } },
    }))
    vi.doMock('firebase-admin/firestore', () => ({
      FieldValue: {
        serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }),
        increment: (n: number) => ({ _sentinel: 'increment', value: n }),
      },
    }))
    vi.doMock('@/lib/notifications/email', () => ({
      sendBookingConfirmation:      vi.fn().mockResolvedValue(undefined),
      sendAdminBookingNotification: vi.fn().mockResolvedValue(undefined),
      sendPaymentRejected:          vi.fn().mockResolvedValue(undefined),
      sendLowBalanceWarning:        mockLowBalance,
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('fake-image-data').buffer,
      headers: { get: (h: string) => h === 'content-type' ? 'image/jpeg' : null },
    }))

    return import('./verify-proof')
  }

  afterEach(() => {
    vi.resetModules()
  })

  test('biz document update is called with FieldValue.increment(-1) on OCR match', async () => {
    const mockBizUpdate = vi.fn().mockResolvedValue(undefined)
    const { verifyPaymentProof } = await importFresh({ mockBizUpdate })
    await verifyPaymentProof('booking-abc')
    expect(mockBizUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ saas_credit_balance: expect.objectContaining({ value: -1 }) }),
    )
  })

  test('does NOT call biz update when saas_credit_balance field is absent', async () => {
    const mockBizUpdate = vi.fn().mockResolvedValue(undefined)
    // BIZ_DATA without saas_credit_balance
    const { verifyPaymentProof } = await importFresh({
      bizData: { email: 'admin@biz.com', address: '123 Main St' },
      mockBizUpdate,
    })
    await verifyPaymentProof('booking-abc')
    expect(mockBizUpdate).not.toHaveBeenCalled()
  })

  test('fires low-balance warning when newBalance is exactly 5', async () => {
    const mockLowBalance = vi.fn().mockResolvedValue(undefined)
    // balance 6 → newBalance 5 → warning fires
    await (await importFresh({ bizData: { email: 'admin@biz.com', saas_credit_balance: 6 }, mockLowBalance }))
      .verifyPaymentProof('booking-abc')
    await Promise.resolve() // flush fire-and-forget
    expect(mockLowBalance).toHaveBeenCalledWith(expect.objectContaining({ balance: 5 }))
  })

  test('fires low-balance warning when newBalance is exactly 0', async () => {
    const mockLowBalance = vi.fn().mockResolvedValue(undefined)
    // balance 1 → newBalance 0 → warning fires
    await (await importFresh({ bizData: { email: 'admin@biz.com', saas_credit_balance: 1 }, mockLowBalance }))
      .verifyPaymentProof('booking-abc')
    await Promise.resolve()
    expect(mockLowBalance).toHaveBeenCalledWith(expect.objectContaining({ balance: 0 }))
  })

  test('does NOT fire low-balance warning when newBalance is not a threshold (e.g. 4)', async () => {
    const mockLowBalance = vi.fn().mockResolvedValue(undefined)
    // balance 5 → newBalance 4 → no warning
    await (await importFresh({ bizData: { email: 'admin@biz.com', saas_credit_balance: 5 }, mockLowBalance }))
      .verifyPaymentProof('booking-abc')
    await Promise.resolve()
    expect(mockLowBalance).not.toHaveBeenCalled()
  })

  test('does NOT call biz update when OCR amount mismatches (rejected proof)', async () => {
    const mockBizUpdate = vi.fn().mockResolvedValue(undefined)
    // Claude says 300, booking expects 500 → rejected
    const { verifyPaymentProof } = await importFresh({ claudeResponse: '{"amount": 300}', mockBizUpdate })
    await verifyPaymentProof('booking-abc')
    expect(mockBizUpdate).not.toHaveBeenCalled()
  })

  test('does NOT call biz update when Claude API throws', async () => {
    const mockBizUpdate = vi.fn().mockResolvedValue(undefined)
    vi.resetModules()
    vi.doMock('@/lib/firebase/admin-app', () => ({
      adminDb: {
        collection: (name: string) => ({
          doc: () => (name === 'businesses'
            ? { get: vi.fn().mockResolvedValue({ data: () => ({ email: 'a@b.com', saas_credit_balance: 10 }) }), update: mockBizUpdate }
            : { get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ ...VALID_BOOKING }) }), update: vi.fn().mockResolvedValue(undefined) }
          ),
        }),
      },
    }))
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class { messages = { create: vi.fn().mockRejectedValue(new Error('API down')) } },
    }))
    vi.doMock('firebase-admin/firestore', () => ({
      FieldValue: {
        serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }),
        increment: (n: number) => ({ _sentinel: 'increment', value: n }),
      },
    }))
    vi.doMock('@/lib/notifications/email', () => ({
      sendBookingConfirmation: vi.fn(), sendAdminBookingNotification: vi.fn(),
      sendPaymentRejected: vi.fn(), sendLowBalanceWarning: vi.fn(),
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      arrayBuffer: async () => Buffer.from('fake').buffer,
      headers: { get: () => 'image/jpeg' },
    }))
    const { verifyPaymentProof } = await import('./verify-proof')
    await verifyPaymentProof('booking-abc')
    expect(mockBizUpdate).not.toHaveBeenCalled()
  })
})
