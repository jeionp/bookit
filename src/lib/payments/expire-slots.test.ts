import { describe, test, expect, vi, beforeEach } from 'vitest'

const {
  mockQueryGet,
  mockBatchUpdate,
  mockBatchCommit,
} = vi.hoisted(() => ({
  mockQueryGet:   vi.fn(),
  mockBatchUpdate: vi.fn(),
  mockBatchCommit: vi.fn(),
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }) },
  Timestamp:  { now: () => ({ seconds: 1_000_000, nanoseconds: 0 }) },
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({
        where: () => ({ get: mockQueryGet }),
      }),
    }),
    batch: () => ({
      update: mockBatchUpdate,
      commit: mockBatchCommit,
    }),
  },
}))

import { expireHeldSlots } from './expire-slots'

describe('expireHeldSlots', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockBatchCommit.mockResolvedValue(undefined)
  })

  test('returns expired: 0 and skips batch when no docs match', async () => {
    mockQueryGet.mockResolvedValue({ empty: true, docs: [], size: 0 })

    const result = await expireHeldSlots()

    expect(result).toEqual({ expired: 0 })
    expect(mockBatchUpdate).not.toHaveBeenCalled()
    expect(mockBatchCommit).not.toHaveBeenCalled()
  })

  test('writes status: expired for each matched doc', async () => {
    const ref1 = { id: 'booking-1' }
    const ref2 = { id: 'booking-2' }
    mockQueryGet.mockResolvedValue({
      empty: false,
      size: 2,
      docs: [
        { ref: ref1 },
        { ref: ref2 },
      ],
    })

    const result = await expireHeldSlots()

    expect(result).toEqual({ expired: 2 })
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2)
    expect(mockBatchUpdate).toHaveBeenCalledWith(ref1, expect.objectContaining({ status: 'expired' }))
    expect(mockBatchUpdate).toHaveBeenCalledWith(ref2, expect.objectContaining({ status: 'expired' }))
    expect(mockBatchCommit).toHaveBeenCalledOnce()
  })

  test('sets expired_at to a serverTimestamp sentinel', async () => {
    mockQueryGet.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [{ ref: { id: 'booking-x' } }],
    })

    await expireHeldSlots()

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expired_at: { _sentinel: 'serverTimestamp' } }),
    )
  })

  test('propagates Firestore query errors', async () => {
    mockQueryGet.mockRejectedValue(new Error('Firestore unavailable'))
    await expect(expireHeldSlots()).rejects.toThrow('Firestore unavailable')
  })

  test('propagates batch commit errors', async () => {
    mockQueryGet.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [{ ref: {} }],
    })
    mockBatchCommit.mockRejectedValue(new Error('commit failed'))
    await expect(expireHeldSlots()).rejects.toThrow('commit failed')
  })
})
