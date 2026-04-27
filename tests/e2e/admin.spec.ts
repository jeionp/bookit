import { test, expect, type Page } from '@playwright/test'
import {
  clearFirestore,
  createTestUser,
  signInUser,
  seedAdminDoc,
  seedBooking,
  seedBookingForUser,
  todayKey,
  dateKeyDelta,
} from './helpers'

// ─── Constants ────────────────────────────────────────────────────────────────

const STOREFRONT      = '/paddleup'
const ADMIN_PAGE      = '/paddleup/admin'

const ADMIN_EMAIL     = 'admin@bookit-test.internal'
const ADMIN_PASSWORD  = 'AdminPass1!'

const NON_ADMIN_EMAIL    = 'user@bookit-test.internal'
const NON_ADMIN_PASSWORD = 'UserPass1!'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function signInOnStorefront(page: Page, email: string, password: string) {
  await page.goto(STOREFRONT)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Welcome back')).toBeVisible()
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({
    timeout: 8_000,
  })
}

// Signs in as admin, seeds the admin doc, and navigates to the admin schedule
// view. Waits until the schedule grid header is ready before returning.
async function goToScheduleView(page: Page, adminUid: string) {
  await seedAdminDoc(adminUid, ['paddleup'])
  await signInOnStorefront(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  await page.goto(ADMIN_PAGE)
  await expect(page.getByText('Court 1')).toBeVisible({ timeout: 8_000 })
}

// ─── Suite setup ─────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await createTestUser(NON_ADMIN_EMAIL, NON_ADMIN_PASSWORD, 'Regular User')
  await createTestUser(ADMIN_EMAIL, ADMIN_PASSWORD, 'Admin User')
})

test.beforeEach(async () => {
  await clearFirestore()
})

// ─── Phase 1: Auth & Access Control ──────────────────────────────────────────

test.describe('Admin page — access control', () => {
  test('unauthenticated user is redirected to the storefront', async ({ page }) => {
    await page.goto(ADMIN_PAGE)
    await expect(page).toHaveURL(STOREFRONT, { timeout: 8_000 })
  })

  test('authenticated non-admin is redirected to the storefront', async ({ page }) => {
    await signInOnStorefront(page, NON_ADMIN_EMAIL, NON_ADMIN_PASSWORD)
    await page.goto(ADMIN_PAGE)
    await expect(page).toHaveURL(STOREFRONT, { timeout: 8_000 })
  })

  test('admin user can access the admin page and sees the schedule view', async ({ page }) => {
    const { localId } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await seedAdminDoc(localId, ['paddleup'])

    await signInOnStorefront(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await page.goto(ADMIN_PAGE)

    // Schedule grid header and date navigation are the indicators the admin view loaded
    await expect(page.getByLabel('Next day')).toBeVisible({ timeout: 8_000 })
    await expect(page).toHaveURL(ADMIN_PAGE)
  })

  test('admin of a different slug is redirected to the storefront', async ({ page }) => {
    // This user is admin of 'other-slug', not 'paddleup'
    const { localId } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await seedAdminDoc(localId, ['other-slug'])

    await signInOnStorefront(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await page.goto(ADMIN_PAGE)

    await expect(page).toHaveURL(STOREFRONT, { timeout: 8_000 })
  })
})

// ─── Phase 2: Master Schedule View ───────────────────────────────────────────

test.describe('Admin schedule view', () => {
  let adminUid = ''

  test.beforeAll(async () => {
    const result = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUid = result.localId
  })

  test('renders a column header for every court', async ({ page }) => {
    await goToScheduleView(page, adminUid)

    await expect(page.getByText('Court 1')).toBeVisible()
    await expect(page.getByText('Court 2')).toBeVisible()
    await expect(page.getByText('Court 3 (Indoor)')).toBeVisible()
    await expect(page.getByText('Court 7 (VIP)')).toBeVisible()
  })

  test('grid is empty when no bookings exist for the day', async ({ page }) => {
    await goToScheduleView(page, adminUid)

    // No booking blocks should be rendered (booking blocks carry the customer name)
    await expect(page.getByText('Seed User')).not.toBeAttached()
  })

  test('booking block appears in the correct court column', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await expect(page.getByText('Seed User')).toBeVisible({ timeout: 8_000 })
  })

  test('clicking a booking block opens the detail panel', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByText('Seed User').click()

    await expect(page.getByText('Booking Detail')).toBeVisible()
  })

  test('detail panel shows facility, customer info, and total', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByText('Seed User').click()

    const panel = page.getByTestId('booking-detail-panel')
    await expect(panel.getByText('Court 1')).toBeVisible()
    await expect(panel.getByText('Seed User')).toBeVisible()
    await expect(panel.getByText('seed@bookit-test.internal')).toBeVisible()
    await expect(panel.getByText('₱1,000')).toBeVisible()
    // Booking ID section label confirms the ID row is rendered
    await expect(panel.getByText('Booking ID')).toBeVisible()
  })

  test('closing the detail panel with X hides it', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByText('Seed User').click()
    await expect(page.getByText('Booking Detail')).toBeVisible()

    await page.getByTestId('booking-detail-panel').getByRole('button', { name: /close/i }).click()

    await expect(page.getByText('Booking Detail')).not.toBeAttached()
  })

  test('navigating to the next day hides bookings from the current day', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await expect(page.getByText('Seed User')).toBeVisible({ timeout: 8_000 })

    await page.getByLabel('Next day').click()

    await expect(page.getByText('Seed User')).not.toBeAttached({ timeout: 8_000 })
  })

  test('navigating to the previous day hides bookings from the current day', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await expect(page.getByText('Seed User')).toBeVisible({ timeout: 8_000 })

    await page.getByLabel('Previous day').click()

    await expect(page.getByText('Seed User')).not.toBeAttached({ timeout: 8_000 })
  })

  test('bookings seeded for tomorrow do not appear on today\'s grid', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: dateKeyDelta(1), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await expect(page.getByText('Seed User')).not.toBeAttached()
  })

  test('navigating to the next day and back shows bookings on today\'s grid', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByLabel('Next day').click()
    await expect(page.getByText('Seed User')).not.toBeAttached({ timeout: 8_000 })

    await page.getByLabel('Previous day').click()
    await expect(page.getByText('Seed User')).toBeVisible({ timeout: 8_000 })
  })

  test('navigating away closes the open detail panel', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByText('Seed User').click()
    await expect(page.getByText('Booking Detail')).toBeVisible()

    await page.getByLabel('Next day').click()

    await expect(page.getByText('Booking Detail')).not.toBeAttached({ timeout: 8_000 })
  })
})

