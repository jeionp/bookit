import { describe, test, expect, vi, afterEach } from 'vitest'

// Re-usable default mocks
const DEFAULT_BIZ = {
  email: 'admin@biz.com',
  name: 'Test Biz',
  saas_credit_balance: 10,
}

// Helper: reset modules and doMock fresh, then import `deductSaasCredit`.
// This is required because `adminDb` is used at module-import time.
async function importFresh({
  bizData = DEFAULT_BIZ as Record<string, unknown>,
  mockBizUpdate = vi.fn().mockResolvedValue(undefined),
  mockLedgerAdd = vi.fn().mockResolvedValue({ id: 'entry-1' }),
  mockLowBalance = vi.fn().mockResolvedValue(undefined),
}: {
  bizData?: Record<string, unknown>
  mockBizUpdate?: ReturnType<typeof vi.fn>
  mockLedgerAdd?: ReturnType<typeof vi.fn>
  mockLowBalance?: ReturnType<typeof vi.fn>
} = {}) {
  vi.resetModules()

  vi.doMock('@/lib/firebase/admin-app', () => ({
    adminDb: {
      collection: (name: string) => ({
        doc: (slug: string) => {
          if (name === 'businesses') {
            return {
              update: mockBizUpdate,
              collection: () => ({ add: mockLedgerAdd }),
            }
          }
          return {}
        },
      }),
    },
  }))

  vi.doMock('firebase-admin/firestore', () => ({
    FieldValue: {
      serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }),
      increment: (n: number) => ({ _sentinel: 'increment', value: n }),
    },
  }))

  vi.doMock('@/lib/notifications/email', () => ({
    sendLowBalanceWarning: mockLowBalance,
  }))

  return import('./ledger')
}

afterEach(() => {
  vi.resetModules()
})

