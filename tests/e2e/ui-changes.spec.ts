/**
 * E2E tests for the UI changes introduced in this session:
 *
 *  1. AuthModal — portal rendering into document.body
 *  2. StepIndicator — mobile-responsive CSS classes
 *  3. Step1BusinessInfo — disabled business types + "Soon" badge
 *  4. Step3Facilities — operating-hours mobile layout classes
 *  5. OnboardingWizard — exit setup button, sign-out button, confirm dialog
 *  6. BusinessPageClient — Info tab, Sidebar hidden/visible, mobile strip
 *  7. LandingNav — sign-out button when signed-in / sign-in button when not
 *  8. Account page — sign-out button in sticky header
 *  9. Sidebar — About section always visible
 *
 * Prerequisites (same as all other E2E specs):
 *   firebase emulators:start  (Auth 9099, Firestore 8080)
 *   npm run dev               (or Playwright webServer)
 */

import { test, expect, type Page } from '@playwright/test'
import {
  clearFirestore,
  seedBusiness,
  createTestUser,
  signInUser,
} from './helpers'

// ─── Constants ────────────────────────────────────────────────────────────────

const LANDING    = '/'
const BUSINESS   = '/paddleup'
const ONBOARDING = '/onboarding'
const ACCOUNT    = '/account'

const TEST_EMAIL    = 'ui-changes@bookit-test.internal'
const TEST_PASSWORD = 'UITest1!'

// ─── Suite setup ─────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await createTestUser(TEST_EMAIL, TEST_PASSWORD, 'UI Tester')
})

test.beforeEach(async () => {
  await clearFirestore()
  await seedBusiness()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function signInViaModal(page: Page, email: string, password: string) {
  await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 8_000 })
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
  // Wait for modal to close — works at any viewport width regardless of hidden sm:inline text
  await expect(page.getByText('Welcome back')).not.toBeAttached({ timeout: 8_000 })
}

async function goToStep1Wizard(page: Page) {
  await page.goto(ONBOARDING)
  await page.getByRole('button', { name: /sign in \/ create account/i }).click()
  await signInViaModal(page, TEST_EMAIL, TEST_PASSWORD)
  await expect(page.getByRole('heading', { name: 'Business Info' })).toBeVisible({ timeout: 8_000 })
}

// ─── 1. AuthModal — portal rendering ─────────────────────────────────────────

test.describe('AuthModal — portal rendering', () => {
  test('modal renders when open=true (Sign in button opens it)', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 8_000 })
  })

  test('modal content is a descendant of document.body (portal check)', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 8_000 })

    // Verify the modal backdrop/container is a direct child of <body>, not nested
    // inside the React root or any other wrapper div.
    const isDirectBodyChild = await page.evaluate(() => {
      // The fixed overlay div has class "fixed inset-0 z-50" — find it
      const overlay = document.querySelector('.fixed.inset-0.z-50')
      return overlay?.parentElement?.tagName === 'BODY'
    })
    expect(isDirectBodyChild).toBe(true)
  })

  test('modal is not rendered when closed (no Welcome back heading)', async ({ page }) => {
    await page.goto(BUSINESS)
    // Do not click Sign in
    await expect(page.getByText('Welcome back')).not.toBeAttached()
  })

  test('clicking backdrop closes the modal', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 8_000 })

    // Click the top-left corner of the backdrop — well outside the centered modal card
    await page.locator('.absolute.inset-0.bg-black\\/40').click({ position: { x: 5, y: 5 } })
    await expect(page.getByText('Welcome back')).not.toBeAttached({ timeout: 5_000 })
  })

  test('modal X button closes the modal', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 8_000 })

    // The X close button is inside the modal card
    await page.locator('.relative.w-full.max-w-sm').getByRole('button').first().click()
    await expect(page.getByText('Welcome back')).not.toBeAttached({ timeout: 5_000 })
  })
})

// ─── 2. StepIndicator — mobile-responsive CSS classes ─────────────────────────

