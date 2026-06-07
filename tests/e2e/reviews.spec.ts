/**
 * E2E tests for the reviews feature:
 *
 *  1. POST /api/reviews — creates a review for a past confirmed booking
 *  2. POST /api/reviews — rejects unauthenticated requests
 *  3. POST /api/reviews — rejects invalid rating
 *  4. POST /api/reviews — rejects review for another user's booking
 *  5. POST /api/reviews — rejects duplicate reviews for the same booking
 *  6. DELETE /api/reviews/[reviewId] — admin can delete a review
 *  7. DELETE /api/reviews/[reviewId] — non-admin is rejected
 *  8. Sidebar reviews section appears after a review is posted
 *  9. "Leave a review" button appears on past booking in account page
 * 10. Review form submits and shows "Review submitted" on success
 *
 * Prerequisites:
 *   firebase emulators:start  (Auth 9099, Firestore 8080)
 *   npm run dev
 */

import { test, expect, type Page } from '@playwright/test'
import {
  clearFirestore,
  seedBusiness,
  createTestUser,
  signInUser,
  seedAdminDoc,
  seedBookingForUser,
} from './helpers'

const BUSINESS    = '/paddleup'
const ACCOUNT     = '/account'
const TEST_EMAIL  = 'reviews-user@bookit-test.internal'
const TEST_PASS   = 'Reviews1!'
const ADMIN_EMAIL = 'reviews-admin@bookit-test.internal'
const ADMIN_PASS  = 'ReviewsAdmin1!'

// A past date (well in the past so the booking is always "past")
const PAST_DATE = '2025-01-15'

let testUserId = ''
let adminUserId = ''

test.beforeAll(async () => {
  await createTestUser(TEST_EMAIL, TEST_PASS, 'Reviews User')
  await createTestUser(ADMIN_EMAIL, ADMIN_PASS, 'Reviews Admin')
  const u = await signInUser(TEST_EMAIL, TEST_PASS)
  const a = await signInUser(ADMIN_EMAIL, ADMIN_PASS)
  testUserId = u.localId
  adminUserId = a.localId
})

test.beforeEach(async () => {
  await clearFirestore()
  await seedBusiness()
  await seedAdminDoc(adminUserId, ['paddleup'])
})

// ─── API tests (headless) ─────────────────────────────────────────────────────

test.describe('POST /api/reviews', () => {
  test('rejects unauthenticated request', async ({ request }) => {
    const res = await request.post('/api/reviews', {
      data: { businessSlug: 'paddleup', bookingId: 'b1', rating: 5, comment: 'Great' },
    })
    expect(res.status()).toBe(401)
  })

  test('rejects missing rating', async ({ request }) => {
    const { idToken } = await signInUser(TEST_EMAIL, TEST_PASS)
    const res = await request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { businessSlug: 'paddleup', bookingId: 'b1', comment: 'No rating' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects out-of-range rating', async ({ request }) => {
    const { idToken } = await signInUser(TEST_EMAIL, TEST_PASS)
    const res = await request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { businessSlug: 'paddleup', bookingId: 'b1', rating: 6, comment: 'Bad rating' },
    })
    expect(res.status()).toBe(400)
  })

  test('creates a review for a valid past confirmed booking', async ({ request }) => {
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1',
      date: PAST_DATE, hours: [9, 10],
      userId: testUserId, userEmail: TEST_EMAIL, userName: 'Reviews User',
    })
    // Get booking ID from the seeded booking via the admin emulator REST API
    const listRes = await fetch(
      `http://localhost:8080/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bookme-821b4'}/databases/(default)/documents/bookings?pageSize=1`,
      { headers: { Authorization: 'Bearer owner' } },
    )
    const listData = await listRes.json() as { documents?: Array<{ name: string }> }
    const bookingId = listData.documents?.[0]?.name.split('/').pop() ?? ''

    const { idToken } = await signInUser(TEST_EMAIL, TEST_PASS)
    const res = await request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { businessSlug: 'paddleup', bookingId, rating: 4, comment: 'Really good court!' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json() as { ok?: boolean }
    expect(body.ok).toBe(true)
  })

  test('rejects duplicate review for the same booking', async ({ request }) => {
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1',
      date: PAST_DATE, hours: [9, 10],
      userId: testUserId, userEmail: TEST_EMAIL, userName: 'Reviews User',
    })
    const listRes = await fetch(
      `http://localhost:8080/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bookme-821b4'}/databases/(default)/documents/bookings?pageSize=1`,
      { headers: { Authorization: 'Bearer owner' } },
    )
    const listData = await listRes.json() as { documents?: Array<{ name: string }> }
    const bookingId = listData.documents?.[0]?.name.split('/').pop() ?? ''

    const { idToken } = await signInUser(TEST_EMAIL, TEST_PASS)
    // First review — succeeds
    await request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { businessSlug: 'paddleup', bookingId, rating: 5, comment: 'First review' },
    })
    // Duplicate — should fail
    const res2 = await request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { businessSlug: 'paddleup', bookingId, rating: 3, comment: 'Changed my mind' },
    })
    expect(res2.status()).toBe(409)
  })
})