describe('deductSaasCredit', () => {
  // ── Guard: non-number saas_credit_balance ─────────────────────────────────

  test('does nothing when saas_credit_balance is absent', async () => {
    const mockBizUpdate = vi.fn()
    const mockLedgerAdd = vi.fn()
    const { deductSaasCredit } = await importFresh({
      bizData: { email: 'admin@biz.com', name: 'Test Biz' },
      mockBizUpdate,
      mockLedgerAdd,
    })
    await deductSaasCredit({ businessSlug: 'biz', bookingId: 'b1', trigger: 'ai_verify', biz: { email: 'admin@biz.com', name: 'Test Biz' } })
    expect(mockBizUpdate).not.toHaveBeenCalled()
    expect(mockLedgerAdd).not.toHaveBeenCalled()
  })

  test('does nothing when saas_credit_balance is a string (not a number)', async () => {
    const mockBizUpdate = vi.fn()
    const mockLedgerAdd = vi.fn()
    const { deductSaasCredit } = await importFresh({ mockBizUpdate, mockLedgerAdd })
    await deductSaasCredit({ businessSlug: 'biz', bookingId: 'b1', trigger: 'ai_verify', biz: { saas_credit_balance: '10' } })
    expect(mockBizUpdate).not.toHaveBeenCalled()
    expect(mockLedgerAdd).not.toHaveBeenCalled()
  })

  test('does nothing when saas_credit_balance is null', async () => {
    const mockBizUpdate = vi.fn()
    const mockLedgerAdd = vi.fn()
    const { deductSaasCredit } = await importFresh({ mockBizUpdate, mockLedgerAdd })
    await deductSaasCredit({ businessSlug: 'biz', bookingId: 'b1', trigger: 'ai_verify', biz: { saas_credit_balance: null } })
    expect(mockBizUpdate).not.toHaveBeenCalled()
    expect(mockLedgerAdd).not.toHaveBeenCalled()
  })

  // ── Happy path: db writes ─────────────────────────────────────────────────

  test('calls bizRef.update with FieldValue.increment(-1)', async () => {
    const mockBizUpdate = vi.fn().mockResolvedValue(undefined)
    const { deductSaasCredit } = await importFresh({ mockBizUpdate })
    await deductSaasCredit({
      businessSlug: 'biz-slug',
      bookingId: 'b1',
      trigger: 'ai_verify',
      biz: { ...DEFAULT_BIZ },
    })
    expect(mockBizUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ saas_credit_balance: expect.objectContaining({ value: -1 }) }),
    )
  })

  test('calls credit_ledger.add with correct fields', async () => {
    const mockLedgerAdd = vi.fn().mockResolvedValue({ id: 'entry-1' })
    const { deductSaasCredit } = await importFresh({ mockLedgerAdd })
    await deductSaasCredit({
      businessSlug: 'biz-slug',
      bookingId: 'booking-abc',
      trigger: 'admin_approve',
      biz: { ...DEFAULT_BIZ, saas_credit_balance: 7 },
    })
    expect(mockLedgerAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        businessSlug: 'biz-slug',
        bookingId: 'booking-abc',
        trigger: 'admin_approve',
        balanceBefore: 7,
        balanceAfter: 6,
        createdAt: expect.objectContaining({ _sentinel: 'serverTimestamp' }),
      }),
    )
  })

  test('both update and ledger add are called (Promise.all)', async () => {
    const mockBizUpdate = vi.fn().mockResolvedValue(undefined)
    const mockLedgerAdd = vi.fn().mockResolvedValue({ id: 'entry-1' })
    const { deductSaasCredit } = await importFresh({ mockBizUpdate, mockLedgerAdd })
    await deductSaasCredit({
      businessSlug: 'biz-slug',
      bookingId: 'b1',
      trigger: 'admin_mark_paid',
      biz: { ...DEFAULT_BIZ, saas_credit_balance: 3 },
    })
    expect(mockBizUpdate).toHaveBeenCalledOnce()
    expect(mockLedgerAdd).toHaveBeenCalledOnce()
  })

  // ── Trigger variants ──────────────────────────────────────────────────────

  test.each([
    'gateway_webhook',
    'ai_verify',
    'admin_approve',
    'admin_mark_paid',
  ] as const)('accepts trigger value "%s"', async (trigger) => {
    const mockLedgerAdd = vi.fn().mockResolvedValue({ id: 'x' })
    const { deductSaasCredit } = await importFresh({ mockLedgerAdd })
    await deductSaasCredit({ businessSlug: 'biz', bookingId: 'b1', trigger, biz: { ...DEFAULT_BIZ } })
    expect(mockLedgerAdd).toHaveBeenCalledWith(expect.objectContaining({ trigger }))
  })

  // ── Low balance warning ───────────────────────────────────────────────────

  test('fires low-balance warning when balanceAfter === 5', async () => {
    const mockLowBalance = vi.fn().mockResolvedValue(undefined)
    const { deductSaasCredit } = await importFresh({ mockLowBalance })
    await deductSaasCredit({
      businessSlug: 'biz-slug',
      bookingId: 'b1',
      trigger: 'ai_verify',
      biz: { ...DEFAULT_BIZ, saas_credit_balance: 6 },
    })
    await Promise.resolve() // flush fire-and-forget
    expect(mockLowBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        businessSlug: 'biz-slug',
        balance: 5,
      }),
    )
  })

  test('fires low-balance warning when balanceAfter === 0', async () => {
    const mockLowBalance = vi.fn().mockResolvedValue(undefined)
    const { deductSaasCredit } = await importFresh({ mockLowBalance })
    await deductSaasCredit({
      businessSlug: 'biz-slug',
      bookingId: 'b1',
      trigger: 'ai_verify',
      biz: { ...DEFAULT_BIZ, saas_credit_balance: 1 },
    })
    await Promise.resolve()
    expect(mockLowBalance).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 0 }),
    )
  })

  test('includes businessEmail, businessName and businessSlug in low-balance warning', async () => {
    const mockLowBalance = vi.fn().mockResolvedValue(undefined)
    const { deductSaasCredit } = await importFresh({ mockLowBalance })
    await deductSaasCredit({
      businessSlug: 'biz-slug',
      bookingId: 'b1',
      trigger: 'ai_verify',
      biz: { email: 'owner@biz.com', name: 'My Biz', saas_credit_balance: 6 },
    })
    await Promise.resolve()
    expect(mockLowBalance).toHaveBeenCalledWith({
      businessEmail: 'owner@biz.com',
      businessName: 'My Biz',
      businessSlug: 'biz-slug',
      balance: 5,
    })
  })

  test('does NOT fire low-balance warning when balanceAfter is 4 (not a threshold)', async () => {
    const mockLowBalance = vi.fn()
    const { deductSaasCredit } = await importFresh({ mockLowBalance })
    await deductSaasCredit({
      businessSlug: 'biz',
      bookingId: 'b1',
      trigger: 'ai_verify',
      biz: { ...DEFAULT_BIZ, saas_credit_balance: 5 },
    })
    await Promise.resolve()
    expect(mockLowBalance).not.toHaveBeenCalled()
  })

  test('does NOT fire low-balance warning when balanceAfter is 6', async () => {
    const mockLowBalance = vi.fn()
    const { deductSaasCredit } = await importFresh({ mockLowBalance })
    await deductSaasCredit({
      businessSlug: 'biz',
      bookingId: 'b1',
      trigger: 'ai_verify',
      biz: { ...DEFAULT_BIZ, saas_credit_balance: 7 },
    })
    await Promise.resolve()
    expect(mockLowBalance).not.toHaveBeenCalled()
  })

  test('does NOT fire low-balance warning when balanceAfter is 1', async () => {
    const mockLowBalance = vi.fn()
    const { deductSaasCredit } = await importFresh({ mockLowBalance })
    await deductSaasCredit({
      businessSlug: 'biz',
      bookingId: 'b1',
      trigger: 'ai_verify',
      biz: { ...DEFAULT_BIZ, saas_credit_balance: 2 },
    })
    await Promise.resolve()
    expect(mockLowBalance).not.toHaveBeenCalled()
  })

  // ── Edge: balance exactly 0 before deduction ─────────────────────────────

  test('balanceBefore 0 yields balanceAfter -1 and writes ledger with those values', async () => {
    const mockLedgerAdd = vi.fn().mockResolvedValue({ id: 'x' })
    const { deductSaasCredit } = await importFresh({ mockLedgerAdd })
    await deductSaasCredit({
      businessSlug: 'biz',
      bookingId: 'b1',
      trigger: 'ai_verify',
      biz: { ...DEFAULT_BIZ, saas_credit_balance: 0 },
    })
    expect(mockLedgerAdd).toHaveBeenCalledWith(
      expect.objectContaining({ balanceBefore: 0, balanceAfter: -1 }),
    )
  })
})
