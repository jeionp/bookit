/**
 * E2E tests for "Instant slot selection" (Option A).
 *
 * Key behaviours under test:
 *  - First tap commits immediately: action bar with Book Now appears after ONE tap.
 *  - No intermediate / pending-start phase exists.
 *  - Extending: tapping a second slot while one is selected stretches or shrinks
 *    the range, anchored to the first-tapped slot.
 *  - Backwards extension: tapping a slot BEFORE the first one extends backwards.
 *  - Tap-to-deselect: tapping the currently active (committed) slot clears selection.
 *  - Click-outside clears: clicking outside both the availability section and the
 *    action bar dismisses the selection.
 *  - Booked slots are disabled and cannot be selected.
 *  - Book Now must NOT appear before any tap.
 *
 * Prerequisites:
 *   firebase emulators:start  (Auth 9099, Firestore 8080)
 *   npm run dev               (or Playwright webServer)
 */

import { test, expect, type Page } from '@playwright/test'
import {
  clearFirestore,
  seedBusiness,
  seedBooking,
  dateKeyDelta,
} from './helpers'

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESS   = '/paddleup'
const COURT_1    = 'court-1'
const COURT_1_NAME = 'Court 1'
const STD_RATE   = 500  // ₱500/hr standard (Court 1, pre-5 PM)

// ─── Shared page helpers ───────────────────────────────────────────────────────

/** Wait for the slot grid to finish loading. */
async function waitForSlots(page: Page): Promise<void> {
  // Catch the loading flash so we don't return with stale data from a previous date.
  await page.getByTestId('slot-grid-loading').waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {})
  await expect(page.getByTestId('slot-grid-ready')).toBeVisible({ timeout: 10_000 })
}

/**
 * Navigate to tomorrow's date chip so all time slots are visible regardless of
 * wall-clock time. The date-strip chip carries name="YYYY-MM-DD".
 */
async function selectTomorrow(page: Page): Promise<void> {
  const tom = new Date()
  tom.setDate(tom.getDate() + 1)
  const tomorrowKey = tom.toISOString().slice(0, 10)
  await page.locator(`button[name="${tomorrowKey}"]`).first().click()
  await waitForSlots(page)
}

/** Return the Nth available (non-disabled) slot button (0-indexed). */
function availableSlot(page: Page, index: number) {
  return page.locator('button[data-slot-hour]:not([disabled])').nth(index)
}

/** Return the slot button for a specific hour integer. */
function slotByHour(page: Page, hour: number) {
  return page.locator(`button[data-slot-hour="${hour}"]:not([disabled])`)
}

/** The action bar element (always in the DOM; may not be visible). */
function actionBar(page: Page) {
  return page.getByTestId('action-bar')
}

// ─── Suite setup ─────────────────────────────────────────────────────────────

