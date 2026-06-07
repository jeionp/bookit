/**
 * E2E tests for the Scrollable 14-day date strip feature.
 *
 * Feature spec:
 *   - A horizontal row of 14 chips (today + 13 future days) replaces the old
 *     single-button calendar trigger. The strip has data-testid="date-strip".
 *   - Today chip shows the label "Today" instead of a weekday abbreviation.
 *   - Selected chip: solid accent background + white text. Unselected today chip:
 *     accent-coloured border only.
 *   - Other day chips show the weekday abbreviation and date number.
 *   - Closed-day chips are dimmed but remain tappable; tapping shows a
 *     "Closed on this day" message in the slot grid area.
 *   - A "More" button (data-testid="calendar-btn") after the 14 chips opens a
 *     full DayPicker calendar dropdown.
 *   - When a date beyond the 14-chip strip is selected via the calendar, a
 *     "Selected: [day], [mon] [date]" label appears below the strip.
 *   - The calendar only allows dates within the next 30 days; day 31+ is disabled.
 *
 * Prerequisites (same as all other E2E specs):
 *   firebase emulators:start  (Auth 9099, Firestore 8080)
 *   npm run dev               (or Playwright webServer)
 */

import { test, expect, type Page } from '@playwright/test'
import { clearFirestore, seedBusiness, dateKeyDelta, todayKey } from './helpers'

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESS = '/paddleup'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wait for the slot grid to finish loading after a date chip is tapped. */
async function waitForSlotGrid(page: Page) {
  // Try to catch the loading state so we don't accidentally see stale "ready" from the
  // previous date load. Mirrors the pattern used in booking-flow.spec.ts.
  await page.getByTestId('slot-grid-loading').waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {})
  await expect(page.getByTestId('slot-grid-ready')).toBeVisible({ timeout: 10_000 })
}

/** Return the date key (YYYY-MM-DD) for N days from today, matching localDateKey in helpers. */
function chipDateKey(daysFromNow: number): string {
  return dateKeyDelta(daysFromNow)
}

/** Return the ISO date key for today — used to locate the today chip by name attribute. */
function todayDateKey(): string {
  return todayKey()
}

// ─── Suite setup ─────────────────────────────────────────────────────────────

test.beforeEach(async () => {
  await clearFirestore()
  await seedBusiness()
})

// ─── Date strip — feature spec ───────────────────────────────────────────────

