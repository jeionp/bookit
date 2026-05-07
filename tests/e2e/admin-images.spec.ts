import { test, expect, type Page } from '@playwright/test'
import {
  clearFirestore,
  createTestUser,
  signInUser,
  seedAdminDoc,
} from './helpers'

// ─── Constants ────────────────────────────────────────────────────────────────

const STOREFRONT = '/paddleup'
const ADMIN_PAGE = '/paddleup/admin'

const ADMIN_EMAIL    = 'admin-images@bookit-test.internal'
const ADMIN_PASSWORD = 'AdminPass1!'

const FIRESTORE = 'http://localhost:8080'
const PROJECT   = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'jidoka-pixels'

// Minimal valid JPEG header bytes — Storage emulator accepts this as an image/jpeg upload.
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

// ─── Local seed helpers ───────────────────────────────────────────────────────

/**
 * Seeds a minimal PaddleUp business doc.  Pass `noImages: true` to omit
 * coverImage and set an empty image on the first court — used for the
 * placeholder-visibility tests.
 */
async function seedBusinessDoc(opts: { noImages?: boolean } = {}) {
  const courtImageValue = opts.noImages ? '' : 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800'
  const coverImageValue = opts.noImages ? '' : 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1400'

  const body = {
    fields: {
      name:        { stringValue: 'PaddleUp' },
      type:        { stringValue: 'court' },
      tagline:     { stringValue: 'Where Pickleball Happens' },
      description: { stringValue: "PaddleUp is Quezon City's premier pickleball facility." },
      coverImage:  { stringValue: coverImageValue },
      location:    { stringValue: 'Quezon City, Metro Manila' },
      address:     { stringValue: '123 Katipunan Ave, Loyola Heights, Quezon City, 1108 Metro Manila' },
      phone:       { stringValue: '+63 917 123 4567' },
      email:       { stringValue: 'hello@paddleup.ph' },
      accentColor: { stringValue: '#16a34a' },
      rating:      { doubleValue: 4.8 },
      reviewCount: { integerValue: '214' },
      facilities: {
        arrayValue: {
          values: [
            {
              mapValue: {
                fields: {
                  id:                { stringValue: 'court-1' },
                  name:              { stringValue: 'Court 1' },
                  description:       { stringValue: 'Full-size outdoor court.' },
                  image:             { stringValue: courtImageValue },
                  pricePerHour:      { integerValue: '500' },
                  primePricePerHour: { integerValue: '600' },
                  primeTimeStart:    { integerValue: '17' },
                  currency:          { stringValue: 'PHP' },
                },
              },
            },
          ],
        },
      },
      amenities: {
        arrayValue: {
          values: [{ stringValue: 'Free Parking' }],
        },
      },
      operatingHours: {
        arrayValue: {
          values: [
            'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
          ].map((day) => ({
            mapValue: {
              fields: {
                day:   { stringValue: day },
                open:  { stringValue: '6:00 AM' },
                close: { stringValue: '10:00 PM' },
              },
            },
          })),
        },
      },
    },
  }

  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/businesses/paddleup`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) throw new Error(`seedBusinessDoc failed: ${await res.text()}`)
}

// ─── Local navigation helpers ─────────────────────────────────────────────────

async function signInOnStorefront(page: Page, email: string, password: string) {
  await page.goto(STOREFRONT)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Welcome back')).toBeVisible()
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 8_000 })
}

async function goToSettingsView(page: Page, adminUid: string) {
  await seedAdminDoc(adminUid, ['paddleup'])
  await signInOnStorefront(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  await page.getByRole('link', { name: /Admin/ }).click()
  await expect(page.getByLabel('Next day')).toBeVisible({ timeout: 8_000 })
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByTestId('settings-save-btn')).toBeVisible({ timeout: 8_000 })
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await createTestUser(ADMIN_EMAIL, ADMIN_PASSWORD, 'Admin Images User')
})

test.beforeEach(async () => {
  await clearFirestore()
})

// ─── Placeholder visibility ───────────────────────────────────────────────────

test.describe('Image placeholders', () => {
  test('storefront renders without crash when coverImage and court image are empty', async ({ page }) => {
    await seedBusinessDoc({ noImages: true })
    await page.goto(STOREFRONT)

    // The hero image falls back to placeholder-cover.svg
    await expect(
      page.locator('img[src*="placeholder-cover"]')
    ).toBeVisible({ timeout: 8_000 })

    // The court card falls back to placeholder-court.svg
    await expect(
      page.locator('img[src*="placeholder-court"]')
    ).toBeVisible({ timeout: 8_000 })
  })

  test('admin settings: court with empty image shows placeholder icon div, not a broken img', async ({ page }) => {
    await seedBusinessDoc({ noImages: true })
    const { localId: adminUid } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await goToSettingsView(page, adminUid)

    // Expand Court 1 — it has an empty image
    const court1 = page.getByTestId('settings-court-court-1')
    await court1.getByRole('button', { name: 'Court 1' }).click()

    // Within the ImageUpload for the court, the dashed-border placeholder div must
    // be present, not an <img> element (which would render broken with an empty src).
    const courtSection = court1.locator('.sm\\:col-span-2').filter({ hasText: 'Court Image' })
    await expect(
      courtSection.locator('div.border-dashed')
    ).toBeVisible({ timeout: 5_000 })
    await expect(
      courtSection.locator('img')
    ).not.toBeAttached()
  })
})

// ─── Upload flow (happy path) ─────────────────────────────────────────────────

test.describe('ImageUpload — file upload happy path', () => {
  test('uploading a valid JPEG updates the URL text input to a Storage URL', async ({ page }) => {
    await seedBusinessDoc()
    const { localId: adminUid } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await goToSettingsView(page, adminUid)

    // Expand Court 1
    const court1 = page.getByTestId('settings-court-court-1')
    await court1.getByRole('button', { name: 'Court 1' }).click()
    await expect(court1.locator('input[type="file"]')).toBeAttached({ timeout: 5_000 })

    // The file input inside the court's ImageUpload (Court Image section)
    const courtImageSection = court1.locator('.sm\\:col-span-2').filter({ hasText: 'Court Image' })
    const fileInput = courtImageSection.locator('input[type="file"]')
    const urlInput  = courtImageSection.locator('input[type="text"]')

    await fileInput.setInputFiles({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: JPEG_HEADER,
    })

    // Wait for the URL text input to change from its original value to a Storage URL.
    // The Storage emulator returns a URL starting with http://127.0.0.1:9199.
    await expect(urlInput).not.toHaveValue(
      /^https:\/\/images\.unsplash\.com/,
      { timeout: 15_000 }
    )
    const uploadedUrl = await urlInput.inputValue()
    expect(
      uploadedUrl.startsWith('http://127.0.0.1:9199') ||
      uploadedUrl.startsWith('https://firebasestorage.googleapis.com')
    ).toBe(true)
  })

  test('after upload, saving and reloading persists the new image URL', async ({ page }) => {
    await seedBusinessDoc()
    const { localId: adminUid } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await goToSettingsView(page, adminUid)

    // Expand Court 1 and upload
    const court1 = page.getByTestId('settings-court-court-1')
    await court1.getByRole('button', { name: 'Court 1' }).click()

    const courtImageSection = court1.locator('.sm\\:col-span-2').filter({ hasText: 'Court Image' })
    const fileInput = courtImageSection.locator('input[type="file"]')
    const urlInput  = courtImageSection.locator('input[type="text"]')

    await fileInput.setInputFiles({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: JPEG_HEADER,
    })
    // Wait for upload to complete
    await expect(urlInput).not.toHaveValue(
      /^https:\/\/images\.unsplash\.com/,
      { timeout: 15_000 }
    )
    const savedUrl = await urlInput.inputValue()

    // Save
    await page.getByTestId('settings-save-btn').click()
    await expect(page.getByText('Changes saved successfully.')).toBeVisible({ timeout: 8_000 })

    // Navigate away and back
    await page.goto(ADMIN_PAGE)
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByTestId('settings-save-btn')).toBeVisible({ timeout: 8_000 })

    const court1Again = page.getByTestId('settings-court-court-1')
    await court1Again.getByRole('button', { name: 'Court 1' }).click()

    const courtImageSectionAgain = court1Again.locator('.sm\\:col-span-2').filter({ hasText: 'Court Image' })
    await expect(courtImageSectionAgain.locator('input[type="text"]')).toHaveValue(savedUrl, { timeout: 8_000 })
  })
})

// ─── File validation errors (client-side) ────────────────────────────────────

test.describe('ImageUpload — client-side validation errors', () => {
  test('uploading a .txt file shows "Please select an image file." error', async ({ page }) => {
    await seedBusinessDoc()
    const { localId: adminUid } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await goToSettingsView(page, adminUid)

    // Expand Court 1
    const court1 = page.getByTestId('settings-court-court-1')
    await court1.getByRole('button', { name: 'Court 1' }).click()

    const courtImageSection = court1.locator('.sm\\:col-span-2').filter({ hasText: 'Court Image' })
    const fileInput = courtImageSection.locator('input[type="file"]')

    await fileInput.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    })

    await expect(page.getByText('Please select an image file.')).toBeVisible({ timeout: 5_000 })
  })

  test('uploading a file > 5 MB shows "Image must be under 5 MB." error', async ({ page }) => {
    await seedBusinessDoc()
    const { localId: adminUid } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await goToSettingsView(page, adminUid)

    // Expand Court 1
    const court1 = page.getByTestId('settings-court-court-1')
    await court1.getByRole('button', { name: 'Court 1' }).click()

    const courtImageSection = court1.locator('.sm\\:col-span-2').filter({ hasText: 'Court Image' })
    const fileInput = courtImageSection.locator('input[type="file"]')

    // 5 MB + 1 byte exceeds the 5 * 1024 * 1024 limit
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff)

    await fileInput.setInputFiles({
      name: 'huge.jpg',
      mimeType: 'image/jpeg',
      buffer: oversizedBuffer,
    })

    await expect(page.getByText('Image must be under 5 MB.')).toBeVisible({ timeout: 5_000 })
  })

  test('typing in the URL input dismisses an existing upload error', async ({ page }) => {
    await seedBusinessDoc()
    const { localId: adminUid } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await goToSettingsView(page, adminUid)

    // Expand Court 1 and trigger a validation error first
    const court1 = page.getByTestId('settings-court-court-1')
    await court1.getByRole('button', { name: 'Court 1' }).click()

    const courtImageSection = court1.locator('.sm\\:col-span-2').filter({ hasText: 'Court Image' })
    const fileInput = courtImageSection.locator('input[type="file"]')
    const urlInput  = courtImageSection.locator('input[type="text"]')

    await fileInput.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    })
    await expect(page.getByText('Please select an image file.')).toBeVisible({ timeout: 5_000 })

    // Typing in the URL input should clear the error
    await urlInput.fill('https://example.com/photo.jpg')
    await expect(page.getByText('Please select an image file.')).not.toBeAttached()
  })
})

// ─── Paste URL fallback ───────────────────────────────────────────────────────

test.describe('ImageUpload — paste URL fallback', () => {
  test('pasting a URL into cover image text input shows the preview img', async ({ page }) => {
    await seedBusinessDoc({ noImages: true })
    const { localId: adminUid } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await goToSettingsView(page, adminUid)

    // The Cover Image section is in Business Info (open by default)
    // Locate the ImageUpload for Cover Image
    const coverSection = page.locator('.sm\\:col-span-2').filter({ hasText: 'Cover Image' })
    const urlInput = coverSection.locator('input[type="text"]')

    const testUrl = 'https://example.com/my-cover.jpg'
    await urlInput.fill(testUrl)

    // Once a non-empty URL is typed, the <img> preview should appear
    await expect(
      coverSection.locator(`img[src="${testUrl}"]`)
    ).toBeVisible({ timeout: 5_000 })
  })
})
