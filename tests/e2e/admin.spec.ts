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

    // Dismiss with "Back" (button was renamed from "No" in Phase 5c)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByText('Cancel this booking?')).not.toBeAttached()
    await expect(page.getByRole('button', { name: /Seed User/ })).toBeVisible()
  })

  test('admin can reschedule a booking to a different court', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToScheduleView(page, adminUid)

    await page.getByText('Seed User').click()
    await page.getByTestId('reschedule-btn').click()

    // Change to Court 2 and select a new time slot
    await page.getByTestId('reschedule-court-select').selectOption({ label: 'Court 2' })
    await expect(page.getByTestId('confirm-reschedule-btn')).toBeDisabled({ timeout: 5_000 })
    await page.getByTestId('reschedule-slot-9').click()
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

    // Move to tomorrow and select a slot
    await page.getByTestId('reschedule-date-input').fill(dateKeyDelta(1))
    await page.getByTestId('reschedule-slot-9').click()
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
    await expect(page.getByTestId('reschedule-slot-9')).toBeVisible({ timeout: 5_000 })

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

// ─── Phase 4: Analytics Dashboard ────────────────────────────────────────────

async function goToAnalyticsView(page: Page, uid: string) {
  await goToScheduleView(page, uid)
  await page.getByRole('button', { name: 'Analytics' }).click()
  // Revenue stat card confirms the analytics view has finished loading
  await expect(page.getByTestId('stat-revenue')).toBeVisible({ timeout: 8_000 })
}

test.describe('Admin analytics dashboard', () => {
  let adminUid = ''

  test.beforeAll(async () => {
    const result = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUid = result.localId
  })

  test('Analytics tab is accessible from the schedule view', async ({ page }) => {
    await goToScheduleView(page, adminUid)
    await page.getByRole('button', { name: 'Analytics' }).click()
    await expect(page.getByTestId('stat-revenue')).toBeVisible({ timeout: 8_000 })
  })

  test('shows empty state when no bookings exist in the selected period', async ({ page }) => {
    await goToAnalyticsView(page, adminUid)
    await expect(page.getByText('No bookings in this period')).toBeVisible()
  })

  test('revenue stat reflects total price of confirmed bookings', async ({ page }) => {
    // 2 bookings × 2 hours × ₱500/h = ₱2,000 total
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await seedBooking({ facilityId: 'court-2', facilityName: 'Court 2', date: todayKey(), hours: [14, 15] })
    await goToAnalyticsView(page, adminUid)
    await expect(page.getByTestId('stat-revenue')).toContainText('₱2,000')
  })

  test('cancelled bookings are excluded from bookings count and revenue', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9] })
    await seedBookingForUser({
      facilityId: 'court-2', facilityName: 'Court 2', date: todayKey(), hours: [14],
      userId: 'uid-x', userEmail: 'x@bookit-test.internal', userName: 'Cancelled User',
      status: 'cancelled',
    })
    await goToAnalyticsView(page, adminUid)
    // Only the confirmed booking counts toward revenue and bookings count
    await expect(page.getByTestId('stat-revenue')).toContainText('₱500')
    await expect(page.getByTestId('stat-bookings')).toContainText('1')
  })

  test('hours booked stat sums hours across confirmed bookings', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10, 11] })
    await goToAnalyticsView(page, adminUid)
    await expect(page.getByTestId('stat-hours')).toContainText('3')
  })

  test('cancellation rate reflects the proportion of cancelled bookings', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9] })
    await seedBookingForUser({
      facilityId: 'court-2', facilityName: 'Court 2', date: todayKey(), hours: [14],
      userId: 'uid-x', userEmail: 'x@bookit-test.internal', userName: 'Cancelled User',
      status: 'cancelled',
    })
    await goToAnalyticsView(page, adminUid)
    await expect(page.getByTestId('stat-cancellation-rate')).toContainText('50%')
  })

  test('court utilization section shows booking hours per court', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9, 10] })
    await goToAnalyticsView(page, adminUid)
    await expect(page.getByText('Court Utilization')).toBeVisible()
    await expect(page.getByText('2h · 1 booking')).toBeVisible()
  })

  test('peak hours section lists each booked hour', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9] })
    await goToAnalyticsView(page, adminUid)
    await expect(page.getByText('Peak Hours')).toBeVisible()
    await expect(page.getByText('9 AM')).toBeVisible()
  })

  test('avg booking value is displayed when bookings exist', async ({ page }) => {
    // 2 × 1h × ₱500 = ₱1,000 total; avg = ₱500
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9] })
    await seedBooking({ facilityId: 'court-2', facilityName: 'Court 2', date: todayKey(), hours: [14] })
    await goToAnalyticsView(page, adminUid)
    await expect(page.getByText(/Avg booking value/)).toContainText('₱500')
  })

  test('switching to Today period excludes bookings from earlier in the month', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: dateKeyDelta(-1), hours: [9] })
    await goToAnalyticsView(page, adminUid)
    // Month view includes yesterday's booking
    await expect(page.getByTestId('stat-revenue')).toContainText('₱500')
    // Switch to Today — booking disappears
    await page.getByRole('button', { name: 'Today' }).click()
    await expect(page.getByText('No bookings in this period')).toBeVisible({ timeout: 8_000 })
  })

  test('switching to Year to Date includes bookings outside the current month', async ({ page }) => {
    // 40 days ago: outside current month but within current year (safe for any date after Feb 10)
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1', date: dateKeyDelta(-40), hours: [9],
      userId: 'uid-old', userEmail: 'old@bookit-test.internal', userName: 'Old User',
    })
    await goToAnalyticsView(page, adminUid)
    // Month view: no bookings in the current month
    await expect(page.getByText('No bookings in this period')).toBeVisible()
    // Year to Date: the booking is included
    await page.getByRole('button', { name: 'Year to Date' }).click()
    await expect(page.getByText('No bookings in this period')).not.toBeAttached({ timeout: 8_000 })
    await expect(page.getByTestId('stat-revenue')).toContainText('₱500')
  })
})

