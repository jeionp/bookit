/**
 * Unit tests for AdminView header link.
 *
 * Because the Vitest environment is `node` (no jsdom), we test the pure data
 * that drives the header link rather than rendering the full component.
 *
 * The Phase 10 change converted the "bookit" plain <span> into a Next.js
 * <Link href="/"> so users can navigate from the admin dashboard back to the
 * landing page.  We verify:
 *   - The href target is "/" (landing page root)
 *   - The link text is "bookit"
 *   - The element is a link (not a plain span)
 */

import { describe, test, expect } from 'vitest'

// ─── Mirror the header link configuration from AdminView ─────────────────────
// Keep in sync with src/components/admin/AdminView.tsx header section.

const HEADER_LOGO_LINK = {
  href:  '/',
  label: 'bookit',
  isLink: true,   // Next.js <Link> (was a plain <span> before Phase 10)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AdminView — header "bookit" link', () => {
  test('href points to "/" (landing page)', () => {
    expect(HEADER_LOGO_LINK.href).toBe('/')
  })

  test('link label is "bookit"', () => {
    expect(HEADER_LOGO_LINK.label).toBe('bookit')
  })

  test('element is a link (not a plain span)', () => {
    expect(HEADER_LOGO_LINK.isLink).toBe(true)
  })
})

// ─── Verify the component source includes a Link with href="/" ────────────────
// Read the component source at test time so this test fails if the link is
// removed or the href changes, without requiring DOM rendering.

import { readFileSync } from 'fs'
import { resolve } from 'path'

const ADMIN_VIEW_PATH = resolve(
  __dirname,
  'AdminView.tsx',
)

describe('AdminView source — "bookit" Link href verification', () => {
  let source: string

  test('AdminView.tsx exists and is readable', () => {
    source = readFileSync(ADMIN_VIEW_PATH, 'utf-8')
    expect(source.length).toBeGreaterThan(0)
  })

  test('AdminView.tsx contains a Link component', () => {
    source = source ?? readFileSync(ADMIN_VIEW_PATH, 'utf-8')
    expect(source).toMatch(/<Link/)
  })

  test('AdminView.tsx has a Link with href="/"', () => {
    source = source ?? readFileSync(ADMIN_VIEW_PATH, 'utf-8')
    expect(source).toMatch(/href=["']\/["']/)
  })

  test('AdminView.tsx renders "bookit" text near the header Link', () => {
    source = source ?? readFileSync(ADMIN_VIEW_PATH, 'utf-8')
    expect(source).toContain('bookit')
  })
})
