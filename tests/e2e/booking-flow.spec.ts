import { test, expect, type Page } from '@playwright/test'
import { clearFirestore, seedBusiness, createTestUser, seedBooking, seedBookingForUser, signInUser, todayKey, dateKeyDelta } from './helpers'

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESS      = '/paddleup'
const TEST_EMAIL    = 'e2etest@bookit.ph'
const TEST_PASSWORD = 'Test1234!'

// Court 1: ₱500/hr standard · ₱600/hr prime (≥ 5 PM)
const COURT_1      = 'court-1'
const COURT_1_NAME = 'Court 1'
const STD_RATE     = 500
const PRIME_RATE   = 600

// ─── Page helpers ─────────────────────────────────────────────────────────────

async function waitForSlots(page: Page) {
  // First try to catch the loading state (up to 2 s) so that if slot-grid-ready is
  // already visible from a previous date's load, we don't return early with stale data.
  await page.getByTestId('slot-grid-loading').waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {})
  await expect(page.getByTestId('slot-grid-ready')).toBeVisible({ timeout: 10_000 })
}

async function signIn(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Welcome back')).toBeVisible()
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  // Scope to the <form> so we don't accidentally click the "Sign In" tab button
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({
    timeout: 8_000,
  })
}

async function selectSlot(page: Page, label: string) {
  const slot = page.getByRole('button', { name: label }).first()
  await slot.waitFor({ state: 'visible' })
  await slot.click()  // single tap: immediately commits 1-hour selection
}

// Range selection: first click commits the start slot, second click extends to end.
async function selectRange(page: Page, fromLabel: string, toLabel: string) {
  const from = page.getByRole('button', { name: fromLabel }).first()
  const to   = page.getByRole('button', { name: toLabel }).first()
  await from.waitFor({ state: 'visible' })
  await from.click()  // first tap: selects start slot immediately
  await to.click()    // second tap: extends range to end
}

// Navigate to tomorrow so that all time slots are visible regardless of wall-clock time.
// AvailabilitySection filters today's slots with (h > currentHour); future dates are unfiltered.
// The date strip chips use name={dateKey} — tap tomorrow's chip directly.
async function selectTomorrow(page: Page) {
  const tom = new Date()
  tom.setDate(tom.getDate() + 1)
  const tomorrowKey = tom.toISOString().slice(0, 10)
  await page.locator(`button[name="${tomorrowKey}"]`).first().click()
}

// ─── Suite setup ─────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await createTestUser(TEST_EMAIL, TEST_PASSWORD, 'E2E Tester')
})

test.beforeEach(async () => {
  // Fresh Firestore state before every test — Auth users persist across the run.
  await clearFirestore()
  await seedBusiness()
})

// ─── Business page ────────────────────────────────────────────────────────────

test.describe('Business page', () => {
  test('renders the business name and location', async ({ page }) => {
    await page.goto(BUSINESS)
    await expect(page.getByRole('heading', { name: 'PaddleUp' }).first()).toBeVisible()
    // Target the sidebar identity-card <span> specifically — the address also appears
    // in a lg:hidden mobile strip (hidden) and an empty-state <p> inside aside.
    await expect(page.locator('aside span', { hasText: 'Katipunan Ave' })).toBeVisible()
  })

  test('shows court selector dropdown in the availability section', async ({ page }) => {
    await page.goto(BUSINESS)
    const selector = page.getByTestId('availability-section').locator('select')
    await expect(selector).toBeVisible()
    await expect(selector.locator('option', { hasText: 'Court 1' })).toHaveCount(1)
    await expect(selector.locator('option', { hasText: 'Court 2' })).toHaveCount(1)
    await expect(selector.locator('option', { hasText: 'Court 3 (Indoor)' })).toHaveCount(1)
    await expect(selector.locator('option', { hasText: 'Court 4 (Indoor)' })).toHaveCount(1)
  })

  test('shows Home and My Bookings navigation tabs', async ({ page }) => {
    await page.goto(BUSINESS)
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'My Bookings' })).toBeVisible()
  })
})

// ─── Slot grid ────────────────────────────────────────────────────────────────