// ─── Phase 3: Booking Management ─────────────────────────────────────────────

test.describe('Admin booking management', () => {
  let adminUid = ''

  test.beforeAll(async () => {
    const result = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUid = result.localId
  })

  test('admin can cancel a confirmed booking and it is removed from the grid', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByText('Seed User').click()
    await page.getByTestId('cancel-booking-btn').click()
    await page.getByTestId('confirm-cancel-btn').click()

    // Target the grid block button specifically — the panel also contains "Seed User"
    // text, so getByText would hit two elements while the async cancel is in flight.
    await expect(page.getByRole('button', { name: /Seed User/ })).not.toBeAttached({ timeout: 8_000 })
    await expect(page.getByText('Booking Detail')).not.toBeAttached()
  })

  test('cancel shows a confirmation dialog before cancelling', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByText('Seed User').click()
    await page.getByTestId('cancel-booking-btn').click()

    // Confirmation dialog is shown
    await expect(page.getByText('Cancel this booking?')).toBeVisible()
    // Grid block is still present (panel is also open, so scope to the button)
    await expect(page.getByRole('button', { name: /Seed User/ })).toBeAttached()

    // Dismiss with "No"
    await page.getByRole('button', { name: 'No' }).click()
    await expect(page.getByText('Cancel this booking?')).not.toBeAttached()
    await expect(page.getByRole('button', { name: /Seed User/ })).toBeVisible()
  })

  test('admin can reschedule a booking to a different court', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByText('Seed User').click()
    await page.getByTestId('reschedule-btn').click()

    // Change to Court 2 (no existing bookings — hours stay selected)
    await page.getByTestId('reschedule-court-select').selectOption({ label: 'Court 2' })
    await expect(page.getByTestId('confirm-reschedule-btn')).toBeEnabled({ timeout: 5_000 })

    await page.getByTestId('confirm-reschedule-btn').click()

    // Detail panel now shows Court 2
    const panel = page.getByTestId('booking-detail-panel')
    await expect(panel.getByText('Court 2')).toBeVisible({ timeout: 8_000 })
  })

  test('reschedule back button returns to detail view without saving', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByText('Seed User').click()
    await page.getByTestId('reschedule-btn').click()
    await expect(page.getByText('Reschedule Booking')).toBeVisible()

    await page.getByRole('button', { name: 'Back' }).click()

    await expect(page.getByText('Booking Detail')).toBeVisible()
    await expect(page.getByTestId('booking-detail-panel').getByText('Court 1')).toBeVisible()
  })

  test('search filter hides non-matching booking blocks', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await expect(page.getByText('Seed User')).toBeVisible({ timeout: 8_000 })

    await page.getByPlaceholder('Search bookings…').fill('nonexistent')

    await expect(page.getByText('Seed User')).not.toBeAttached()
  })

  test('search filter shows matching bookings by name', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByPlaceholder('Search bookings…').fill('Seed')

    await expect(page.getByText('Seed User')).toBeVisible()
  })

  test('search filter shows matching bookings by email', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByPlaceholder('Search bookings…').fill('seed@bookit')

    await expect(page.getByText('Seed User')).toBeVisible()
  })

  test('clearing the search restores all booking blocks', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByPlaceholder('Search bookings…').fill('nonexistent')
    await expect(page.getByText('Seed User')).not.toBeAttached()

    await page.getByPlaceholder('Search bookings…').fill('')
    await expect(page.getByText('Seed User')).toBeVisible()
  })

  test('rescheduling to a different date removes the booking from today\'s grid', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9] })
    await goToScheduleView(page, adminUid)

    await page.getByText('Seed User').click()
    await page.getByTestId('reschedule-btn').click()
    await expect(page.getByText('Reschedule Booking')).toBeVisible()

    // Move to tomorrow — hour 9 stays selected (not taken on that day)
    await page.getByTestId('reschedule-date-input').fill(dateKeyDelta(1))
    await expect(page.getByTestId('confirm-reschedule-btn')).toBeEnabled({ timeout: 5_000 })
    await page.getByTestId('confirm-reschedule-btn').click()

    // Booking moved to tomorrow — must not appear on today's grid
    await expect(page.getByText('Seed User')).not.toBeAttached({ timeout: 8_000 })
  })

  test('a slot booked by another booking appears disabled in the reschedule picker', async ({ page }) => {
    // Alpha books court-1 at 9 AM; Beta books court-1 at 2 PM (hour 14)
    await seedBookingForUser({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9], userId: 'uid-alpha', userEmail: 'alpha@bookit-test.internal', userName: 'Alpha User' })
    await seedBookingForUser({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [14], userId: 'uid-beta', userEmail: 'beta@bookit-test.internal', userName: 'Beta User' })
    await goToScheduleView(page, adminUid)

    // Open Alpha's detail panel and enter reschedule mode
    await page.getByText('Alpha User').click()
    await page.getByTestId('reschedule-btn').click()

    const panel = page.getByTestId('booking-detail-panel')
    // Wait for slot availability to finish loading
    await expect(page.getByTestId('confirm-reschedule-btn')).toBeEnabled({ timeout: 5_000 })

    // Beta's 2 PM slot must be disabled; Alpha's own 9 AM slot is excluded and stays selectable
    await expect(panel.getByRole('button', { name: '2 PM', exact: true })).toBeDisabled()
    await expect(panel.getByRole('button', { name: '9 AM', exact: true })).not.toBeDisabled()
  })

  test('search filter shows only the matching booking when multiple users have bookings', async ({ page }) => {
    await seedBookingForUser({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9], userId: 'uid-alpha', userEmail: 'alpha@bookit-test.internal', userName: 'Alpha User' })
    await seedBookingForUser({ facilityId: 'court-2', facilityName: 'Court 2', date: todayKey(), hours: [9], userId: 'uid-beta', userEmail: 'beta@bookit-test.internal', userName: 'Beta User' })
    await goToScheduleView(page, adminUid)

    await expect(page.getByText('Alpha User')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('Beta User')).toBeVisible({ timeout: 8_000 })

    await page.getByPlaceholder('Search bookings…').fill('Alpha')

    await expect(page.getByText('Alpha User')).toBeVisible()
    await expect(page.getByText('Beta User')).not.toBeAttached()
  })
})

