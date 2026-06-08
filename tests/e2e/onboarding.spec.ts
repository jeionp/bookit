import { test, expect, type Page } from '@playwright/test'
import {
  clearFirestore,
  seedBusiness,
  createTestUser,
  signInUser,
  seedAdminDoc,
} from './helpers'

// ─── Constants ────────────────────────────────────────────────────────────────

const ONBOARDING     = '/onboarding'
const LANDING        = '/'
const PROJECT        = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bookme-821b4'
const FIRESTORE      = 'http://localhost:8080'

const OWNER_EMAIL    = 'owner@bookit-test.internal'
const OWNER_PASSWORD = 'OwnerPass1!'

const ADMIN_EMAIL    = 'admin@bookit-test.internal'
const ADMIN_PASSWORD = 'AdminPass1!'

const NONADMIN_EMAIL    = 'nonadmin@bookit-test.internal'
const NONADMIN_PASSWORD = 'NonAdminPass1!'

// ─── Firestore seeding helper ─────────────────────────────────────────────────

// Seeds a business document for an arbitrary slug using the emulator admin-bypass token.
// Use this instead of seedBusiness() when you need to seed a slug other than paddleup.
async function seedBusinessSlug(slug: string, name: string): Promise<void> {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/businesses/${slug}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer owner',
      },
      body: JSON.stringify({
        fields: {
          name:        { stringValue: name },
          slug:        { stringValue: slug },
          type:        { stringValue: 'court' },
          tagline:     { stringValue: '' },
          description: { stringValue: '' },
          coverImage:  { stringValue: '' },
          location:    { stringValue: '' },
          address:     { stringValue: '' },
          phone:       { stringValue: '' },
          email:       { stringValue: '' },
          accentColor: { stringValue: '#3B82F6' },
          rating:      { doubleValue: 0 },
          reviewCount: { integerValue: '0' },
          facilities:  { arrayValue: { values: [] } },
          amenities:   { arrayValue: { values: [] } },
          operatingHours: { arrayValue: { values: [] } },
          ownerId:     { stringValue: 'seed-owner' },
          status:      { stringValue: 'active' },
        },
      }),
    }
  )
  if (!res.ok) throw new Error(`seedBusinessSlug failed: ${await res.text()}`)
}

// ─── Page helpers ─────────────────────────────────────────────────────────────

// Signs in via the AuthModal that appears within a given page context.
// Assumes the modal is already open (the "Welcome back" heading is visible).
async function signInViaModal(page: Page, email: string, password: string) {
  await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 8_000 })
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
}

// Signs up a brand-new account via the AuthModal Sign Up tab.
// Assumes the modal is already open.
async function signUpViaModal(page: Page, displayName: string, email: string, password: string) {
  await page.getByRole('button', { name: /sign up/i }).click()
  await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible({ timeout: 8_000 })
  await page.getByPlaceholder('Juan dela Cruz').fill(displayName)
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.locator('form').getByRole('button', { name: /create account/i }).click()
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  // Pre-create persistent users so sign-in is fast in each test.
  // createTestUser is safe to call multiple times (EMAIL_EXISTS is silently ignored).
  await createTestUser(OWNER_EMAIL, OWNER_PASSWORD, 'Business Owner')
  await createTestUser(ADMIN_EMAIL, ADMIN_PASSWORD, 'Admin User')
  await createTestUser(NONADMIN_EMAIL, NONADMIN_PASSWORD, 'Non-Admin User')
})

test.beforeEach(async () => {
  await clearFirestore()
  await seedBusiness() // seeds businesses/paddleup
})

// ─── OnboardingGuard & auth gate ─────────────────────────────────────────────