test.describe('Slot grid', () => {
  test('groups slots into Morning / Afternoon / Evening sections', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await expect(page.getByText('Morning')).toBeVisible()
    await expect(page.getByText('Afternoon')).toBeVisible()
    await expect(page.getByText('Evening')).toBeVisible()
  })

  test('Evening section shows Prime rate badge with the prime hourly price', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await expect(page.getByText(/prime/i).first()).toBeVisible()
    await expect(page.getByText('₱600/hr')).toBeVisible()
  })

  test('available slots are labelled with their hour and are enabled', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    const slot = page.getByRole('button', { name: '8 AM' }).first()
    await expect(slot).toBeVisible()
    await expect(slot).toBeEnabled()
  })

  test('a fully booked court shows every slot as a disabled "Booked" button', async ({ page }) => {
    // Seed the full span of possible operating hours (5 AM–10 PM) for tomorrow.
    // Hours outside the day's actual schedule are ignored by the slot renderer.
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         dateKeyDelta(1),
      hours:        Array.from({ length: 18 }, (_, i) => i + 5),
    })

    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)

    const bookedBtns = page.getByRole('button', { name: 'Booked' })
    await expect(bookedBtns.first()).toBeVisible()

    const count = await bookedBtns.count()
    for (let i = 0; i < count; i++) {
      await expect(bookedBtns.nth(i)).toBeDisabled()
    }
  })

  test('a single booked hour shows "Booked" while adjacent slots stay available', async ({ page }) => {
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         dateKeyDelta(1),
      hours:        [10],
    })

    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)

    await expect(page.getByRole('button', { name: 'Booked' })).toBeVisible()
    await expect(page.getByRole('button', { name: '9 AM' })).toBeEnabled()
    await expect(page.getByRole('button', { name: '11 AM' })).toBeEnabled()
  })
})

// ─── Past slot filtering ──────────────────────────────────────────────────────

test.describe('Past slot filtering', () => {
  test('slots from earlier today are not shown in the grid', async ({ page }) => {
    // Lock the browser clock to noon so 6 AM is always in the past regardless
    // of when (or in which timezone) CI runs.
    const noon = new Date()
    noon.setHours(12, 0, 0, 0)
    await page.clock.setFixedTime(noon)
    await page.goto(BUSINESS)
    await waitForSlots(page)
    await expect(page.getByRole('button', { name: '6 AM' })).not.toBeVisible()
  })

  test('switching to a future date reveals early morning slots', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    // On a future date the past-slot filter (h > currentHour) is inactive —
    // all slots render, including the first slot of the day.
    await expect(page.getByRole('button', { name: '6 AM' }).first()).toBeVisible()
  })

  test('a future date shows all three period sections including Morning', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    // PaddleUp 6 AM–10 PM (or later) always spans Morning (< 12), Afternoon (12–16),
    // and Evening (≥ 17). All three section headers must appear on a future date.
    await expect(page.getByText('Morning')).toBeVisible()
    await expect(page.getByText('Afternoon')).toBeVisible()
    await expect(page.getByText('Evening')).toBeVisible()
  })
})

// ─── Slot selection ───────────────────────────────────────────────────────────

