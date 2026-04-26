import { test, expect, type Page } from '@playwright/test'
import {
  clearFirestore,
  createTestUser,
  signInUser,
  seedAdminDoc,
  seedBooking,
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

    // The X button is the only button inside the panel header
    await page.getByTestId('booking-detail-panel').locator('button').click()

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