test.beforeEach(async () => {
  // Fresh Firestore state before every test.
  await clearFirestore()
  await seedBusiness()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Instant slot selection — feature spec', () => {

  // What should NOT happen ─────────────────────────────────────────────────────

  test('Book Now button is NOT visible before any tap', async ({ page }) => {
    // Verify the action bar is absent on initial page load — no accidental pre-selection.
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await expect(page.getByRole('button', { name: /book now/i })).not.toBeVisible()
  })

  // First-tap commit ───────────────────────────────────────────────────────────

  test('first tap commits immediately — Book Now is visible after a single tap', async ({ page }) => {
    // Core contract: ONE tap on an available slot must be enough to show the action bar.
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await availableSlot(page, 0).click()

    await expect(page.getByRole('button', { name: /book now/i })).toBeVisible({ timeout: 5_000 })
  })

  test('first tap shows a 1-hour time range in the action bar', async ({ page }) => {
    // The action bar must display "HH AM – HH AM" (or PM) for a single tapped slot.
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    // Tap hour 8 directly so we know exactly which time label to expect.
    await slotByHour(page, 8).click()

    await expect(actionBar(page).getByText('8 AM – 9 AM', { exact: false })).toBeVisible({ timeout: 5_000 })
  })

  test('first tap shows the correct 1-hour price in the action bar', async ({ page }) => {
    // One standard-rate hour must display ₱500 (no multi-hour multiplication).
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 8).click()

    await expect(actionBar(page).getByText(`₱${STD_RATE.toLocaleString()}`)).toBeVisible({ timeout: 5_000 })
  })

  test('first tap shows "1 hr" duration in the action bar', async ({ page }) => {
    // Duration indicator must say 1 hr (not 0 or 2) immediately after the first tap.
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 8).click()

    await expect(actionBar(page).getByText('1 hr', { exact: false })).toBeVisible({ timeout: 5_000 })
  })

  test('no animate-pulse or "pending" visual on the committed slot after first tap', async ({ page }) => {
    // The slot must be in a fully committed state — no pulsing intermediate indicator.
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    const slot = slotByHour(page, 8)
    await slot.click()

    const cls = await slot.getAttribute('class') ?? ''
    expect(cls).not.toContain('animate-pulse')
    // The slot must not show "Booked" or "Pending" text — it was selected, not taken.
    await expect(slot).not.toHaveText('Booked')
    await expect(slot).not.toHaveText('Pending')
  })

  // Extending the range forward ────────────────────────────────────────────────

  test('tapping a later slot extends the selection forward from the original anchor', async ({ page }) => {
    // Anchor = 8 AM. Tapping 10 AM should produce "8 AM – 11 AM" (3 hours).
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 8).click()   // commit single-hour selection (8–9 AM)
    await slotByHour(page, 10).click()  // extend to 10 AM slot (8 AM – 11 AM)

    await expect(actionBar(page).getByText('8 AM – 11 AM', { exact: false })).toBeVisible({ timeout: 5_000 })
  })

  test('extending the range updates the duration and price proportionally', async ({ page }) => {
    // 3 standard-rate hours: ₱500 × 3 = ₱1,500; duration = "3 hrs".
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 8).click()
    await slotByHour(page, 10).click()

    await expect(actionBar(page).getByText('3 hrs', { exact: false })).toBeVisible({ timeout: 5_000 })
    await expect(actionBar(page).getByText('₱1,500')).toBeVisible({ timeout: 5_000 })
  })

  test('tapping any slot within the committed range clears the selection entirely', async ({ page }) => {
    // Anchor = 8 AM, extend to 10 AM → range [8,9,10]. Tapping 9 AM (already in range)
    // triggers deselect-all — there is no "shrink" in Option A.
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 8).click()
    await slotByHour(page, 10).click()  // 3 hrs: 8 AM – 11 AM
    await slotByHour(page, 9).click()   // 9 is in selection → deselect all

    await expect(page.getByRole('button', { name: /book now/i })).not.toBeVisible({ timeout: 5_000 })
  })

  // Extending the range backwards ──────────────────────────────────────────────

  test('tapping a slot before the anchor extends the range backwards', async ({ page }) => {
    // Anchor = 10 AM. Tap 8 AM; range should become "8 AM – 11 AM" (anchored at 10).
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 10).click()  // anchor at 10 AM (10–11 AM)
    await slotByHour(page, 8).click()   // extend backwards — 8 AM – 11 AM

    await expect(actionBar(page).getByText('8 AM – 11 AM', { exact: false })).toBeVisible({ timeout: 5_000 })
  })

  test('backwards extension updates duration and price correctly', async ({ page }) => {
    // Anchor = 10 AM, extend back to 8 AM = 3 hrs, ₱1,500.
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 10).click()
    await slotByHour(page, 8).click()

    await expect(actionBar(page).getByText('3 hrs', { exact: false })).toBeVisible({ timeout: 5_000 })
    await expect(actionBar(page).getByText('₱1,500')).toBeVisible({ timeout: 5_000 })
  })

  // Tap-to-deselect ────────────────────────────────────────────────────────────

  test('tapping the active (committed) slot deselects it — Book Now disappears', async ({ page }) => {
    // After a committed selection, tapping the same slot again must clear everything.
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 8).click()  // commit 8 AM
    await expect(page.getByRole('button', { name: /book now/i })).toBeVisible({ timeout: 5_000 })

    await slotByHour(page, 8).click()  // deselect

    await expect(page.getByRole('button', { name: /book now/i })).not.toBeVisible({ timeout: 5_000 })
  })

  test('deselecting clears the action bar time range text', async ({ page }) => {
    // The time range "8 AM – 9 AM" must no longer be visible after deselection.
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 8).click()
    await expect(actionBar(page).getByText('8 AM – 9 AM', { exact: false })).toBeVisible({ timeout: 5_000 })

    await slotByHour(page, 8).click()  // deselect

    await expect(actionBar(page).getByText('8 AM – 9 AM', { exact: false })).not.toBeVisible()
  })

  // Click-outside clears selection ─────────────────────────────────────────────

  test('clicking outside the availability section and action bar clears the selection', async ({ page }) => {
    // The spec requires that clicking outside both the slot grid and the action bar
    // dismisses the selection entirely.
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 8).click()
    await expect(page.getByRole('button', { name: /book now/i })).toBeVisible({ timeout: 5_000 })

    // Click the top of the page body — well outside the availability section and
    // action bar, but without triggering any navigation.
    await page.mouse.click(10, 10)

    await expect(page.getByRole('button', { name: /book now/i })).not.toBeVisible({ timeout: 5_000 })
  })

  test('clicking outside the slot grid (e.g. section heading) clears the selection', async ({ page }) => {
    // The outside-click handler only exempts the slot grid container and the action bar.
    // The section heading is outside the slot grid, so clicking it clears the selection.
    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 8).click()
    await expect(page.getByRole('button', { name: /book now/i })).toBeVisible({ timeout: 5_000 })

    // Click the "Check Availability" heading — inside the availability section but
    // outside the slot grid container (slotsRef), so it triggers clear.
    await page.getByTestId('availability-section').getByRole('heading', { name: 'Check Availability' }).click()

    await expect(page.getByRole('button', { name: /book now/i })).not.toBeVisible({ timeout: 5_000 })
  })

  // Booked slots ───────────────────────────────────────────────────────────────

  test('booked slot button is disabled and cannot be tapped', async ({ page }) => {
    // A booked hour must render as a disabled button — the user cannot interact with it.
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         dateKeyDelta(1),
      hours:        [10],
    })

    await page.goto(BUSINESS)
    await selectTomorrow(page)

    // Hour 10 is booked — its button must be disabled.
    const bookedSlot = page.locator('button[data-slot-hour="10"]')
    await expect(bookedSlot).toBeDisabled()
  })

  test('booked slot shows "Booked" label', async ({ page }) => {
    // The label text must be "Booked" so the user understands why they cannot tap it.
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         dateKeyDelta(1),
      hours:        [10],
    })

    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await expect(page.getByRole('button', { name: 'Booked' }).first()).toBeVisible()
  })

  test('range stops before a booked slot — cannot extend across it', async ({ page }) => {
    // Hour 9 is booked. Tapping 8 AM then 10 AM should NOT produce a 3-hour range;
    // the selection must stop at the slot just before the booked hour.
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         dateKeyDelta(1),
      hours:        [9],
    })

    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await slotByHour(page, 8).click()   // anchor at 8 AM

    // Hour 10 is available but tapping it must not jump the booked hour 9.
    // The range can only span 8 AM – 9 AM (1 hour).
    await slotByHour(page, 10).click()

    await expect(actionBar(page).getByText('8 AM – 9 AM', { exact: false })).toBeVisible({ timeout: 5_000 })
    await expect(actionBar(page).getByText('1 hr', { exact: false })).toBeVisible({ timeout: 5_000 })
    // 3-hour range must not have been created.
    await expect(actionBar(page).getByText('8 AM – 11 AM', { exact: false })).not.toBeVisible()
  })

  // Adjacent slots remain available when one slot is booked ───────────────────

  test('slots adjacent to a booked slot remain enabled and selectable', async ({ page }) => {
    // Booking hour 10 must not disable hour 9 or hour 11.
    await seedBooking({
      facilityId:   COURT_1,
      facilityName: COURT_1_NAME,
      date:         dateKeyDelta(1),
      hours:        [10],
    })

    await page.goto(BUSINESS)
    await selectTomorrow(page)

    await expect(slotByHour(page, 9)).toBeEnabled()
    await expect(slotByHour(page, 11)).toBeEnabled()
  })
})