test.describe('Slot selection', () => {
  test('clicking a slot reveals the action bar with court, time range, and price', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await selectSlot(page, '8 AM')

    const bar = page.getByTestId('action-bar')
    await expect(bar.getByText(COURT_1_NAME)).toBeVisible()
    await expect(bar.getByText('8 AM – 9 AM', { exact: false })).toBeVisible()
    await expect(bar.getByText(`₱${STD_RATE.toLocaleString()}`)).toBeVisible()
    await expect(page.getByRole('button', { name: /book now/i })).toBeVisible()
  })

  test('selecting a prime-time slot shows the prime hourly rate', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await selectSlot(page, '5 PM') // hour 17 = first prime-time slot for Court 1

    await expect(page.getByTestId('action-bar').getByText(`₱${PRIME_RATE.toLocaleString()}`)).toBeVisible()
  })

  test('clicking the same slot again clears the selection and hides the action bar', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await selectSlot(page, '8 AM')
    await expect(page.getByRole('button', { name: /book now/i })).toBeVisible()

    await selectSlot(page, '8 AM') // toggle off

    await expect(page.getByRole('button', { name: /book now/i })).not.toBeVisible()
  })

  test('selecting a range of three slots totals correctly', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await selectRange(page, '8 AM', '10 AM')

    // 3 × ₱500 = ₱1,500
    const bar3 = page.getByTestId('action-bar')
    await expect(bar3.getByText('8 AM – 11 AM', { exact: false })).toBeVisible()
    await expect(bar3.getByText('3 hrs', { exact: false })).toBeVisible()
    await expect(bar3.getByText('₱1,500')).toBeVisible()
  })

  test('range selection stops at a booked slot and only selects hours up to it', async ({ page }) => {
    // Hour 9 is booked — tapping 8 AM then 10 AM should only capture 8 AM
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         dateKeyDelta(1),
      hours:        [9],
    })

    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await selectRange(page, '8 AM', '10 AM')

    await expect(page.getByText('8 AM – 9 AM')).toBeVisible()
    await expect(page.getByText('1 hr')).toBeVisible()
  })

  test('clicking a different slot extends the range from the original start', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)

    await selectSlot(page, '8 AM')
    await expect(page.getByTestId('action-bar').getByText('8 AM – 9 AM', { exact: false })).toBeVisible()

    // Tapping 10 AM extends the range from 8 AM to 10 AM (3 hours)
    await selectSlot(page, '10 AM')
    await expect(page.getByTestId('action-bar').getByText('8 AM – 11 AM', { exact: false })).toBeVisible()
  })

  test('clicking outside the availability section and action bar clears the selection', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)

    await selectSlot(page, '8 AM')
    await expect(page.getByRole('button', { name: /book now/i })).toBeVisible()

    // Click the page header — outside both the slot grid and the action bar
    await page.locator('header').getByText('bookit').click()

    await expect(page.getByRole('button', { name: /book now/i })).not.toBeVisible()
  })
})

// ─── Court switching ──────────────────────────────────────────────────────────

test.describe('Court switching', () => {
  test('switching to a different court clears the active selection', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)

    await selectSlot(page, '8 AM')
    await expect(page.getByRole('button', { name: /book now/i })).toBeVisible()

    // Switch to Court 2 via the court selector dropdown in AvailabilitySection
    await page.getByTestId('availability-section').locator('select').selectOption({ label: 'Court 2' })
    await expect(page.getByRole('button', { name: /book now/i })).not.toBeVisible()
  })

  test('switching courts loads the new court pricing', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)

    // Court 3 (Indoor) standard rate = ₱700/hr
    await page.getByTestId('availability-section').locator('select').selectOption({ label: 'Court 3 (Indoor)' })
    await waitForSlots(page)

    await expect(page.getByTestId('availability-section').getByText(/₱700/)).toBeVisible()
  })
})

// ─── Calendar – 30-day booking window ────────────────────────────────────────

test.describe('Calendar – 30-day booking window', () => {
  test('clicking the "More" calendar button opens the calendar', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.locator('[data-testid="calendar-btn"]').click()
    const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })
    // Match "April 2026" (calendar header) but not "April 25, 2026" (date button)
    await expect(page.getByText(new RegExp(monthName + ' \\d{4}'))).toBeVisible()
  })

  test("today's date is selectable in the calendar", async ({ page }) => {
    await page.goto(BUSINESS)
    await page.locator('[data-testid="calendar-btn"]').click()

    const dayNum = String(new Date().getDate())
    const todayBtn = page.locator('button').filter({ hasText: new RegExp(`^${dayNum}$`) }).first()
    await expect(todayBtn).toBeEnabled()
  })

  test('a date 31 days from now is disabled in the calendar', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.locator('[data-testid="calendar-btn"]').click()

    const target = new Date()
    target.setDate(target.getDate() + 31)

    // Navigate to next month if the 31st-day-ahead falls there
    if (target.getMonth() !== new Date().getMonth()) {
      await page.getByLabel('Go to next month').click()
    }

    const dayNum = String(target.getDate())
    const disabledBtn = page.locator(`button[disabled]`)
      .filter({ hasText: new RegExp(`^${dayNum}$`) })
      .first()
    await expect(disabledBtn).toBeVisible()
  })

  test('yesterday is disabled in the calendar', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.locator('[data-testid="calendar-btn"]').click()

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    // Only verifiable without month navigation when yesterday is in the current month
    if (yesterday.getMonth() === new Date().getMonth()) {
      const dayNum = String(yesterday.getDate())
      const disabledBtn = page.locator(`button[disabled]`)
        .filter({ hasText: new RegExp(`^${dayNum}$`) })
        .first()
      await expect(disabledBtn).toBeVisible()
    }
  })
})