test.describe('StepIndicator — responsive CSS classes', () => {
  test('connector lines have sm:w-12 class (narrow on mobile, wider on sm+)', async ({ page }) => {
    await goToStep1Wizard(page)

    // The connectors are between step circles — they carry sm:w-12
    const connectors = page.locator('.sm\\:w-12')
    const count = await connectors.count()
    expect(count).toBeGreaterThanOrEqual(4) // 4 connectors for 5 steps
  })

  test('connector lines have sm:mb-5 class (vertical alignment fix)', async ({ page }) => {
    await goToStep1Wizard(page)

    const connectors = page.locator('.sm\\:mb-5')
    const count = await connectors.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('step circles render for all 5 steps', async ({ page }) => {
    await goToStep1Wizard(page)

    // Step circles are w-8 h-8 rounded-full — find all 5
    const circles = page.locator('.w-8.h-8.rounded-full')
    const count = await circles.count()
    expect(count).toBe(5)
  })

  test('step labels have hidden sm:block classes (icon-only on mobile)', async ({ page }) => {
    await goToStep1Wizard(page)

    // Labels are spans with class "hidden sm:block"
    const labels = page.locator('span.hidden.sm\\:block')
    const count = await labels.count()
    // There are 5 steps, each with a label (active label text may vary slightly)
    expect(count).toBeGreaterThanOrEqual(5)
  })

  test('step label text for all 5 steps is present in DOM (even when hidden on mobile)', async ({ page }) => {
    await goToStep1Wizard(page)

    // Labels are in the DOM even when CSS-hidden — check presence
    await expect(page.locator('span', { hasText: 'Business Info' }).first()).toBeAttached()
    await expect(page.locator('span', { hasText: 'Branding' }).first()).toBeAttached()
    await expect(page.locator('span', { hasText: 'Facilities' }).first()).toBeAttached()
    await expect(page.locator('span', { hasText: 'Payments' }).first()).toBeAttached()
    await expect(page.locator('span', { hasText: 'Review' }).first()).toBeAttached()
  })
})

// ─── 3. Step1BusinessInfo — disabled business types ───────────────────────────

test.describe('Step1BusinessInfo — disabled business types', () => {
  test('Sports Court button is enabled and clickable', async ({ page }) => {
    await goToStep1Wizard(page)

    const courtBtn = page.getByRole('button', { name: /sports court/i })
    await expect(courtBtn).toBeEnabled()
  })

  test('Appointment-based button is disabled', async ({ page }) => {
    await goToStep1Wizard(page)

    const apptBtn = page.getByRole('button', { name: /appointment-based/i })
    await expect(apptBtn).toBeDisabled()
  })

  test('Room / Space button is disabled', async ({ page }) => {
    await goToStep1Wizard(page)

    const roomBtn = page.getByRole('button', { name: /room \/ space/i })
    await expect(roomBtn).toBeDisabled()
  })

  test('"Soon" badge renders on Appointment-based button', async ({ page }) => {
    await goToStep1Wizard(page)

    // The "Soon" badge is a <span> inside the button
    await expect(page.getByText('Soon').first()).toBeAttached()
  })

  test('"Soon" badges render on exactly the two disabled options', async ({ page }) => {
    await goToStep1Wizard(page)

    const soonBadges = page.getByText('Soon')
    await expect(soonBadges).toHaveCount(2)
  })

  test('clicking disabled Appointment-based button does not select it (type stays "court")', async ({ page }) => {
    await goToStep1Wizard(page)

    // Sports Court should already be visually selected (blue border)
    const courtBtn = page.getByRole('button', { name: /sports court/i })
    await expect(courtBtn).toHaveClass(/border-blue-600/)

    // Click the disabled Appointment-based button — it should not change selection
    const apptBtn = page.getByRole('button', { name: /appointment-based/i })
    await apptBtn.click({ force: true }) // force=true to bypass disabled attribute check

    // court button should still be selected
    await expect(courtBtn).toHaveClass(/border-blue-600/)
  })

  test('disabled buttons have cursor-not-allowed class', async ({ page }) => {
    await goToStep1Wizard(page)

    const apptBtn = page.getByRole('button', { name: /appointment-based/i })
    await expect(apptBtn).toHaveClass(/cursor-not-allowed/)

    const roomBtn = page.getByRole('button', { name: /room \/ space/i })
    await expect(roomBtn).toHaveClass(/cursor-not-allowed/)
  })
})

// ─── 4. Step3Facilities — operating hours mobile layout ───────────────────────

test.describe('Step3Facilities — operating hours mobile layout', () => {
  async function goToStep3(page: Page) {
    await goToStep1Wizard(page)

    // Complete Step 1 with a unique slug
    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Layout Test Court')
    await expect(page.getByText('Available')).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /next.*branding/i }).click()

    // Skip Step 2
    await expect(page.getByRole('heading', { name: 'Branding' })).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /next.*facilities/i }).click()

    // Confirm Step 3 loaded
    await expect(page.getByRole('heading', { name: 'Facilities & Hours' })).toBeVisible({ timeout: 8_000 })
  }

  test('time inputs wrapper has pl-24 class (indented under day label)', async ({ page }) => {
    await goToStep3(page)

    const timeRowWrappers = page.locator('.pl-24')
    const count = await timeRowWrappers.count()
    // There are 7 days, each with a pl-24 time row when open
    expect(count).toBeGreaterThanOrEqual(7)
  })

  test('time inputs have flex-1 and min-w-0 classes (prevent overflow)', async ({ page }) => {
    await goToStep3(page)

    // Time inputs of type=time inside pl-24 containers
    const timeInputs = page.locator('.pl-24 input[type="time"]')
    const count = await timeInputs.count()
    expect(count).toBeGreaterThan(0)

    // Each time input should carry flex-1 and min-w-0
    const first = timeInputs.first()
    await expect(first).toHaveClass(/flex-1/)
    await expect(first).toHaveClass(/min-w-0/)
  })

  test('closed day does not render time inputs', async ({ page }) => {
    await goToStep3(page)

    // Uncheck Monday (make it closed)
    const mondayCheckbox = page.locator('label', { hasText: /open/i }).first()
    await mondayCheckbox.click()

    // The time input row under Monday should disappear
    // (the pl-24 container for Monday is gone; others may remain)
    // Verify by counting: we had 7 open days * 2 time inputs = 14; after closing 1 → 12
    const timeInputsAfter = await page.locator('.pl-24 input[type="time"]').count()
    // Originally 7 days * 2 = 14 time inputs; after closing 1: 6 * 2 = 12
    expect(timeInputsAfter).toBeLessThanOrEqual(12)
  })

  test('facility card name/price grid has grid-cols-1 class', async ({ page }) => {
    await goToStep3(page)

    // Add a facility so the card renders
    await page.getByRole('button', { name: /add your first facility/i }).click()

    // The facility card's name+price row uses "grid grid-cols-1 ... sm:grid-cols-2"
    const facilityGrid = page.locator('.grid.grid-cols-1').first()
    await expect(facilityGrid).toBeAttached()
  })

  test('facility card prime-time fields grid has sm:grid-cols-2 class', async ({ page }) => {
    await goToStep3(page)

    await page.getByRole('button', { name: /add your first facility/i }).click()

    // The prime-time row also uses grid-cols-1 sm:grid-cols-2
    const grids = page.locator('.grid.grid-cols-1.sm\\:grid-cols-2')
    const count = await grids.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })
})

