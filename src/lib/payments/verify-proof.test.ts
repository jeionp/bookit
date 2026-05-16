import { describe, test, expect, vi, beforeEach } from 'vitest'

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