// ─── Authentication gate ──────────────────────────────────────────────────────

test.describe('Authentication gate', () => {
  test('clicking Book Now without auth opens the sign-in modal', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await selectSlot(page, '8 AM')
    await page.getByRole('button', { name: /book now/i }).click()

    await expect(page.getByText('Welcome back')).toBeVisible()
  })

  test('auth modal shows email / password fields and Google sign-in button', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await selectSlot(page, '8 AM')
    await page.getByRole('button', { name: /book now/i }).click()

    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
    await expect(page.getByPlaceholder('••••••••')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })

  test('wrong password shows an inline error message', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByPlaceholder('you@example.com').fill(TEST_EMAIL)
    await page.getByPlaceholder('••••••••').fill('wrong-password-123')
    await page.locator('form').getByRole('button', { name: /sign in/i }).click()

    await expect(
      page.getByText(/incorrect email or password/i)
    ).toBeVisible({ timeout: 5_000 })
  })

  test('valid credentials close the modal and show the user in the header', async ({ page }) => {
    await page.goto(BUSINESS)
    await signIn(page)

    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible()
    await expect(page.getByText('Welcome back')).not.toBeVisible()
  })
})

// ─── Auth modal — password visibility toggle ──────────────────────────────────

test.describe('Auth modal — password visibility', () => {
  async function openSignInModal(page: Page) {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Welcome back')).toBeVisible()
  }

  test('password field is hidden by default', async ({ page }) => {
    await openSignInModal(page)

    await expect(page.getByPlaceholder('••••••••')).toHaveAttribute('type', 'password')
  })

  test('"Show password" button reveals the password as plain text', async ({ page }) => {
    await openSignInModal(page)
    await page.getByPlaceholder('••••••••').fill('mySecret1!')

    await page.getByLabel('Show password').click()

    await expect(page.getByPlaceholder('••••••••')).toHaveAttribute('type', 'text')
  })

  test('"Hide password" button re-masks the password after it was revealed', async ({ page }) => {
    await openSignInModal(page)

    await page.getByLabel('Show password').click()
    await page.getByLabel('Hide password').click()

    await expect(page.getByPlaceholder('••••••••')).toHaveAttribute('type', 'password')
  })

  test('toggle button aria-label updates to "Hide password" when password is visible', async ({ page }) => {
    await openSignInModal(page)

    await expect(page.getByLabel('Show password')).toBeVisible()

    await page.getByLabel('Show password').click()

    await expect(page.getByLabel('Hide password')).toBeVisible()
    await expect(page.getByLabel('Show password')).not.toBeAttached()
  })

  test('toggle works in Sign Up mode', async ({ page }) => {
    await openSignInModal(page)
    await page.getByRole('button', { name: 'Sign Up' }).click()

    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()

    await page.getByLabel('Show password').click()

    await expect(page.getByPlaceholder('••••••••')).toHaveAttribute('type', 'text')
  })
})

// ─── Booking confirmation ─────────────────────────────────────────────────────

test.describe('Booking confirmation', () => {
  test('confirm modal shows venue, court, date, time, and standard price', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await signIn(page)

    await selectSlot(page, '8 AM')
    await page.getByRole('button', { name: /book now/i }).click()

    const modal = page.getByTestId('booking-modal')
    await expect(modal.getByText('Confirm Booking')).toBeVisible()
    await expect(modal.getByText('PaddleUp')).toBeVisible()
    await expect(modal.getByText(COURT_1_NAME)).toBeVisible()
    await expect(modal.getByText('8 AM – 9 AM', { exact: false })).toBeVisible()
    // Price line: ₱500 × 1 hr
    await expect(modal.getByText(`₱${STD_RATE.toLocaleString()}`).first()).toBeVisible()
  })

  test('confirm modal itemises prime-time hours separately', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await signIn(page)

    // Tap 4 PM (standard) then 5 PM (prime): 1 standard + 1 prime-time hour
    await selectRange(page, '4 PM', '5 PM')
    await page.getByRole('button', { name: /book now/i }).click()

    // Both rate tiers should appear in the breakdown
    const modal2 = page.getByTestId('booking-modal')
    await expect(modal2.getByText('Prime')).toBeVisible()
    await expect(modal2.getByText(`₱${STD_RATE.toLocaleString()}`).first()).toBeVisible()
    await expect(modal2.getByText(`₱${PRIME_RATE.toLocaleString()}`).first()).toBeVisible()
  })

  test('confirming a booking shows the success state with 🎉', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await signIn(page)

    await selectSlot(page, '8 AM')
    await page.getByRole('button', { name: /book now/i }).click()
    await page.getByRole('button', { name: /confirm/i }).click()

    await expect(page.getByText('Booking Confirmed!')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('🎉')).toBeVisible()
  })

  test('closing the success modal navigates to My Bookings with the new booking', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await signIn(page)

    await selectSlot(page, '8 AM')
    await page.getByRole('button', { name: /book now/i }).click()
    await page.getByRole('button', { name: /confirm/i }).click()
    await expect(page.getByText('Booking Confirmed!')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Done' }).click()

    // onSuccess sets the active tab to "My Bookings" — booking card should appear
    await expect(page.getByText('Confirmed').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(COURT_1_NAME).first()).toBeVisible()
  })
})

