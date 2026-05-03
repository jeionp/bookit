import { describe, test, expect, vi, beforeEach } from 'vitest'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('./admin-app', () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ get: mockGet }) }),
  },
}))

import { getBusinessBySlug } from './businesses'

describe('getBusinessBySlug', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  test('returns null when the document does not exist', async () => {
    mockGet.mockResolvedValue({ exists: false })
    await expect(getBusinessBySlug('nonexistent')).resolves.toBeNull()
  })

  test('returns business data with slug merged from the argument', async () => {
    const data = {
      name: 'PaddleUp',
      type: 'court',
      tagline: 'Where Pickleball Happens',
      description: 'A great place',
      coverImage: 'https://example.com/image.jpg',
      location: 'Quezon City',
      address: '123 St',
      phone: '+63 917 123 4567',
      email: 'hello@paddleup.ph',
      accentColor: '#16a34a',
      rating: 4.8,
      reviewCount: 214,
      facilities: [],
      amenities: [],
      operatingHours: [],
    }
    mockGet.mockResolvedValue({ exists: true, data: () => data })
    const result = await getBusinessBySlug('paddleup')
    expect(result).toEqual({ slug: 'paddleup', ...data })
  })

  test('slug is always taken from the argument, not stored document data', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ name: 'Test', type: 'court' }) })
    const result = await getBusinessBySlug('my-slug')
    expect(result?.slug).toBe('my-slug')
  })
})