test.describe('OnboardingGuard — auth gate', () => {
  // Unauthenticated users must see the sign-in prompt, not the wizard or a 404.
  test('unauthenticated visit shows sign-in prompt, not the wizard', async ({ page }) => {
    await page.goto(ONBOARDING)

    // The prompt card contains the CTA button
    await expect(
      page.getByRole('button', { name: /sign in \/ create account/i })
    ).toBeVisible({ timeout: 8_000 })

    // Step 1 heading must NOT be present — the wizard must not render
    await expect(page.getByRole('heading', { name: 'Business Info' })).not.toBeAttached()
  })

  // After clicking the CTA and signing in, the wizard (Step 1) should appear.
  test('signing in from the auth prompt reveals the wizard', async ({ page }) => {
    await page.goto(ONBOARDING)

    await page.getByRole('button', { name: /sign in \/ create account/i }).click()
    await signInViaModal(page, OWNER_EMAIL, OWNER_PASSWORD)

    // Step 1 heading confirms the wizard mounted
    await expect(page.getByRole('heading', { name: 'Business Info' })).toBeVisible({ timeout: 8_000 })
    // The auth prompt must have gone away
    await expect(
      page.getByRole('button', { name: /sign in \/ create account/i })
    ).not.toBeAttached()
  })

  // A brand-new account created via the Sign Up tab should land directly in the wizard.
  test('signing up a new account from the prompt reveals the wizard', async ({ page }) => {
    const newEmail = `signup-guard-${Date.now()}@bookit-test.internal`

    await page.goto(ONBOARDING)
    await page.getByRole('button', { name: /sign in \/ create account/i }).click()
    await signUpViaModal(page, 'New Owner', newEmail, 'NewPass1!')

    await expect(page.getByRole('heading', { name: 'Business Info' })).toBeVisible({ timeout: 8_000 })
    await expect(
      page.getByRole('button', { name: /sign in \/ create account/i })
    ).not.toBeAttached()
  })
})

// ─── Slug field (Step 1) ──────────────────────────────────────────────────────