// ─── Phase 5: Walk-in booking ─────────────────────────────────────────────────

test.describe('Admin walk-in booking', () => {
  let adminUid = ''

  test.beforeAll(async () => {
    const result = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUid = result.localId
  })

  test('"New booking" button opens the walk-in modal', async ({ page }) => {
    await goToScheduleView(page, adminUid)
    await page.getByTestId('new-walkin-btn').click()
    await expect(page.getByTestId('walkin-modal')).toBeVisible()
  })

  test('Book button is disabled when no slot is selected', async ({ page }) => {
    await goToScheduleView(page, adminUid)
    await page.getByTestId('new-walkin-btn').click()
    await expect(page.getByTestId('walkin-modal')).toBeVisible()
    await expect(page.getByTestId('walkin-book-btn')).toBeDisabled()
  })

  test('a pre-seeded slot appears disabled in the walk-in modal', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9] })
    await goToScheduleView(page, adminUid)
    await page.getByTestId('new-walkin-btn').click()
    // Wait for slots to finish loading before checking disabled state
    await expect(page.getByTestId('walkin-slot-9')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('walkin-slot-9')).toBeDisabled()
  })

  test('submitting a walk-in booking adds it to the schedule grid', async ({ page }) => {
    await goToScheduleView(page, adminUid)
    await page.getByTestId('new-walkin-btn').click()
    await expect(page.getByTestId('walkin-slot-9')).toBeVisible({ timeout: 8_000 })
    await page.getByTestId('walkin-name-input').fill('Walk-in Guest')
    await page.getByTestId('walkin-slot-9').click()
    await page.getByTestId('walkin-book-btn').click()
    // Modal closes and the new booking appears on the grid under the entered name
    await expect(page.getByTestId('walkin-modal')).not.toBeAttached({ timeout: 8_000 })
    await expect(page.getByText('Walk-in Guest')).toBeVisible({ timeout: 8_000 })
  })

  test('slot conflict during walk-in submission shows the unavailable error', async ({ page }) => {
    await goToScheduleView(page, adminUid)
    await page.getByTestId('new-walkin-btn').click()
    await expect(page.getByTestId('walkin-slot-9')).toBeVisible({ timeout: 8_000 })
    // Select the slot before anyone else books it
    await page.getByTestId('walkin-slot-9').click()
    // Simulate a concurrent booking being created for that same slot
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9] })
    // Now submit — the transaction detects the conflict
    await page.getByTestId('walkin-book-btn').click()
    await expect(page.getByText(/One or more slots you selected were just booked/)).toBeVisible({ timeout: 8_000 })
  })

  test('closing the modal with Cancel does not create a booking', async ({ page }) => {
    await goToScheduleView(page, adminUid)
    await page.getByTestId('new-walkin-btn').click()
    await expect(page.getByTestId('walkin-modal')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('walkin-modal')).not.toBeAttached()
    await expect(page.getByText('Walk-in')).not.toBeAttached()
  })

  test('email lookup pre-fills name when an existing customer is found', async ({ page }) => {
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1', date: dateKeyDelta(-1), hours: [9],
      userId: 'uid-known', userEmail: 'known@bookit-test.internal', userName: 'Known Customer',
    })
    await goToScheduleView(page, adminUid)
    await page.getByTestId('new-walkin-btn').click()
    await page.getByTestId('walkin-email-input').fill('known@bookit-test.internal')
    await page.getByTestId('walkin-lookup-btn').click()
    await expect(page.getByText(/Existing customer found/)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('walkin-name-input')).toHaveValue('Known Customer')
    // Invite checkbox must not appear — customer already has an account
    await expect(page.getByTestId('walkin-invite-checkbox')).not.toBeAttached()
  })

  test('invite checkbox appears when lookup finds no existing customer', async ({ page }) => {
    await goToScheduleView(page, adminUid)
    await page.getByTestId('new-walkin-btn').click()
    await page.getByTestId('walkin-email-input').fill('newperson@bookit-test.internal')
    await page.getByTestId('walkin-lookup-btn').click()
    await expect(page.getByText('No existing customer found')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('walkin-invite-checkbox')).toBeVisible()
  })
})

