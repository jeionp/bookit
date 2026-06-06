# verifier-web (bookit)

Bookit-specific startup sequence for the generic `verifier-web` skill. The Playwright script template and check patterns are in the user-level skill — this file provides the bookit environment setup.

---

## 1. Startup sequence

### Kill stale ports
```bash
lsof -ti :3000 | xargs kill -9 2>/dev/null
lsof -ti :8080 | xargs kill -9 2>/dev/null
lsof -ti :9099 | xargs kill -9 2>/dev/null
true
```

### Start Firebase emulators (background)
```bash
firebase emulators:start > /tmp/emulator.log 2>&1 &
```
Do NOT pass `--project` — reads `bookme-821b4` from `.firebaserc`.

Wait until Firestore is ready:
```bash
until curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ | grep -q 200; do sleep 1; done
echo "Emulator ready"
```

### Seed business data
**Pass both env vars explicitly** — `.env.local` is not auto-loaded by Node scripts:
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=bookme-821b4 \
node scripts/seed-businesses.mjs
```
Without `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, the seed writes to `demo-bookit` and storefront routes return 404.

### Start dev server (background)
```bash
npm run dev > /tmp/dev.log 2>&1 &
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q 200; do sleep 2; done
echo "Dev server ready"
```

### Verify seed worked
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/paddleup
# Expect 200. 404 → seed wrote to wrong project. 500 → emulator not running.
```

Available seeded slugs: `paddleup`, `smashpoint`, `padel-arena`, `pickle-club`, `ace-courts`

---

## 2. Playwright notes for bookit

- Use `require('playwright')` (CommonJS) — Playwright is a CJS package in this repo
- Script must run from `/Users/wabisabisoba/Developer/bookit/`
- Write to a `.cjs` file, run it, then delete: `node verify-<name>.cjs && rm verify-<name>.cjs`
- Tailwind breakpoints: `xl` = 1280px. Test mobile at 390×844, desktop at 1440×900
- `BookingActionBar` hides via CSS transform, not `display:none` — check for the "Book Now →" button text instead of `isVisible()` on the container

---

## 3. Teardown

```bash
lsof -ti :3000 | xargs kill -9 2>/dev/null
lsof -ti :8080 | xargs kill -9 2>/dev/null
lsof -ti :9099 | xargs kill -9 2>/dev/null
true
```