test.describe('Step 1 — slug field behaviour', () => {
  // Sign in and land on the wizard before each test in this group.
  async function goToStep1(page: Page) {
    await page.goto(ONBOARDING)
    await page.getByRole('button', { name: /sign in \/ create account/i }).click()
    await signInViaModal(page, OWNER_EMAIL, OWNER_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Business Info' })).toBeVisible({ timeout: 8_000 })
  }

  // Typing a business name should auto-populate the slug input (slugified form).
  test('slug is auto-derived from the business name', async ({ page }) => {
    await goToStep1(page)

    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Ace Courts')

    // slug input should show "ace-courts" (slugified) — allow enough time for the
    // useEffect to fire and the debounced availability check to start
    const slugInput = page.locator('input[placeholder="your-business"]')
    await expect(slugInput).toHaveValue('ace-courts', { timeout: 3_000 })
  })

  // When the derived slug is not taken the green checkmark and "Available" text appear.
  test('available slug shows green checkmark and enables Next', async ({ page }) => {
    await goToStep1(page)

    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Ace Courts')

    // Wait for the debounced check (400 ms) + network round trip
    await expect(page.getByText('Available')).toBeVisible({ timeout: 8_000 })

    const nextBtn = page.getByRole('button', { name: /next.*branding/i })
    await expect(nextBtn).toBeEnabled({ timeout: 8_000 })
  })

  // When the slug matches an existing business the red X and "Already taken" copy appear
  // and Next stays disabled.
  test('taken slug shows error message and keeps Next disabled', async ({ page }) => {
    // Seed a business with the slug we will try to claim
    await seedBusinessSlug('taken-slug', 'Taken Business')

    await goToStep1(page)

    // Manually set the slug to the taken value
    const slugInput = page.locator('input[placeholder="your-business"]')
    await slugInput.fill('taken-slug')

    await expect(page.getByText(/already taken/i)).toBeVisible({ timeout: 8_000 })

    const nextBtn = page.getByRole('button', { name: /next.*branding/i })
    await expect(nextBtn).toBeDisabled()
  })

  // A slug that is too short (< 3 chars that satisfy the regex) must be flagged invalid.
  test('invalid slug shows validation message and keeps Next disabled', async ({ page }) => {
    await goToStep1(page)

    const slugInput = page.locator('input[placeholder="your-business"]')
    // "a" is only 1 character — fails isValidSlug which requires ^[a-z0-9][a-z0-9-]{1,}[a-z0-9]$
    await slugInput.fill('a')

    await expect(
      page.getByText(/use lowercase letters, numbers, and hyphens only/i)
    ).toBeVisible({ timeout: 3_000 })

    const nextBtn = page.getByRole('button', { name: /next.*branding/i })
    await expect(nextBtn).toBeDisabled()
  })

  // The user must be able to override the auto-derived slug with a custom value.
  test('user can manually edit the slug field', async ({ page }) => {
    await goToStep1(page)

    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Ace Courts')
    const slugInput = page.locator('input[placeholder="your-business"]')
    await expect(slugInput).toHaveValue('ace-courts', { timeout: 3_000 })

    // Overwrite with a custom slug
    await slugInput.fill('my-custom-slug')

    await expect(slugInput).toHaveValue('my-custom-slug')
    // Availability check fires for the new value
    await expect(page.getByText('Available')).toBeVisible({ timeout: 8_000 })
  })
})

// ─── Step navigation & validation ─────────────────────────────────────────────

test.describe('Step navigation & validation', () => {
  async function goToStep1(page: Page) {
    await page.goto(ONBOARDING)
    await page.getByRole('button', { name: /sign in \/ create account/i }).click()
    await signInViaModal(page, OWNER_EMAIL, OWNER_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Business Info' })).toBeVisible({ timeout: 8_000 })
  }

  // Next on Step 1 must be disabled when neither name nor slug have been entered.
  test('Next is disabled on Step 1 when name and slug are empty', async ({ page }) => {
    await goToStep1(page)

    const nextBtn = page.getByRole('button', { name: /next.*branding/i })
    await expect(nextBtn).toBeDisabled()
  })

  // Navigating back from Step 2 to Step 1 must preserve what was typed in Step 1.
  test('navigating back from Step 2 preserves Step 1 data', async ({ page }) => {
    await goToStep1(page)

    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Preserve Test')
    await expect(page.getByText('Available')).toBeVisible({ timeout: 8_000 })

    await page.getByRole('button', { name: /next.*branding/i }).click()

    // Now on Step 2
    await expect(page.getByRole('heading', { name: 'Branding' })).toBeVisible({ timeout: 8_000 })

    // Go back
    await page.getByRole('button', { name: /back/i }).click()

    // Step 1 must still show the name
    await expect(page.getByPlaceholder('e.g. Ace Courts Manila')).toHaveValue('Preserve Test')
    // Slug must still be derived and shown
    await expect(page.locator('input[placeholder="your-business"]')).toHaveValue('preserve-test')
  })

  // Next on Step 3 must be disabled until at least one facility has both name and price.
  test('Step 3 Next is disabled with no facilities', async ({ page }) => {
    await goToStep1(page)

    // Complete Step 1
    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Step Nav Test')
    await expect(page.getByText('Available')).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /next.*branding/i }).click()

    // Step 2 — skip (Next always enabled)
    await expect(page.getByRole('heading', { name: 'Branding' })).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /next.*facilities/i }).click()

    // Step 3 — no facilities yet; Next must be disabled
    await expect(page.getByRole('heading', { name: 'Facilities & Hours' })).toBeVisible({ timeout: 8_000 })
    const nextBtn = page.getByRole('button', { name: /next.*payments/i })
    await expect(nextBtn).toBeDisabled()
  })

  // Adding a facility and filling name + price must enable Next on Step 3.
  test('Step 3 Next is enabled after adding a facility with name and price', async ({ page }) => {
    await goToStep1(page)

    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Facility Enable Test')
    await expect(page.getByText('Available')).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /next.*branding/i }).click()

    await expect(page.getByRole('heading', { name: 'Branding' })).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /next.*facilities/i }).click()

    await expect(page.getByRole('heading', { name: 'Facilities & Hours' })).toBeVisible({ timeout: 8_000 })

    // Click the large "Add your first facility" dashed button
    await page.getByRole('button', { name: /add your first facility/i }).click()

    // The new facility card should be expanded (it is the first card, opened by default)
    await page.locator('input[placeholder="e.g. Court A"]').fill('Court A')
    await page.locator('input[placeholder="e.g. 500"]').fill('500')

    const nextBtn = page.getByRole('button', { name: /next.*payments/i })
    await expect(nextBtn).toBeEnabled({ timeout: 3_000 })
  })
})