// ─── Phase 5: Walk-in past-slot visual hint ───────────────────────────────────

test.describe('Admin walk-in past-slot hint', () => {
  let adminUid = ''

  test.beforeAll(async () => {
    const result = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUid = result.localId
  })

  // Returns a Date set to today at the given hour (local time), so the mocked
  // date string always matches what AdminScheduleView already holds in state.
  function todayAt(hour: number): Date {
    const d = new Date()
    d.setHours(hour, 0, 0, 0)
    return d
  }

  test('slots before the current hour on today are dimmed but not disabled', async ({ page }) => {
    await goToScheduleView(page, adminUid)
    // Lock the browser clock to 2 PM — every slot before hour 14 becomes "past"
    await page.clock.setFixedTime(todayAt(14))
    await page.getByTestId('new-walkin-btn').click()
    await expect(page.getByTestId('walkin-slot-6')).toBeVisible({ timeout: 8_000 })

    // 6 AM is before 2 PM → past hint colour (#9ca3af) and still enabled
    const pastSlot = page.getByTestId('walkin-slot-6')
    await expect(pastSlot).toHaveCSS('color', 'rgb(156, 163, 175)')
    await expect(pastSlot).not.toBeDisabled()

    // 2 PM is the current hour → normal dark colour (#374151)
    const currentSlot = page.getByTestId('walkin-slot-14')
    await expect(currentSlot).toHaveCSS('color', 'rgb(55, 65, 81)')
    await expect(currentSlot).not.toBeDisabled()
  })

  test('no slots are grayed out when viewing a future date', async ({ page }) => {
    await goToScheduleView(page, adminUid)
    await page.clock.setFixedTime(todayAt(14))
    await page.getByTestId('new-walkin-btn').click()
    await expect(page.getByTestId('walkin-slot-6')).toBeVisible({ timeout: 8_000 })

    // Switch to tomorrow — isToday becomes false, past hint must disappear
    await page.getByTestId('walkin-date-input').fill(dateKeyDelta(1))
    await expect(page.getByTestId('walkin-slot-6')).toHaveCSS('color', 'rgb(55, 65, 81)', { timeout: 8_000 })
  })

  test('a past-hint slot can still be selected and submitted', async ({ page }) => {
    await goToScheduleView(page, adminUid)
    await page.clock.setFixedTime(todayAt(14))
    await page.getByTestId('new-walkin-btn').click()
    await expect(page.getByTestId('walkin-slot-6')).toBeVisible({ timeout: 8_000 })

    // Slot 6 AM is grayed out but must still be clickable
    await expect(page.getByTestId('walkin-slot-6')).not.toBeDisabled()
    await page.getByTestId('walkin-slot-6').click()
    await page.getByTestId('walkin-book-btn').click()
    await expect(page.getByTestId('walkin-modal')).not.toBeAttached({ timeout: 8_000 })
  })
})

// ─── Phase 5: Refund prompt ────────────────────────────────────────────────────

