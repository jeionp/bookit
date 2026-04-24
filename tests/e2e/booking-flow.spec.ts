import { test, expect, type Page } from '@playwright/test'
import { clearFirestore, createTestUser, seedBooking, todayKey } from './helpers'

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
  await expect(page.getByText('Loading availability…')).not.toBeVisible({
    timeout: 10_000,
  })
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
  await slot.click()
}

async function dragSlots(page: Page, fromLabel: string, toLabel: string) {
  const from = page.getByRole('button', { name: fromLabel }).first()
  const to   = page.getByRole('button', { name: toLabel }).first()

  const boxFrom = await from.boundingBox()
  const boxTo   = await to.boundingBox()
  if (!boxFrom || !boxTo) throw new Error('Could not get bounding box for drag slots')

  const cx = (b: { x: number; width: number }) => b.x + b.width / 2
  const cy = (b: { y: number; height: number }) => b.y + b.height / 2

  await page.mouse.move(cx(boxFrom), cy(boxFrom))
  await page.mouse.down()
  await page.mouse.move(cx(boxTo), cy(boxTo), { steps: 12 })
  await page.mouse.up()
}

// ─── Suite setup ─────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await createTestUser(TEST_EMAIL, TEST_PASSWORD, 'E2E Tester')
})

test.beforeEach(async () => {
  // Fresh Firestore state before every test — Auth users persist across the run.
  await clearFirestore()
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

  test('shows all four court tabs in the availability section', async ({ page }) => {
    await page.goto(BUSINESS)
    // These are the compact tab buttons inside AvailabilitySection
    await expect(page.getByRole('button', { name: 'Court 1' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Court 2' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Court 3 (Indoor)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Court 4 (Indoor)' })).toBeVisible()
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
    await waitForSlots(page)
    await expect(page.getByText('Morning')).toBeVisible()
    await expect(page.getByText('Afternoon')).toBeVisible()
    await expect(page.getByText('Evening')).toBeVisible()
  })

  test('Evening section shows Prime rate badge with the prime hourly price', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)
    await expect(page.getByText(/prime/i).first()).toBeVisible()
    await expect(page.getByText('₱600/hr')).toBeVisible()
  })

  test('available slots are labelled with their hour and are enabled', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)
    const slot = page.getByRole('button', { name: '8 AM' }).first()
    await expect(slot).toBeVisible()
    await expect(slot).toBeEnabled()
  })

  test('a fully booked court shows every slot as a disabled "Booked" button', async ({ page }) => {
    // PaddleUp is open Mon–Thu 6 AM–10 PM → hours 6–21
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         todayKey(),
      hours:        Array.from({ length: 16 }, (_, i) => i + 6),
    })

    await page.goto(BUSINESS)
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
      date:         todayKey(),
      hours:        [10],
    })

    await page.goto(BUSINESS)
    await waitForSlots(page)

    await expect(page.getByRole('button', { name: 'Booked' })).toBeVisible()
    await expect(page.getByRole('button', { name: '9 AM' })).toBeEnabled()
    await expect(page.getByRole('button', { name: '11 AM' })).toBeEnabled()
  })
})

// ─── Slot selection ───────────────────────────────────────────────────────────

test.describe('Slot selection', () => {
  test('clicking a slot reveals the action bar with court, time range, and price', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)
    await selectSlot(page, '8 AM')

    await expect(page.getByText(COURT_1_NAME)).toBeVisible()
    await expect(page.getByText('8 AM – 9 AM')).toBeVisible()
    await expect(page.getByText(`₱${STD_RATE.toLocaleString()}`)).toBeVisible()
    await expect(page.getByRole('button', { name: /book now/i })).toBeVisible()
  })

  test('selecting a prime-time slot shows the prime hourly rate', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)
    await selectSlot(page, '5 PM') // hour 17 = first prime-time slot for Court 1

    await expect(page.getByText(`₱${PRIME_RATE.toLocaleString()}`)).toBeVisible()
  })

  test('clicking the same slot again clears the selection and hides the action bar', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)
    await selectSlot(page, '8 AM')
    await expect(page.getByRole('button', { name: /book now/i })).toBeVisible()

    await selectSlot(page, '8 AM') // toggle off

    await expect(page.getByRole('button', { name: /book now/i })).not.toBeVisible()
  })

  test('dragging across three slots selects all and totals correctly', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)
    await dragSlots(page, '8 AM', '10 AM')

    // 3 × ₱500 = ₱1,500
    await expect(page.getByText('8 AM – 11 AM')).toBeVisible()
    await expect(page.getByText('3 hrs')).toBeVisible()
    await expect(page.getByText('₱1,500')).toBeVisible()
  })

  test('drag stops at a booked slot and only selects hours up to it', async ({ page }) => {
    // Hour 9 is booked — dragging 8 AM → 10 AM should only capture 8 AM
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         todayKey(),
      hours:        [9],
    })

    await page.goto(BUSINESS)
    await waitForSlots(page)
    await dragSlots(page, '8 AM', '10 AM')

    await expect(page.getByText('8 AM – 9 AM')).toBeVisible()
    await expect(page.getByText('1 hr')).toBeVisible()
  })
})