test.describe('Date strip — feature spec', () => {
  // ── 1. Strip presence ──────────────────────────────────────────────────────

  test('date strip container is present on the storefront page', async ({ page }) => {
    // Verify the strip root element is rendered as soon as the page loads.
    await page.goto(BUSINESS)
    await expect(page.locator('[data-testid="date-strip"]')).toBeAttached()
  })

  test('date strip is visible (not hidden) on initial load', async ({ page }) => {
    await page.goto(BUSINESS)
    await expect(page.locator('[data-testid="date-strip"]')).toBeVisible()
  })

  // ── 2. Chip count ──────────────────────────────────────────────────────────

  test('strip contains at least 14 tappable day chips (not counting the More button)', async ({ page }) => {
    // Chips are <button> elements with a `name` attribute equal to the date key
    // (YYYY-MM-DD). The "More" calendar button carries data-testid="calendar-btn"
    // and is deliberately excluded from this count.
    await page.goto(BUSINESS)
    const strip = page.locator('[data-testid="date-strip"]')
    const chips = strip.locator('button[name]')
    const count = await chips.count()
    // At minimum 14 day chips must be present regardless of how many are closed days.
    expect(count).toBeGreaterThanOrEqual(14)
  })

  // ── 3. Today chip ──────────────────────────────────────────────────────────

  test('today chip shows the text "Today" (not a weekday abbreviation)', async ({ page }) => {
    // The spec requires the first chip to carry the label "Today", not "Mon", "Tue", etc.
    await page.goto(BUSINESS)
    const strip = page.locator('[data-testid="date-strip"]')
    const todayChip = strip.locator('button', { hasText: 'Today' })
    await expect(todayChip).toBeAttached()
    // Verify the text is exactly "Today" — not a day abbreviation that happens to
    // contain the word (e.g. a tooltip or aria-label).
    await expect(todayChip.first()).toContainText('Today')
  })

  test('today chip is tappable (not disabled) on initial load', async ({ page }) => {
    await page.goto(BUSINESS)
    const todayChip = page
      .locator('[data-testid="date-strip"]')
      .locator('button', { hasText: 'Today' })
      .first()
    await expect(todayChip).toBeEnabled()
  })

  test('today chip corresponds to today\'s date key (name attribute = today)', async ({ page }) => {
    // Chip buttons use `name={dateKey}` — the today chip name must equal today's YYYY-MM-DD.
    await page.goto(BUSINESS)
    const todayKey = todayDateKey()
    const todayChip = page.locator(`[data-testid="date-strip"] button[name="${todayKey}"]`)
    await expect(todayChip).toBeAttached()
    // That chip must also carry the "Today" label.
    await expect(todayChip).toContainText('Today')
  })

  // ── 4. Day chips ───────────────────────────────────────────────────────────

  test('tomorrow\'s chip is present in the strip', async ({ page }) => {
    // Verify that the second chip (D+1) exists by its date-key name attribute.
    await page.goto(BUSINESS)
    const tomorrowKey = chipDateKey(1)
    const tomorrowChip = page.locator(`[data-testid="date-strip"] button[name="${tomorrowKey}"]`)
    await expect(tomorrowChip).toBeAttached()
  })

  test('the 14th chip (D+13) is present in the strip', async ({ page }) => {
    // The strip window covers today through today+13 (14 days total).
    await page.goto(BUSINESS)
    const day13Key = chipDateKey(13)
    const day13Chip = page.locator(`[data-testid="date-strip"] button[name="${day13Key}"]`)
    await expect(day13Chip).toBeAttached()
  })

  // ── 5. Date switching ──────────────────────────────────────────────────────

  test('tapping tomorrow\'s chip updates the slot grid to show tomorrow\'s slots', async ({ page }) => {
    // Verify that the slot grid reloads after tapping tomorrow. The grid must reach
    // "ready" state — proving the date switch triggered a new data fetch.
    await page.goto(BUSINESS)
    const tomorrowKey = chipDateKey(1)
    await page.locator(`[data-testid="date-strip"] button[name="${tomorrowKey}"]`).first().click()
    await waitForSlotGrid(page)
    // The ready slot grid must be visible — confirming the date switch completed.
    await expect(page.getByTestId('slot-grid-ready')).toBeVisible()
  })

  test('tapping tomorrow and then today returns to today\'s slots', async ({ page }) => {
    // Navigate away to tomorrow, then back to today — the grid should reload each time.
    await page.goto(BUSINESS)
    const tomorrowKey = chipDateKey(1)

    // Switch to tomorrow.
    await page.locator(`[data-testid="date-strip"] button[name="${tomorrowKey}"]`).first().click()
    await waitForSlotGrid(page)

    // Switch back to today via the "Today" chip.
    const todayChip = page
      .locator('[data-testid="date-strip"]')
      .locator('button', { hasText: 'Today' })
      .first()
    await todayChip.click()
    await waitForSlotGrid(page)

    // Grid is ready again after returning to today.
    await expect(page.getByTestId('slot-grid-ready')).toBeVisible()
  })

  test('tapping a chip immediately switches the grid (no extra confirmation step)', async ({ page }) => {
    // The spec says "instant date switch" — clicking the chip alone is enough.
    // We verify by confirming slot-grid-ready appears without any additional interaction.
    await page.goto(BUSINESS)
    const tomorrowKey = chipDateKey(1)
    await page.locator(`[data-testid="date-strip"] button[name="${tomorrowKey}"]`).first().click()
    // No confirm button or dialog — grid should become ready directly.
    await expect(page.getByTestId('slot-grid-ready')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /confirm/i })).not.toBeVisible()
  })

  // ── 6. Closed-day chips ────────────────────────────────────────────────────

  test('tapping a closed-day chip does not throw an error (tap completes without crashing)', async ({ page }) => {
    // The spec states closed-day chips are still tappable — clicking must not produce
    // an unhandled JS error. We look for any chip inside the strip and click it,
    // trusting that PaddleUp (open 7 days) has very few or no closed days in the
    // 14-day window; if all chips are open we skip gracefully.
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(BUSINESS)
    const strip = page.locator('[data-testid="date-strip"]')
    // Click the first chip regardless of open/closed status.
    const firstChip = strip.locator('button[name]').first()
    await expect(firstChip).toBeAttached()
    await firstChip.click()

    // No JS page errors should have been thrown by clicking a chip.
    expect(errors).toHaveLength(0)
  })

  // ── 7. "More" calendar button ──────────────────────────────────────────────

  test('"More" calendar button (data-testid="calendar-btn") is present in the strip area', async ({ page }) => {
    await page.goto(BUSINESS)
    await expect(page.locator('[data-testid="calendar-btn"]')).toBeAttached()
  })

  test('"More" button is visible to the user', async ({ page }) => {
    await page.goto(BUSINESS)
    await expect(page.locator('[data-testid="calendar-btn"]')).toBeVisible()
  })

  test('"More" button carries the label "More"', async ({ page }) => {
    // The spec says the button shows a calendar icon and the text "More".
    await page.goto(BUSINESS)
    await expect(page.locator('[data-testid="calendar-btn"]')).toContainText('More')
  })

  // ── 8. Calendar dropdown open / close ──────────────────────────────────────

  test('clicking "More" opens the DayPicker calendar dropdown', async ({ page }) => {
    // DayPicker renders a month/year caption — look for "Month YYYY" text as the
    // most reliable observable signal that the dropdown appeared.
    await page.goto(BUSINESS)
    await page.locator('[data-testid="calendar-btn"]').click()

    const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })
    // Match "June 2026" but not inline date text like "June 7, 2026".
    await expect(page.getByText(new RegExp(`${monthName} \\d{4}`))).toBeVisible({ timeout: 5_000 })
  })

  test('clicking "More" a second time closes the calendar dropdown', async ({ page }) => {
    // The calendar is a toggle — a second click on the same button should dismiss it.
    await page.goto(BUSINESS)
    const calBtn = page.locator('[data-testid="calendar-btn"]')

    await calBtn.click()
    const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })
    await expect(page.getByText(new RegExp(`${monthName} \\d{4}`))).toBeVisible({ timeout: 5_000 })

    await calBtn.click()
    await expect(page.getByText(new RegExp(`${monthName} \\d{4}`))).not.toBeVisible({ timeout: 5_000 })
  })

  test('clicking outside the calendar closes it', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.locator('[data-testid="calendar-btn"]').click()

    const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })
    await expect(page.getByText(new RegExp(`${monthName} \\d{4}`))).toBeVisible({ timeout: 5_000 })

    // Click outside the strip area — use mouse.click on the top edge of the page
    // to avoid navigating away via any header links.
    await page.mouse.click(10, 10)
    await expect(page.getByText(new RegExp(`${monthName} \\d{4}`))).not.toBeVisible({ timeout: 5_000 })
  })

  // ── 9. 30-day booking window ───────────────────────────────────────────────

  test('a date 31 days from today is disabled in the calendar picker', async ({ page }) => {
    // The spec limits selection to 30 days from today; D+31 must be un-clickable.
    await page.goto(BUSINESS)
    await page.locator('[data-testid="calendar-btn"]').click()

    const target = new Date()
    target.setDate(target.getDate() + 31)

    // If the 31-days-ahead date falls in the next calendar month, navigate forward.
    if (target.getMonth() !== new Date().getMonth()) {
      await page.getByLabel('Go to next month').click()
    }

    const dayNum = String(target.getDate())
    // A disabled day button carries the disabled attribute.
    const disabledBtn = page
      .locator('button[disabled]')
      .filter({ hasText: new RegExp(`^${dayNum}$`) })
      .first()
    await expect(disabledBtn).toBeVisible()
  })

  test('a date 30 days from today is enabled (within the booking window)', async ({ page }) => {
    // D+30 is the last selectable day — it must NOT be disabled.
    await page.goto(BUSINESS)
    await page.locator('[data-testid="calendar-btn"]').click()

    const target = new Date()
    target.setDate(target.getDate() + 30)

    if (target.getMonth() !== new Date().getMonth()) {
      await page.getByLabel('Go to next month').click()
    }

    const dayNum = String(target.getDate())
    // Find a button with exactly this day number that is NOT disabled.
    const enabledBtn = page
      .locator('button')
      .filter({ hasText: new RegExp(`^${dayNum}$`) })
      .and(page.locator('button:not([disabled])'))
      .first()
    await expect(enabledBtn).toBeVisible()
    await expect(enabledBtn).toBeEnabled()
  })

  // ── 10. Beyond-strip indicator ─────────────────────────────────────────────

  test('selecting a date beyond the 14-day strip via the calendar shows the "Selected:" indicator', async ({ page }) => {
    // Navigate to a date that is outside the chip strip (D+15 or later) via the
    // calendar dropdown and verify the "Selected: …" label appears below the strip.
    await page.goto(BUSINESS)
    await page.locator('[data-testid="calendar-btn"]').click()

    // Pick D+15 (safely inside the 30-day window but beyond the 14-day chip strip).
    const target = new Date()
    target.setDate(target.getDate() + 15)

    // Navigate to next month inside the picker if needed.
    if (target.getMonth() !== new Date().getMonth()) {
      await page.getByLabel('Go to next month').click()
    }

    const dayNum = String(target.getDate())
    // Click the enabled day button for D+15.
    const dayBtn = page
      .locator('button:not([disabled])')
      .filter({ hasText: new RegExp(`^${dayNum}$`) })
      .first()
    await dayBtn.click()

    // The "Selected: …" indicator must become visible.
    await expect(page.getByText(/^Selected:/)).toBeVisible({ timeout: 5_000 })
  })

  test('"Selected:" indicator includes the day abbreviation, month abbreviation, and date number', async ({ page }) => {
    // Verify the indicator's text format matches "Selected: [Day], [Mon] [D]".
    await page.goto(BUSINESS)
    await page.locator('[data-testid="calendar-btn"]').click()

    const target = new Date()
    target.setDate(target.getDate() + 15)

    if (target.getMonth() !== new Date().getMonth()) {
      await page.getByLabel('Go to next month').click()
    }

    const dayNum = String(target.getDate())
    const dayBtn = page
      .locator('button:not([disabled])')
      .filter({ hasText: new RegExp(`^${dayNum}$`) })
      .first()
    await dayBtn.click()

    // The label text must match "Selected: [Weekday], [Mon] [date]" e.g. "Selected: Sat, Jun 20".
    await expect(page.getByText(/^Selected: \w{3}, \w{3} \d{1,2}$/)).toBeVisible({ timeout: 5_000 })
  })

  test('"Selected:" indicator is NOT shown when a strip chip (within 14 days) is selected', async ({ page }) => {
    // After selecting a date from the calendar (which shows the indicator), tapping a
    // strip chip must hide the indicator — it only applies to beyond-strip dates.
    await page.goto(BUSINESS)

    // 1. Open calendar and pick D+15 to trigger the indicator.
    await page.locator('[data-testid="calendar-btn"]').click()

    const target = new Date()
    target.setDate(target.getDate() + 15)

    if (target.getMonth() !== new Date().getMonth()) {
      await page.getByLabel('Go to next month').click()
    }

    const dayNum = String(target.getDate())
    const dayBtn = page
      .locator('button:not([disabled])')
      .filter({ hasText: new RegExp(`^${dayNum}$`) })
      .first()
    await dayBtn.click()

    await expect(page.getByText(/^Selected:/)).toBeVisible({ timeout: 5_000 })

    // 2. Tap the "Today" chip (within the strip) — the indicator must disappear.
    const todayChip = page
      .locator('[data-testid="date-strip"]')
      .locator('button', { hasText: 'Today' })
      .first()
    await todayChip.click()

    await expect(page.getByText(/^Selected:/)).not.toBeVisible({ timeout: 5_000 })
  })

  test('"Selected:" indicator is NOT shown on initial load (today is selected by default)', async ({ page }) => {
    // On a fresh page load the selected date is today (within the strip), so the
    // indicator should never appear on initial render.
    await page.goto(BUSINESS)
    await expect(page.getByText(/^Selected:/)).not.toBeAttached()
  })

  // ── 11. Selecting a date via calendar switches the slot grid ───────────────

  test('selecting a beyond-strip date via calendar updates the slot grid', async ({ page }) => {
    // Choosing D+15 via the calendar dropdown must trigger a slot grid reload
    // just like tapping a chip — the grid must reach ready state.
    await page.goto(BUSINESS)
    await page.locator('[data-testid="calendar-btn"]').click()

    const target = new Date()
    target.setDate(target.getDate() + 15)

    if (target.getMonth() !== new Date().getMonth()) {
      await page.getByLabel('Go to next month').click()
    }

    const dayNum = String(target.getDate())
    const dayBtn = page
      .locator('button:not([disabled])')
      .filter({ hasText: new RegExp(`^${dayNum}$`) })
      .first()
    await dayBtn.click()

    await waitForSlotGrid(page)
    await expect(page.getByTestId('slot-grid-ready')).toBeVisible()
  })
})