test.describe('Admin refund prompt', () => {
  let adminUid = ''

  test.beforeAll(async () => {
    const result = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUid = result.localId
  })

  test('cancelling an unpaid booking goes directly to the confirm step', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9] })
    await goToScheduleView(page, adminUid)
    await page.getByText('Seed User').click()
    await page.getByTestId('cancel-booking-btn').click()
    // No refund choice for unpaid bookings
    await expect(page.getByTestId('refund-choice')).not.toBeAttached()
    await expect(page.getByText('Cancel this booking?')).toBeVisible()
  })

  test('cancelling a paid booking shows the refund choice step first', async ({ page }) => {
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9],
      userId: 'uid-paid', userEmail: 'paid@bookit-test.internal', userName: 'Paid User',
      paymentStatus: 'paid',
    })
    await goToScheduleView(page, adminUid)
    await page.getByText('Paid User').click()
    await page.getByTestId('cancel-booking-btn').click()
    // Refund choice appears before the final confirm
    await expect(page.getByTestId('refund-choice')).toBeVisible()
    await expect(page.getByText('Cancel this booking?')).not.toBeAttached()
  })

  test('Back button on confirm step returns to refund choice for paid bookings', async ({ page }) => {
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9],
      userId: 'uid-paid', userEmail: 'paid@bookit-test.internal', userName: 'Paid User',
      paymentStatus: 'paid',
    })
    await goToScheduleView(page, adminUid)
    await page.getByText('Paid User').click()
    await page.getByTestId('cancel-booking-btn').click()
    await expect(page.getByTestId('refund-choice')).toBeVisible()
    // Advance to confirm step
    await page.getByTestId('refund-choice-next-btn').click()
    await expect(page.getByText('Cancel this booking?')).toBeVisible()
    // Back must return to refund_choice (not idle) for paid bookings
    await page.getByTestId('booking-detail-panel').getByRole('button', { name: 'Back' }).click()
    await expect(page.getByTestId('refund-choice')).toBeVisible()
  })

  test('completing a paid cancellation removes the booking from the grid', async ({ page }) => {
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9],
      userId: 'uid-paid', userEmail: 'paid@bookit-test.internal', userName: 'Paid User',
      paymentStatus: 'paid',
    })
    await goToScheduleView(page, adminUid)
    await page.getByText('Paid User').click()
    await page.getByTestId('cancel-booking-btn').click()
    await page.getByTestId('refund-choice-next-btn').click()
    await page.getByTestId('confirm-cancel-btn').click()
    await expect(page.getByRole('button', { name: /Paid User/ })).not.toBeAttached({ timeout: 8_000 })
    await expect(page.getByText('Booking Detail')).not.toBeAttached()
  })
})

// ─── Phase 5: Customer history ─────────────────────────────────────────────────

test.describe('Admin customer history', () => {
  let adminUid = ''

  test.beforeAll(async () => {
    const result = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUid = result.localId
  })

  test('customer history section is hidden when the customer has no previous bookings', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9] })
    await goToScheduleView(page, adminUid)
    await page.getByText('Seed User').click()
    const panel = page.getByTestId('booking-detail-panel')
    // Wait for the panel to fully render before asserting absence
    await expect(panel.getByText('Booking ID')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('customer-history')).not.toBeAttached()
  })

  test('customer history shows other bookings for the same customer and excludes the current one', async ({ page }) => {
    const HISTORY_EMAIL = 'history@bookit-test.internal'
    // Yesterday's booking (will appear in history)
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1', date: dateKeyDelta(-1), hours: [9],
      userId: 'uid-history', userEmail: HISTORY_EMAIL, userName: 'History User',
    })
    // Today's booking (will be open in the panel — must be excluded from history)
    await seedBookingForUser({
      facilityId: 'court-2', facilityName: 'Court 2', date: todayKey(), hours: [14],
      userId: 'uid-history', userEmail: HISTORY_EMAIL, userName: 'History User',
    })
    await goToScheduleView(page, adminUid)
    await page.getByText('History User').click()
    // History section must show the other booking (court-1, yesterday)
    await expect(page.getByTestId('customer-history')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('customer-history')).toContainText('Court 1')
    // And must not include the currently-open booking (court-2)
    await expect(page.getByTestId('customer-history')).not.toContainText('Court 2')
  })
})

// ─── Phase 5: Payment status display ──────────────────────────────────────────

test.describe('Admin payment status display', () => {
  let adminUid = ''

  test.beforeAll(async () => {
    const result = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUid = result.localId
  })

  test('"Paid" badge is shown in the detail panel for paid bookings', async ({ page }) => {
    await seedBookingForUser({
      facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9],
      userId: 'uid-paid', userEmail: 'paid@bookit-test.internal', userName: 'Paid User',
      paymentStatus: 'paid',
    })
    await goToScheduleView(page, adminUid)
    await page.getByText('Paid User').click()
    await expect(page.getByTestId('payment-badge')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('payment-badge')).toContainText('Paid')
  })

  test('no payment badge is shown for unpaid bookings', async ({ page }) => {
    await seedBooking({ facilityId: 'court-1', facilityName: 'Court 1', date: todayKey(), hours: [9] })
    await goToScheduleView(page, adminUid)
    await page.getByText('Seed User').click()
    await expect(page.getByTestId('booking-detail-panel')).toBeVisible()
    await expect(page.getByTestId('payment-badge')).not.toBeAttached()
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