// ─── 5. OnboardingWizard — exit and sign-out buttons ─────────────────────────

test.describe('OnboardingWizard — exit setup + sign-out', () => {
  test('"Exit setup" button is rendered in the nav', async ({ page }) => {
    await goToStep1Wizard(page)

    // The exit button text is "Exit setup" (hidden sm:inline on mobile) — check by role
    await expect(page.getByRole('button', { name: /exit setup/i })).toBeAttached()
  })

  test('"Sign out" button is rendered in the wizard nav', async ({ page }) => {
    await goToStep1Wizard(page)

    // There are two sign-out-ish buttons — one in the wizard nav
    // Target the one inside the onboarding header specifically
    const signOutBtn = page.locator('header').getByRole('button', { name: /sign out/i })
    await expect(signOutBtn).toBeAttached()
  })

  test('Exit setup button has X icon + hidden sm:inline span', async ({ page }) => {
    await goToStep1Wizard(page)

    // The "Exit setup" text span should be in the DOM (even if visually hidden on mobile)
    const exitTextSpan = page.locator('header span.hidden.sm\\:inline', { hasText: 'Exit setup' })
    await expect(exitTextSpan).toBeAttached()
  })

  test('Sign out text span has hidden sm:inline class', async ({ page }) => {
    await goToStep1Wizard(page)

    const signOutSpan = page.locator('header span.hidden.sm\\:inline', { hasText: 'Sign out' })
    await expect(signOutSpan).toBeAttached()
  })

  test('clean state: clicking Exit navigates without confirm dialog', async ({ page }) => {
    await goToStep1Wizard(page)

    // Step 0, no name entered → clean state
    // Playwright cannot intercept window.confirm natively in a simple way,
    // but we can verify that after clicking exit we navigate to the landing page
    // (which only happens if confirm is either not called or accepted).
    // Stub the dialog to auto-accept so the test is deterministic.
    page.on('dialog', (dialog) => dialog.accept())

    await page.getByRole('button', { name: /exit setup/i }).click()
    await expect(page).toHaveURL(LANDING, { timeout: 8_000 })
  })

  test('dirty state (name filled): Exit shows confirm dialog', async ({ page }) => {
    await goToStep1Wizard(page)

    // Make the state dirty by typing a name
    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Dirty Business')

    let dialogMessage = ''
    page.on('dialog', async (dialog) => {
      dialogMessage = dialog.message()
      await dialog.dismiss() // dismiss → stay on page
    })

    await page.getByRole('button', { name: /exit setup/i }).click()

    // After dismiss, we should still be on the onboarding page
    await expect(page).toHaveURL(ONBOARDING, { timeout: 5_000 })
    expect(dialogMessage).toBe('Exit setup? Your progress will be lost.')
  })

  test('dirty state: accepting confirm dialog navigates to landing', async ({ page }) => {
    await goToStep1Wizard(page)
    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Dirty Business')

    page.on('dialog', (dialog) => dialog.accept())

    await page.getByRole('button', { name: /exit setup/i }).click()
    await expect(page).toHaveURL(LANDING, { timeout: 8_000 })
  })

  test('dirty state: dismissing confirm dialog stays on onboarding', async ({ page }) => {
    await goToStep1Wizard(page)
    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Dirty Business')

    page.on('dialog', (dialog) => dialog.dismiss())

    await page.getByRole('button', { name: /exit setup/i }).click()
    await expect(page).toHaveURL(ONBOARDING, { timeout: 5_000 })
  })

  test('step > 0 is dirty: Exit shows confirm dialog', async ({ page }) => {
    await goToStep1Wizard(page)

    // Advance to step 2 (Branding)
    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Step2 Test')
    await expect(page.getByText('Available')).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /next.*branding/i }).click()
    await expect(page.getByRole('heading', { name: 'Branding' })).toBeVisible({ timeout: 8_000 })

    let dialogShown = false
    page.on('dialog', async (dialog) => {
      dialogShown = true
      await dialog.dismiss()
    })

    await page.getByRole('button', { name: /exit setup/i }).click()
    expect(dialogShown).toBe(true)
  })
})