// ─── Double-booking conflict ───────────────────────────────────────────────────

test.describe('Double-booking conflict', () => {
  test('shows an error when the slot is taken between selection and confirmation', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await signIn(page)

    // User selects 8 AM — slot appears available
    await selectSlot(page, '8 AM')
    await page.getByRole('button', { name: /book now/i }).click()
    await expect(page.getByText('Confirm Booking')).toBeVisible()

    // Race condition: another user books the same slot before we hit Confirm
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         dateKeyDelta(1),
      hours:        [8],
    })

    await page.getByRole('button', { name: /confirm/i }).click()

    // The Firestore transaction re-reads and finds the conflict
    await expect(
      page.getByText(/just booked by someone else/i)
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ─── Court occupancy badges ───────────────────────────────────────────────────

// Returns today's bookable slots for PaddleUp, derived from businesses.ts operating hours.
// Used to compute dynamic seeding counts so badge thresholds hold on any day of the week.
function paddleUpTodaySlots(): number[] {
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const schedule: Record<string, { open: number; close: number }> = {
    Monday:    { open: 6, close: 22 },
    Tuesday:   { open: 6, close: 22 },
    Wednesday: { open: 6, close: 22 },
    Thursday:  { open: 6, close: 22 },
    Friday:    { open: 6, close: 23 },
    Saturday:  { open: 5, close: 23 },
    Sunday:    { open: 5, close: 22 },
  }
  const { open, close } = schedule[dayName] ?? { open: 6, close: 22 }
  return Array.from({ length: close - open }, (_, i) => i + open)
}

test.describe('Court occupancy badges', () => {
  test('no badge when a court has no bookings today', async ({ page }) => {
    // clearFirestore in beforeEach ensures zero bookings — no seed needed
    await page.goto(BUSINESS)
    await waitForSlots(page)
    await expect(page.getByText('Busy', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Almost full', { exact: true })).not.toBeVisible()
  })

  test('no badge when occupancy is below 60%', async ({ page }) => {
    const slots = paddleUpTodaySlots()
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         todayKey(),
      hours:        slots.slice(0, Math.floor(slots.length * 0.5)), // 50% — below threshold
    })

    await page.goto(BUSINESS)
    await waitForSlots(page)
    await expect(page.getByText('Busy', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Almost full', { exact: true })).not.toBeVisible()
  })

  test('shows amber Busy badge when court is 60–79% booked today', async ({ page }) => {
    const slots = paddleUpTodaySlots()
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         todayKey(),
      hours:        slots.slice(0, Math.round(slots.length * 0.65)), // 65% — safely inside Busy band
    })

    await page.goto(BUSINESS)
    await expect(page.getByText('Busy', { exact: true })).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('Almost full', { exact: true })).not.toBeVisible()
  })

  test('shows red Almost full badge when court is ≥80% booked today', async ({ page }) => {
    const slots = paddleUpTodaySlots()
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         todayKey(),
      hours:        slots.slice(0, Math.ceil(slots.length * 0.85)), // 85% — above Almost full threshold
    })

    await page.goto(BUSINESS)
    await expect(page.getByText('Almost full', { exact: true })).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('Busy', { exact: true })).not.toBeVisible()
  })

  test('badge is per-court: heavily booked court shows badge while others show none', async ({ page }) => {
    const slots = paddleUpTodaySlots()
    // Court 1 at 85% → "Almost full"; all other courts have no bookings
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         todayKey(),
      hours:        slots.slice(0, Math.ceil(slots.length * 0.85)),
    })

    await page.goto(BUSINESS)
    // Court 1's badge appears
    await expect(page.getByText('Almost full', { exact: true })).toBeVisible({ timeout: 8_000 })
    // Exactly one "Almost full" badge — confirms other courts did not inherit it
    await expect(page.getByText('Almost full', { exact: true })).toHaveCount(1)
    // No court is in the Busy band
    await expect(page.getByText('Busy', { exact: true })).not.toBeVisible()
  })
})

