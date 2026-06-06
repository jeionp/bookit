# verifier-web

Use this skill to verify UI/UX changes to the bookit storefront or admin dashboard in a real browser. It covers the full startup sequence (emulators → seed → dev server) and the Playwright pattern for this repo.

---

## 1. Startup sequence

Run these in order. Each step must succeed before the next.

### Kill stale emulator ports
```bash
lsof -ti :8080 | xargs kill -9 2>/dev/null
lsof -ti :9099 | xargs kill -9 2>/dev/null
true
```

### Start Firebase emulators (background)
```bash
firebase emulators:start > /tmp/emulator.log 2>&1 &
```
Do NOT pass `--project` — it reads `bookme-821b4` from `.firebaserc`.

Wait until Firestore is ready:
```bash
until curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ | grep -q 200; do sleep 1; done
echo "Emulator ready"
```

### Seed business data into emulator
**Critical:** pass both env vars explicitly — `.env.local` is not auto-loaded by Node scripts.
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=bookme-821b4 \
node scripts/seed-businesses.mjs
```
Without `NEXT_PUBLIC_FIREBASE_PROJECT_ID=bookme-821b4`, the seed silently writes to `demo-bookit` and every storefront route returns 404.

### Start dev server (background)
```bash
lsof -ti :3000 | xargs kill -9 2>/dev/null; true
npm run dev > /tmp/dev.log 2>&1 &
```

Wait until ready:
```bash
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q 200; do sleep 2; done
echo "Dev server ready"
```

### Verify a target route loads
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/paddleup
# Expect 200. If 404 → seed wrote to wrong project (see note above).
# If 500 → emulator not running, or dev server started before emulator was ready.
```

Available seeded slugs: `paddleup`, `smashpoint`, `padel-arena`, `pickle-club`, `ace-courts`

---

## 2. Playwright pattern

Playwright is a CommonJS package in this repo. The script **must run from the project root** and use `require('playwright')`.

### Script template
Write to a `.cjs` file in the project root, run it, then delete it:

```javascript
// verify-<name>.cjs  (run from /Users/wabisabisoba/Developer/bookit/)
const { chromium } = require('playwright');
const { mkdirSync } = require('fs');

(async () => {
  const OUT = '/tmp/verify-<name>';
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // ── MOBILE (iPhone 14 Pro equivalent) ─────────────────────────────────────
  const mobile = await browser.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto('http://localhost:3000/<slug>', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await mobile.waitForTimeout(2000); // let React hydrate + data fetch settle

  // Visibility check — ALWAYS use isVisible(), NOT count()
  // count() includes CSS-hidden elements; isVisible() respects display:none / xl:hidden
  const ctaVisible = await mobile.locator('button', { hasText: 'Book a slot →' }).first().isVisible();
  console.log('CTA visible on mobile:', ctaVisible);

  await mobile.screenshot({ path: `${OUT}/mobile-<desc>.png` });

  // ── DESKTOP (1440p) ────────────────────────────────────────────────────────
  const desktop = await browser.newPage();
  await desktop.setViewportSize({ width: 1440, height: 900 });
  await desktop.goto('http://localhost:3000/<slug>', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await desktop.waitForTimeout(2000);

  // xl:hidden elements return isVisible() = false at 1440px — correct
  const ctaOnDesktop = await desktop.locator('button', { hasText: 'Book a slot →' }).first().isVisible();
  console.log('CTA visible on desktop (expect false):', ctaOnDesktop);

  await desktop.screenshot({ path: `${OUT}/desktop-<desc>.png` });

  await browser.close();
  console.log('Screenshots ->', OUT);
})().catch(e => { console.error(e); process.exit(1); });
```

### Run and clean up
```bash
node verify-<name>.cjs && rm verify-<name>.cjs
```

---

## 3. Common check patterns

| What to verify | Playwright snippet |
|---|---|
| Element visible | `await locator.first().isVisible()` → `true` |
| Element hidden (`xl:hidden`) | `await locator.first().isVisible()` → `false` |
| CSS class present | `await locator.getAttribute('class')` → includes string |
| Scroll into view after click | click → `waitForTimeout(800)` → `locator.boundingBox()` → `y < viewportHeight` |
| Text truncated (`line-clamp-2`) | `await page.locator('.line-clamp-2').count()` → `>= 1` |
| Toggle expand | click toggle → `await page.locator('.line-clamp-2').count()` → `0` |
| Tab switch | click tab button → check tab content `isVisible()` |

---

## 4. Teardown

To stop the emulator and dev server after a session:
```bash
lsof -ti :3000 | xargs kill -9 2>/dev/null
lsof -ti :8080 | xargs kill -9 2>/dev/null
lsof -ti :9099 | xargs kill -9 2>/dev/null
true
```

---

## 5. Relationship to the E2E test suite

The existing `npm run test:e2e` suite (`tests/e2e/`) tests business logic flows (booking, payment, admin actions). It does **not** assert visual layout or responsive breakpoint behaviour.

This verifier skill fills that gap — use it after UI/UX changes to confirm layout, visibility, and interaction feel in a real browser before the PR is merged. The two are complementary, not redundant.