// ─── Storefront — admin link ──────────────────────────────────────────────────

test.describe('Storefront — admin link', () => {
  let adminUid = ''

  test.beforeAll(async () => {
    const result = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUid = result.localId
  })

  test('admin link is visible in the nav for admin users', async ({ page }) => {
    await seedAdminDoc(adminUid, ['paddleup'])
    await signInOnStorefront(page, ADMIN_EMAIL, ADMIN_PASSWORD)

    await expect(page.getByRole('link', { name: /Admin/ })).toBeVisible()
  })

  test('admin link is not visible for regular authenticated users', async ({ page }) => {
    await signInOnStorefront(page, NON_ADMIN_EMAIL, NON_ADMIN_PASSWORD)
    // Sign out button confirms auth has fully settled
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible()

    await expect(page.getByRole('link', { name: /Admin/ })).not.toBeAttached()
  })

  test('admin link is not visible for unauthenticated users', async ({ page }) => {
    await page.goto(STOREFRONT)
    // Sign in button confirms auth loaded with no user
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 8_000 })

    await expect(page.getByRole('link', { name: /Admin/ })).not.toBeAttached()
  })

  test('clicking the admin link navigates to the admin schedule view', async ({ page }) => {
    await seedAdminDoc(adminUid, ['paddleup'])
    await signInOnStorefront(page, ADMIN_EMAIL, ADMIN_PASSWORD)

    await page.getByRole('link', { name: /Admin/ }).click()

    await expect(page).toHaveURL(ADMIN_PAGE, { timeout: 8_000 })
    await expect(page.getByLabel('Next day')).toBeVisible({ timeout: 8_000 })
  })
})