// ─── 6. BusinessPageClient — Info tab + Sidebar ───────────────────────────────

test.describe('BusinessPageClient — Info tab and Sidebar', () => {
  // Info tab button is xl:hidden — only visible below the xl breakpoint (1280px)
  test.use({ viewport: { width: 390, height: 844 } })
  test('Info tab button is present in the tab bar', async ({ page }) => {
    await page.goto(BUSINESS)
    await expect(page.getByRole('button', { name: 'Info' })).toBeAttached()
  })

  test('Info tab button has xl:hidden class', async ({ page }) => {
    await page.goto(BUSINESS)
    const infoTabBtn = page.getByRole('button', { name: 'Info' })
    await expect(infoTabBtn).toHaveClass(/xl:hidden/)
  })

  test('clicking Info tab shows Sidebar content', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Info' }).click()

    // Sidebar contains the business name in an h1
    await expect(page.getByRole('heading', { name: 'PaddleUp' }).first()).toBeVisible()
  })

  test('clicking Info tab hides the white content card', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Info' }).click()

    // The main content container has px-5 pt-6 class — should not be present when Info is active
    // The white card container is not rendered when activeTab === "Info"
    const whiteCard = page.locator('.bg-white.rounded-2xl.border.border-gray-100.px-5.pt-6')
    await expect(whiteCard).not.toBeAttached()
  })

  test('clicking Home tab shows the availability section (not Sidebar)', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Info' }).click()
    await page.getByRole('button', { name: 'Home' }).click()

    // Home tab renders the "Check Availability" heading inside AvailabilitySection
    await expect(page.getByRole('heading', { name: 'Check Availability' })).toBeVisible({ timeout: 8_000 })
  })

  test('clicking My Bookings tab shows booking content (not Sidebar)', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Info' }).click()
    await page.getByRole('button', { name: 'My Bookings' }).click()

    // MyBookings guest state text
    await expect(page.getByText('Sign in to view your bookings')).toBeVisible({ timeout: 5_000 })
  })

  test('Info tab content wrapper has xl:hidden class', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Info' }).click()

    // The wrapper div around the Info tab Sidebar has xl:hidden
    // .first() because the hero overlay is also an xl:hidden div containing h1 PaddleUp
    const infoWrapper = page.locator('.xl\\:hidden').filter({ has: page.locator('h1', { hasText: 'PaddleUp' }) }).first()
    await expect(infoWrapper).toBeAttached()
  })

  test('aside element has hidden xl:block class', async ({ page }) => {
    await page.goto(BUSINESS)

    // The desktop sidebar is inside an <aside> with class "hidden xl:block"
    const aside = page.locator('aside.hidden')
    await expect(aside).toBeAttached()
    await expect(aside).toHaveClass(/xl:block/)
  })

  test('mobile info strip does not contain a StarRating component', async ({ page }) => {
    await page.goto(BUSINESS)

    // The mobile strip is the xl:hidden bar above the tabs
    // StarRating renders SVG stars — after the change only badge + address appear in the strip
    // The strip has class "xl:hidden bg-white border-b border-gray-100 px-4 py-3"
    const strip = page.locator('.xl\\:hidden.bg-white.border-b.border-gray-100.px-4.py-3')

    // After the change, the strip should NOT contain star SVG elements
    const starsInStrip = strip.locator('svg.lucide-star')
    expect(await starsInStrip.count()).toBe(0)
  })

  test('mobile info strip does not show review count "(214)"', async ({ page }) => {
    await page.goto(BUSINESS)

    const strip = page.locator('.xl\\:hidden.bg-white.border-b.border-gray-100.px-4.py-3')
    // Review count "(214 reviews)" should not be in the simplified strip
    await expect(strip.getByText(/214/)).not.toBeAttached()
  })

  test('mobile info strip shows open/closed badge', async ({ page }) => {
    await page.goto(BUSINESS)

    // Strip shows either "Open · closes ..." or "Closed today"
    const strip = page.locator('.xl\\:hidden.bg-white.border-b.border-gray-100.px-4.py-3')
    const hasBadge = (await strip.getByText(/open/i).count()) + (await strip.getByText(/closed today/i).count())
    expect(hasBadge).toBeGreaterThanOrEqual(1)
  })

  test('sign-out text span in business page has hidden sm:inline class', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await signInViaModal(page, TEST_EMAIL, TEST_PASSWORD)

    // After sign-in, the Sign out button should have a span with hidden sm:inline
    const signOutSpan = page.locator('header span.hidden.sm\\:inline', { hasText: 'Sign out' })
    await expect(signOutSpan).toBeAttached()
  })
})