// ─── My Bookings tab ─────────────────────────────────────────────────────────

test.describe('My Bookings tab', () => {
  test('shows a sign-in prompt when the user is not authenticated', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'My Bookings' }).click()

    await expect(page.getByText('Sign in to view your bookings')).toBeVisible()
    await expect(page.getByText('Your confirmed bookings will appear here')).toBeVisible()
  })

  test('shows empty state when an authenticated user has no bookings', async ({ page }) => {
    await page.goto(BUSINESS)
    await signIn(page)
    await page.getByRole('button', { name: 'My Bookings' }).click()

    await expect(page.getByText('No bookings yet')).toBeVisible({ timeout: 5_000 })
  })

  test('past confirmed booking appears in Completed section without a cancel button', async ({ page }) => {
    const { localId } = await signInUser(TEST_EMAIL, TEST_PASSWORD)
    await seedBookingForUser({
      facilityId: COURT_1, facilityName: COURT_1_NAME,
      date: dateKeyDelta(-1), hours: [9, 10],
      userId: localId, userEmail: TEST_EMAIL, userName: 'E2E Tester',
    })

    await page.goto(BUSINESS)
    await signIn(page)
    await page.getByRole('button', { name: 'My Bookings' }).click()

    await expect(page.getByRole('heading', { name: 'Completed' })).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('span', { hasText: 'Completed' })).toBeVisible()
    await expect(page.getByRole('button', { name: /cancel booking/i })).not.toBeAttached()
    await expect(page.getByRole('heading', { name: 'Upcoming' })).not.toBeAttached()
  })

  test('future booking appears in Upcoming section with a cancel button', async ({ page }) => {
    const { localId } = await signInUser(TEST_EMAIL, TEST_PASSWORD)
    await seedBookingForUser({
      facilityId: COURT_1, facilityName: COURT_1_NAME,
      date: dateKeyDelta(1), hours: [9, 10],
      userId: localId, userEmail: TEST_EMAIL, userName: 'E2E Tester',
    })

    await page.goto(BUSINESS)
    await signIn(page)
    await page.getByRole('button', { name: 'My Bookings' }).click()

    await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('span', { hasText: 'Confirmed' })).toBeVisible()
    await expect(page.getByRole('button', { name: /cancel booking/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Completed' })).not.toBeAttached()
  })

  test('confirmed booking can be cancelled from My Bookings', async ({ page }) => {
    await page.goto(BUSINESS)
    await selectTomorrow(page)
    await waitForSlots(page)
    await signIn(page)

    // Create a booking first
    await selectSlot(page, '8 AM')
    await page.getByRole('button', { name: /book now/i }).click()
    await page.getByRole('button', { name: /confirm/i }).click()
    await expect(page.getByText('Booking Confirmed!')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Done' }).click()

    // Cancel it — opens the CancelBookingModal
    await page.getByRole('button', { name: /cancel booking/i }).click()

    // Select "Keep as credits" and confirm
    await expect(page.getByRole('heading', { name: 'Cancel Booking' })).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: /keep as credits/i }).click()
    // Wait for the choice state to propagate before the confirm button becomes enabled
    await expect(page.getByRole('button', { name: /confirm cancel/i })).toBeEnabled({ timeout: 3_000 })
    await page.getByRole('button', { name: /confirm cancel/i }).click()

    // Dismiss success state
    await expect(page.getByRole('heading', { name: 'Booking Cancelled' })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Done' }).click()

    // Status badge changes to "Cancelled"
    await expect(page.locator('span', { hasText: 'Cancelled' })).toBeVisible({ timeout: 5_000 })
  })

  // hours [23] (11 PM – midnight) end at hour 24, which now.getHours() never reaches — safe for any CI run.
  // The "already elapsed" test uses yesterday instead of a same-day past hour because CI runs at
  // ~00:30 UTC; no fixed hour is guaranteed to have elapsed at that time. The same-day hour
  // branch of isBookingPast is covered by unit tests where Date can be mocked.

  test('past booking is shown as Completed', async ({ page }) => {
    const { localId } = await signInUser(TEST_EMAIL, TEST_PASSWORD)
    await seedBookingForUser({
      facilityId: COURT_1, facilityName: COURT_1_NAME,
      date: dateKeyDelta(-1), hours: [9, 10],
      userId: localId, userEmail: TEST_EMAIL, userName: 'E2E Tester',
    })

    await page.goto(BUSINESS)
    await signIn(page)
    await page.getByRole('button', { name: 'My Bookings' }).click()

    await expect(page.getByRole('heading', { name: 'Completed' })).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('span', { hasText: 'Completed' })).toBeVisible()
    await expect(page.getByRole('button', { name: /cancel booking/i })).not.toBeAttached()
    await expect(page.getByRole('heading', { name: 'Upcoming' })).not.toBeAttached()
  })

  test('same-day booking whose hours have not yet elapsed is shown as Upcoming', async ({ page }) => {
    const { localId } = await signInUser(TEST_EMAIL, TEST_PASSWORD)
    await seedBookingForUser({
      facilityId: COURT_1, facilityName: COURT_1_NAME,
      date: todayKey(), hours: [23],
      userId: localId, userEmail: TEST_EMAIL, userName: 'E2E Tester',
    })

    await page.goto(BUSINESS)
    await signIn(page)
    await page.getByRole('button', { name: 'My Bookings' }).click()

    await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('span', { hasText: 'Confirmed' })).toBeVisible()
    await expect(page.getByRole('button', { name: /cancel booking/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Completed' })).not.toBeAttached()
  })

  test('past and upcoming bookings appear in their respective sections simultaneously', async ({ page }) => {
    const { localId } = await signInUser(TEST_EMAIL, TEST_PASSWORD)
    await seedBookingForUser({
      facilityId: COURT_1, facilityName: COURT_1_NAME,
      date: dateKeyDelta(-1), hours: [9, 10],
      userId: localId, userEmail: TEST_EMAIL, userName: 'E2E Tester',
    })
    await seedBookingForUser({
      facilityId: COURT_1, facilityName: COURT_1_NAME,
      date: dateKeyDelta(1), hours: [9, 10],
      userId: localId, userEmail: TEST_EMAIL, userName: 'E2E Tester',
    })

    await page.goto(BUSINESS)
    await signIn(page)
    await page.getByRole('button', { name: 'My Bookings' }).click()

    await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('heading', { name: 'Completed' })).toBeVisible()
    await expect(page.locator('span', { hasText: 'Confirmed' })).toHaveCount(1)
    await expect(page.locator('span', { hasText: 'Completed' })).toHaveCount(1)
  })
})