test.describe('DELETE /api/reviews/[reviewId]', () => {
  test('admin can delete a review', async ({ request }) => {
    // Seed a booking and review
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1',
      date: PAST_DATE, hours: [9],
      userId: testUserId, userEmail: TEST_EMAIL, userName: 'Reviews User',
    })
    const listRes = await fetch(
      `http://localhost:8080/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bookme-821b4'}/databases/(default)/documents/bookings?pageSize=1`,
      { headers: { Authorization: 'Bearer owner' } },
    )
    const listData = await listRes.json() as { documents?: Array<{ name: string }> }
    const bookingId = listData.documents?.[0]?.name.split('/').pop() ?? ''

    const { idToken: userToken } = await signInUser(TEST_EMAIL, TEST_PASS)
    await request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${userToken}` },
      data: { businessSlug: 'paddleup', bookingId, rating: 2, comment: 'Meh' },
    })

    const { idToken: adminToken } = await signInUser(ADMIN_EMAIL, ADMIN_PASS)
    const delRes = await request.delete(
      `/api/reviews/${bookingId}?slug=paddleup`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    )
    expect(delRes.status()).toBe(200)
  })

  test('non-admin cannot delete a review', async ({ request }) => {
    const { idToken } = await signInUser(TEST_EMAIL, TEST_PASS)
    const res = await request.delete('/api/reviews/some-booking-id?slug=paddleup', {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    expect(res.status()).toBe(403)
  })

  test('unauthenticated request is rejected', async ({ request }) => {
    const res = await request.delete('/api/reviews/some-booking-id?slug=paddleup')
    expect(res.status()).toBe(401)
  })
})

// ─── UI tests ─────────────────────────────────────────────────────────────────

async function signInViaBusinessPage(page: Page) {
  await page.goto(BUSINESS)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 8_000 })
  await page.getByPlaceholder('you@example.com').fill(TEST_EMAIL)
  await page.getByPlaceholder('••••••••').fill(TEST_PASS)
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByText('Welcome back')).not.toBeAttached({ timeout: 8_000 })
}

test.describe('Account page — Leave a Review', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('"Leave a review" button appears on past confirmed booking', async ({ page }) => {
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1',
      date: PAST_DATE, hours: [9, 10],
      userId: testUserId, userEmail: TEST_EMAIL, userName: 'Reviews User',
    })

    await signInViaBusinessPage(page)
    await page.goto(ACCOUNT)
    await expect(page.getByTestId('leave-review-btn')).toBeVisible({ timeout: 10_000 })
  })

  test('tapping "Leave a review" opens the inline review form', async ({ page }) => {
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1',
      date: PAST_DATE, hours: [9, 10],
      userId: testUserId, userEmail: TEST_EMAIL, userName: 'Reviews User',
    })

    await signInViaBusinessPage(page)
    await page.goto(ACCOUNT)
    await page.getByTestId('leave-review-btn').click()
    await expect(page.getByTestId('review-form')).toBeVisible({ timeout: 5_000 })
  })

  test('"Leave a review" is not shown on upcoming bookings', async ({ page }) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowKey = tomorrow.toISOString().slice(0, 10)

    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1',
      date: tomorrowKey, hours: [9, 10],
      userId: testUserId, userEmail: TEST_EMAIL, userName: 'Reviews User',
    })

    await signInViaBusinessPage(page)
    await page.goto(ACCOUNT)
    await expect(page.locator('text=Upcoming')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('leave-review-btn')).not.toBeVisible()
  })
})

test.describe('Sidebar — reviews display', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('Reviews section appears in sidebar when reviews exist', async ({ page, request }) => {
    // Seed booking + review via API
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1',
      date: PAST_DATE, hours: [9],
      userId: testUserId, userEmail: TEST_EMAIL, userName: 'Reviews User',
    })
    const listRes = await fetch(
      `http://localhost:8080/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bookme-821b4'}/databases/(default)/documents/bookings?pageSize=1`,
      { headers: { Authorization: 'Bearer owner' } },
    )
    const listData = await listRes.json() as { documents?: Array<{ name: string }> }
    const bookingId = listData.documents?.[0]?.name.split('/').pop() ?? ''

    const { idToken } = await signInUser(TEST_EMAIL, TEST_PASS)
    await request.post('/api/reviews', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { businessSlug: 'paddleup', bookingId, rating: 5, comment: 'Excellent facility!' },
    })

    await page.goto(BUSINESS)
    // Scroll to reviews section
    const reviewsHeader = page.locator('h2', { hasText: 'Reviews' }).first()
    await reviewsHeader.waitFor({ timeout: 10_000 })
    await reviewsHeader.scrollIntoViewIfNeeded()
    await expect(reviewsHeader).toBeVisible()
    await expect(page.locator('text=Excellent facility!')).toBeVisible()
  })
})