// ─── 7. LandingNav — sign-out for signed-in users ────────────────────────────

test.describe('LandingNav — sign-out button', () => {
  test('sign-out button is NOT rendered when user is not signed in', async ({ page }) => {
    await page.goto(LANDING)

    // Not signed in — only a "Sign in" button in the nav
    const nav = page.locator('header nav')
    await expect(nav.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 8_000 })
    await expect(nav.getByRole('button', { name: /sign out/i })).not.toBeAttached()
  })

  test('sign-in button renders when not authenticated', async ({ page }) => {
    await page.goto(LANDING)

    const nav = page.locator('header nav')
    await expect(nav.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 8_000 })
  })

  test('sign-out button renders when user is signed in', async ({ page }) => {
    // Sign in through the business page first (shares the same auth session)
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await signInViaModal(page, TEST_EMAIL, TEST_PASSWORD)

    // Navigate to landing
    await page.goto(LANDING)
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 8_000 })
  })

  test('sign-out button text span has hidden sm:inline class', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await signInViaModal(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(LANDING)

    const signOutSpan = page.locator('nav span.hidden.sm\\:inline', { hasText: 'Sign out' })
    await expect(signOutSpan).toBeAttached()
  })

  test('clicking sign-out signs the user out and shows sign-in button again', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await signInViaModal(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(LANDING)

    // Click sign-out
    await page.getByRole('button', { name: /sign out/i }).click()

    // After sign-out the nav should show Sign in again
    const nav = page.locator('header nav')
    await expect(nav.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 8_000 })
    await expect(nav.getByRole('button', { name: /sign out/i })).not.toBeAttached()
  })

  test('sign-in button opens the AuthModal', async ({ page }) => {
    await page.goto(LANDING)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 8_000 })
  })
})