// ─── Happy path (full wizard) ─────────────────────────────────────────────────

test.describe('Happy path — full wizard submission', () => {
  // Complete the 5-step wizard end-to-end and assert redirection to the admin page.
  test('new user completes wizard and lands on admin page', async ({ page }) => {
    // Use a fresh email so the wizard is not blocked by an existing admin doc
    const freshEmail = `happy-path-${Date.now()}@bookit-test.internal`
    const freshPassword = 'HappyPass1!'

    await page.goto(ONBOARDING)
    await page.getByRole('button', { name: /sign in \/ create account/i }).click()

    // Sign up a brand-new account
    await signUpViaModal(page, 'Happy Owner', freshEmail, freshPassword)

    // ── Step 1 ──
    await expect(page.getByRole('heading', { name: 'Business Info' })).toBeVisible({ timeout: 8_000 })
    await page.getByPlaceholder('e.g. Ace Courts Manila').fill('Test Venue')

    // Wait for slug to auto-derive and the availability check to resolve
    const slugInput = page.locator('input[placeholder="your-business"]')
    await expect(slugInput).toHaveValue('test-venue', { timeout: 3_000 })
    await expect(page.getByText('Available')).toBeVisible({ timeout: 8_000 })

    await page.getByRole('button', { name: /next.*branding/i }).click()

    // ── Step 2 (skip — no required fields) ──
    await expect(page.getByRole('heading', { name: 'Branding' })).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /next.*facilities/i }).click()

    // ── Step 3 ──
    await expect(page.getByRole('heading', { name: 'Facilities & Hours' })).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: /add your first facility/i }).click()
    await page.locator('input[placeholder="e.g. Court A"]').fill('Court A')
    await page.locator('input[placeholder="e.g. 500"]').fill('500')

    await expect(page.getByRole('button', { name: /next.*payments/i })).toBeEnabled({ timeout: 3_000 })
    await page.getByRole('button', { name: /next.*payments/i }).click()

    // ── Step 4 — Payments ──
    await expect(page.getByRole('heading', { name: 'Payment Options' })).toBeVisible({ timeout: 8_000 })
    // Enable at least one payment method so "Next →" is enabled
    // Click the label wrapper (not the sr-only checkbox) — the toggle div intercepts direct clicks
    await page.locator('label').filter({ hasText: 'Pay at Venue' }).click()
    await page.getByRole('button', { name: /^next →/i }).click()

    // ── Step 5 — Review ──
    await expect(page.getByRole('heading', { name: 'Review & Launch' })).toBeVisible({ timeout: 8_000 })

    // Review summary must show the business name and slug URL
    await expect(page.getByText('Test Venue')).toBeVisible()
    await expect(page.getByText('serbi.app/test-venue')).toBeVisible()

    // Facility must appear in the review
    await expect(page.getByText('Court A')).toBeVisible()
    await expect(page.getByText('₱500/hr')).toBeVisible()

    // Click the launch button
    await page.getByRole('button', { name: /launch my business/i }).click()

    // Success overlay replaces the wizard — assert the "You're live!" heading appears
    await expect(page.getByRole('heading', { name: /you.re live/i })).toBeVisible({ timeout: 15_000 })

    // Click "Go to your dashboard →" to navigate to the admin page
    await page.getByRole('link', { name: /go to your dashboard/i }).click()

    // Should now be on the admin page
    await expect(page).toHaveURL('/test-venue/admin', { timeout: 8_000 })
  })
})

// ─── AdminGuard redirect ──────────────────────────────────────────────────────