// ─── Business page navigation ─────────────────────────────────────────────────

test.describe('Business page navigation', () => {
  test('bookit logo navigates to landing page (unauthenticated)', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('link', { name: 'bookit' }).click()
    await page.waitForURL('/', { timeout: 5_000 })
  })

  test('bookit logo navigates to landing page (signed in)', async ({ page }) => {
    await page.goto(BUSINESS)
    await signIn(page)
    await page.getByRole('link', { name: 'bookit' }).click()
    await page.waitForURL('/', { timeout: 5_000 })
  })

  test('user pill links to /account when signed in', async ({ page }) => {
    await page.goto(BUSINESS)
    await signIn(page)
    const pill = page.locator('a[href="/account"]')
    await expect(pill).toBeVisible({ timeout: 5_000 })
    await pill.click()
    await page.waitForURL('/account', { timeout: 5_000 })
  })

  test('user pill shows the user initial in the avatar', async ({ page }) => {
    await page.goto(BUSINESS)
    await signIn(page)
    const avatar = page.locator('a[href="/account"] div.rounded-full')
    await expect(avatar).toHaveText('E', { timeout: 5_000 })
  })

  test('no user pill when not signed in', async ({ page }) => {
    await page.goto(BUSINESS)
    await expect(page.locator('a[href="/account"]')).not.toBeAttached()
  })
})