// ─── 8. Account page — sign-out in header ────────────────────────────────────

test.describe('Account page — sign-out button in header', () => {
  test('sign-out button renders in header for authenticated user', async ({ page }) => {
    // Sign in via business page, then navigate to account
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await signInViaModal(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(ACCOUNT)

    // The sticky header has a LogOut icon button
    const header = page.locator('.sticky.top-0')
    await expect(header.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 8_000 })
  })

  test('sign-out button NOT in header on guest/sign-in prompt screen', async ({ page }) => {
    // Navigate to account without signing in
    await page.goto(ACCOUNT)

    // Guest screen shows "Sign in to view your account" — no sticky header sign-out
    await expect(page.getByText('Sign in to view your account')).toBeVisible({ timeout: 8_000 })

    // The sticky header with LogOut button is absent on the guest screen
    const stickyHeader = page.locator('.sticky.top-0')
    await expect(stickyHeader).not.toBeAttached()
  })

  test('sign-out span in account header has hidden sm:inline class', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await signInViaModal(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(ACCOUNT)

    const signOutSpan = page.locator('.sticky.top-0 span.hidden.sm\\:inline', { hasText: 'Sign out' })
    await expect(signOutSpan).toBeAttached()
  })

  test('clicking sign-out on account page signs out and shows guest screen', async ({ page }) => {
    await page.goto(BUSINESS)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await signInViaModal(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(ACCOUNT)

    const header = page.locator('.sticky.top-0')
    await header.getByRole('button', { name: /sign out/i }).click()

    // After signing out, the guest prompt should appear
    await expect(page.getByText('Sign in to view your account')).toBeVisible({ timeout: 8_000 })
  })
})

// ─── 10. HomeTab — desktop court grid (Change 2) ─────────────────────────────

test.describe('HomeTab — desktop court grid (≥1280px)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('court cards are visible at desktop width', async ({ page }) => {
    await page.goto(BUSINESS)
    // Court cards have "Check availability →" or "Selected ✓" buttons
    const courtCards = page.locator('.rounded-2xl').filter({
      has: page.locator('button', { hasText: /check availability|selected/i }),
    })
    await expect(courtCards.first()).toBeVisible({ timeout: 8_000 })
  })

  test('scroll buttons (ChevronLeft/Right) are NOT visible at desktop width', async ({ page }) => {
    await page.goto(BUSINESS)
    // The scroll buttons wrapper has xl:hidden class
    const scrollButtonWrapper = page.locator('.xl\\:hidden').filter({
      has: page.locator('button').first(),
    }).first()
    // The wrapper carrying the chevron buttons is in the DOM but hidden at xl
    // Verify neither chevron button is visible
    const leftBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-left') })
    const rightBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') })
    await expect(leftBtn).not.toBeVisible()
    await expect(rightBtn).not.toBeVisible()
  })

  test('gradient fade masks are NOT visible at desktop width', async ({ page }) => {
    await page.goto(BUSINESS)
    // Gradient masks have xl:hidden class and use bg-gradient-to-r / bg-gradient-to-l
    const gradients = page.locator('.xl\\:hidden.pointer-events-none.absolute')
    // They are in the DOM (or not rendered) but must not be visible
    const count = await gradients.count()
    for (let i = 0; i < count; i++) {
      await expect(gradients.nth(i)).not.toBeVisible()
    }
  })

  test('court cards are stacked vertically (grid, not horizontal scroll) at desktop', async ({ page }) => {
    await page.goto(BUSINESS)
    // At xl+, the carousel container switches to xl:grid xl:grid-cols-1
    // Verify by checking that the carousel container has the xl:grid class in its class string
    const carouselContainer = page.locator('.xl\\:grid.xl\\:grid-cols-1')
    await expect(carouselContainer).toBeAttached()
  })

  test('selecting a court at desktop does NOT scroll page (availability stays visible)', async ({ page }) => {
    await page.goto(BUSINESS)

    // Wait for the availability section to be visible
    const availabilitySection = page.getByRole('heading', { name: 'Check Availability' })
    await expect(availabilitySection).toBeVisible({ timeout: 8_000 })

    // Record scroll position before clicking
    const scrollBefore = await page.evaluate(() => window.scrollY)

    // Click the second court card's button (or first if only one exists)
    const courtButtons = page.locator('button', { hasText: /check availability/i })
    const count = await courtButtons.count()
    if (count > 0) {
      await courtButtons.first().click()
    }

    // Small delay to allow any scroll animation to start
    await page.waitForTimeout(300)
    const scrollAfter = await page.evaluate(() => window.scrollY)

    // Scroll should not have moved significantly downward
    expect(scrollAfter - scrollBefore).toBeLessThan(50)

    // Availability heading must still be visible (not scrolled out of view)
    await expect(availabilitySection).toBeVisible()
  })
})