// ─── Court switching ──────────────────────────────────────────────────────────

test.describe('Court switching', () => {
  test('switching to a different court clears the active selection', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)

    await selectSlot(page, '8 AM')
    await expect(page.getByRole('button', { name: /book now/i })).toBeVisible()

    // Switch to Court 2 via the compact tab row in AvailabilitySection
    await page.getByRole('button', { name: 'Court 2' }).click()
    await expect(page.getByRole('button', { name: /book now/i })).not.toBeVisible()
  })

  test('switching courts loads the new court pricing', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)

    // Court 3 (Indoor) standard rate = ₱700/hr
    await page.getByRole('button', { name: 'Court 3 (Indoor)' }).click()
    await waitForSlots(page)

    await expect(page.getByText(/₱700/)).toBeVisible()
  })
})

// ─── Calendar – 30-day booking window ────────────────────────────────────────

test.describe('Calendar – 30-day booking window', () => {
  test('clicking the date picker opens the calendar', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.locator('button').filter({ hasText: 'Today' }).click()
    const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })
    await expect(page.getByText(new RegExp(monthName))).toBeVisible()
  })

  test("today's date is selectable", async ({ page }) => {
    await page.goto(BUSINESS)
    await page.locator('button').filter({ hasText: 'Today' }).click()

    const dayNum = String(new Date().getDate())
    const todayBtn = page.locator('button').filter({ hasText: new RegExp(`^${dayNum}$`) }).first()
    await expect(todayBtn).toBeEnabled()
  })

  test('a date 31 days from now is disabled', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.locator('button').filter({ hasText: 'Today' }).click()

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

  test('yesterday is disabled', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.locator('button').filter({ hasText: 'Today' }).click()

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
    await waitForSlots(page)
    await selectSlot(page, '8 AM')
    await page.getByRole('button', { name: /book now/i }).click()

    await expect(page.getByText('Welcome back')).toBeVisible()
  })

  test('auth modal shows email / password fields and Google sign-in button', async ({ page }) => {
    await page.goto(BUSINESS)
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

// ─── Booking confirmation ─────────────────────────────────────────────────────

test.describe('Booking confirmation', () => {
  test('confirm modal shows venue, court, date, time, and standard price', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)
    await signIn(page)

    await selectSlot(page, '8 AM')
    await page.getByRole('button', { name: /book now/i }).click()

    await expect(page.getByText('Confirm Booking')).toBeVisible()
    await expect(page.getByText('PaddleUp')).toBeVisible()
    await expect(page.getByText(COURT_1_NAME)).toBeVisible()
    await expect(page.getByText('8 AM – 9 AM')).toBeVisible()
    // Price line: ₱500 × 1 hr
    await expect(page.getByText(`₱${STD_RATE.toLocaleString()}`).first()).toBeVisible()
  })

  test('confirm modal itemises prime-time hours separately', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)
    await signIn(page)

    // Drag 4 PM (standard) → 6 PM (prime): 1 standard + 2 prime-time hours
    await dragSlots(page, '4 PM', '6 PM')
    await page.getByRole('button', { name: /book now/i }).click()

    // Both rate tiers should appear in the breakdown
    await expect(page.getByText('Prime')).toBeVisible()
    await expect(page.getByText(`₱${STD_RATE.toLocaleString()}`).first()).toBeVisible()
    await expect(page.getByText(`₱${PRIME_RATE.toLocaleString()}`).first()).toBeVisible()
  })

  test('confirming a booking shows the success state with 🎉', async ({ page }) => {
    await page.goto(BUSINESS)
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
      date:         todayKey(),
      hours:        [8],
    })

    await page.getByRole('button', { name: /confirm/i }).click()

    // The Firestore transaction re-reads and finds the conflict
    await expect(
      page.getByText(/just booked by someone else/i)
    ).toBeVisible({ timeout: 10_000 })
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

  test('confirmed booking can be cancelled from My Bookings', async ({ page }) => {
    await page.goto(BUSINESS)
    await waitForSlots(page)
    await signIn(page)

    // Create a booking first
    await selectSlot(page, '8 AM')
    await page.getByRole('button', { name: /book now/i }).click()
    await page.getByRole('button', { name: /confirm/i }).click()
    await expect(page.getByText('Booking Confirmed!')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Done' }).click()

    // Cancel it
    await page.getByRole('button', { name: /cancel booking/i }).click()

    // Status badge changes to "Cancelled"
    await expect(page.getByText('Cancelled')).toBeVisible({ timeout: 5_000 })
  })
})