test.describe('AdminGuard redirect behaviour', () => {
  // A signed-in user with NO admin slugs visiting an admin page must be sent to /onboarding.
  test('signed-in user with no admin slugs is redirected to /onboarding', async ({ page }) => {
    // Sign in on the storefront so AuthContext loads, then navigate to admin
    await page.goto('/paddleup')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await signInViaModal(page, NONADMIN_EMAIL, NONADMIN_PASSWORD)
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 8_000 })

    await page.goto('/paddleup/admin')

    // AdminGuard should redirect to /onboarding (adminSlugs is empty)
    await expect(page).toHaveURL(ONBOARDING, { timeout: 8_000 })
  })

  // A signed-in user WITH the correct admin slug must be allowed through and stay on admin.
  test('signed-in user with matching admin slug stays on admin page', async ({ page }) => {
    const { localId } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await seedAdminDoc(localId, ['paddleup'])

    await page.goto('/paddleup')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await signInViaModal(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 8_000 })

    await page.getByRole('link', { name: 'Admin', exact: true }).click()

    await expect(page).toHaveURL('/paddleup/admin', { timeout: 8_000 })
    // The schedule grid is the landmark that confirms AdminView rendered
    await expect(page.getByLabel('Next day')).toBeVisible({ timeout: 8_000 })
  })
})

// ─── Landing page ─────────────────────────────────────────────────────────────

test.describe('Landing page', () => {
  // The hero section and "How it works" section must render on the root route.
  test('shows hero section and "How it works" on /', async ({ page }) => {
    await page.goto(LANDING)

    // Hero headline copy
    await expect(page.getByText(/every court/i)).toBeVisible({ timeout: 8_000 })

    // "How it works" section
    await expect(page.getByText(/how.*serbi.*works/i)).toBeVisible({ timeout: 8_000 })
  })

  // Searching for a known business name should surface its card.
  test('searching for a seeded business shows its card', async ({ page }) => {
    await page.goto(LANDING)

    await page.getByPlaceholder(/search by business name/i).fill('PaddleUp')
    await page.getByRole('button', { name: /search/i }).click()

    // Business card heading
    await expect(page.getByText('PaddleUp')).toBeVisible({ timeout: 8_000 })
    await expect(page).toHaveURL('/?q=PaddleUp')
  })

  // Searching for a term that matches nothing must show the empty state.
  test('searching for nonexistent term shows empty state', async ({ page }) => {
    await page.goto(LANDING)

    await page.getByPlaceholder(/search by business name/i).fill('nonexistent-xyz-12345')
    await page.getByRole('button', { name: /search/i }).click()

    // Target the empty-state description which is unique (the heading "No businesses found"
    // also appears in the count subtitle, so we match the description paragraph instead)
    await expect(page.getByText(/couldn't find anything matching/i)).toBeVisible({ timeout: 8_000 })
  })

  // The "Clear search" link on a search-results page must navigate back to the full listing.
  test('"Clear search" link returns to full listing', async ({ page }) => {
    await page.goto('/?q=nonexistent-xyz-12345')

    await expect(page.getByText(/couldn't find anything matching/i)).toBeVisible({ timeout: 8_000 })

    // "Clear search" link text matches the source code
    await page.getByRole('link', { name: /clear search/i }).first().click()

    // URL must no longer have a query param
    await expect(page).toHaveURL(LANDING, { timeout: 8_000 })

    // PaddleUp should be visible in the full listing
    await expect(page.getByText('PaddleUp')).toBeVisible({ timeout: 8_000 })
  })

  // The business-owner CTA section must be present on the landing page.
  test('shows business-owner CTA section', async ({ page }) => {
    await page.goto(LANDING)

    await expect(page.getByText(/own a court or space/i)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByRole('link', { name: /start for free/i })).toBeVisible()
  })

  // The "Start for free" CTA must link to /onboarding.
  test('"Start for free" CTA links to /onboarding', async ({ page }) => {
    await page.goto(LANDING)

    const ctaLink = page.getByRole('link', { name: /start for free/i })
    await expect(ctaLink).toBeVisible({ timeout: 8_000 })
    await expect(ctaLink).toHaveAttribute('href', '/onboarding')
  })

  // The nav "Sign in" button must open the AuthModal.
  test('nav Sign in button opens the AuthModal', async ({ page }) => {
    await page.goto(LANDING)

    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 8_000 })
  })
})