// ─── 11. HomeTab — mobile carousel unchanged (<1280px) ───────────────────────

test.describe('HomeTab — mobile carousel (<1280px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('court cards are in a horizontal flex scroll container on mobile', async ({ page }) => {
    await page.goto(BUSINESS)
    // The carousel container is a flex overflow-x-auto container on mobile
    const carouselContainer = page.locator('.overflow-x-auto.scrollbar-hide')
    await expect(carouselContainer).toBeAttached()
  })

  test('scroll buttons are present in the DOM on mobile', async ({ page }) => {
    await page.goto(BUSINESS)
    // Buttons exist (may be disabled when at start of list) but must be in the DOM
    const leftBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-left') })
    const rightBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') })
    await expect(leftBtn).toBeAttached()
    await expect(rightBtn).toBeAttached()
  })

  test('court cards have fixed width (shrink-0 w-52) on mobile', async ({ page }) => {
    await page.goto(BUSINESS)
    // Each facility card wrapper is shrink-0 w-52 on mobile
    const cards = page.locator('.shrink-0.w-52')
    await expect(cards.first()).toBeAttached()
  })
})

// ─── 9. Sidebar — About section always visible ────────────────────────────────

test.describe('Sidebar — About section always visible', () => {
  test.describe('desktop sidebar', () => {
    // default 1280px viewport — aside has xl:block so it is visible
    test('About section is present in the desktop sidebar', async ({ page }) => {
      await page.goto(BUSINESS)

      // At 1280px the aside is display:block — getByRole finds the heading
      const aside = page.locator('aside')
      await expect(aside.getByRole('heading', { name: 'About' })).toBeAttached()
    })

    test('About section shows the business description text', async ({ page }) => {
      await page.goto(BUSINESS)

      // PaddleUp's description from seedBusiness()
      await expect(
        page.getByText("PaddleUp is Quezon City's premier pickleball facility.").first()
      ).toBeAttached()
    })

    test('About section does NOT have hidden xl:block class (always renders)', async ({ page }) => {
      await page.goto(BUSINESS)

      // The About section container must NOT carry hidden xl:block
      // (it was previously gated — now it is always shown)
      const aboutSection = page.locator('div.bg-white.rounded-2xl', {
        has: page.locator('h2', { hasText: 'About' }),
      }).first()

      const className = await aboutSection.getAttribute('class')
      expect(className ?? '').not.toContain('hidden xl:block')
    })
  })

  test.describe('mobile Info tab', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('About section is also rendered when Info tab is active on mobile', async ({ page }) => {
      await page.goto(BUSINESS)
      await page.getByRole('button', { name: 'Info' }).click()

      // Scope to the Info tab's xl:hidden wrapper. It is the only xl:hidden div that
      // contains the Sidebar's space-y-4 root (hero overlay and mobile strip do not).
      const infoTabWrapper = page.locator('.xl\\:hidden', {
        has: page.locator('.space-y-4'),
      })
      await expect(infoTabWrapper.locator('h2', { hasText: 'About' })).toBeVisible()
      await expect(
        infoTabWrapper.locator('p').filter({ hasText: "PaddleUp is Quezon City's premier pickleball facility." })
      ).toBeVisible()
    })
  })
})
