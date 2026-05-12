@AGENTS.md

# Project: bookit

Multi-tenant court booking platform. Next.js 16 App Router, Firebase (Firestore + Auth), PayMongo payments, Tailwind CSS v4. Multi-tenancy is slug-based: `/[businessSlug]`. Do not suggest Prisma, Postgres, or non-Firebase auth libraries.

## Git workflow — mandatory

Always work on a `feature/<name>` branch. Never commit directly to `main`. After pushing the branch, open a PR and wait for CI before merging. Direct pushes to `main` skip CI and deploy untested code to Vercel.

**Before creating any new branch**, sync with the latest main to avoid merge conflicts at PR time:
```
git checkout main && git pull origin main
git checkout -b feature/<name>
```

## Test suite — run before every PR

Three suites, all require `firebase emulators:start` (Auth on 9099, Firestore on 8080):

| Command | Runner | What it covers |
|---|---|---|
| `npm run test:security` | Vitest | Firestore security rules (`tests/security/`) — emulator required |
| `npm run test:e2e` | Playwright | Full booking + admin flows (`tests/e2e/`) — emulator required |
| `npm test` | Vitest | Unit tests in `src/**/*.test.ts` — no emulator (all Firebase calls are mocked) |

**Before running tests, always restart the emulators fresh:**
```
lsof -ti :8080 | xargs kill -9 2>/dev/null; lsof -ti :9099 | xargs kill -9 2>/dev/null; true
firebase emulators:start
```
A long-running emulator accumulates gRPC threads and eventually hangs — restart at the start of every session.

**Do not pass `--project` to `firebase emulators:start`** — it picks up `bookme-821b4` from `.firebaserc`, which must match `NEXT_PUBLIC_FIREBASE_PROJECT_ID` in `.env.local`. A mismatch causes `adminAuth.verifyIdToken` to fail in tests that exercise admin-authenticated API routes.

## Architecture quick-reference

- `src/lib/firebase/businesses.ts` — Firestore business/facility config reads (source of truth; seeded via `npm run seed:businesses`)
- `src/lib/firebase/client.ts` — Firebase client SDK init + emulator connect
- `src/lib/firebase/admin-app.ts` — Firebase Admin SDK init (server-only; lazy proxy pattern)
- `src/lib/firebase/bookings.ts` — all Firestore booking reads/writes (client SDK)
- `src/app/api/` — server-side API routes (availability, bookings, businesses PATCH, refund, invite)
- `src/context/AuthContext.tsx` — auth state + admin slug loading (`admins/{uid}`)
- `src/components/admin/` — admin dashboard (AdminGuard, AdminView, AdminScheduleView, BookingDetailPanel, AdminSettingsView, etc.)
- `firestore.rules` — security rules; must be updated alongside any new collection/field

## Admin dashboard state

RBAC: admins are identified by `/admins/{uid}` documents with a `slugs` array. `AdminGuard` reads this via `AuthContext` on every page load and redirects non-admins to the storefront.

Phases shipped (all on main): Auth & Access Control, Master Schedule View, Booking Management (cancel/reschedule/search), Analytics Dashboard, Walk-in bookings, Payment status + refund prompt, Customer history, Settings tab (business info, per-court hours, amenities).

Phase 7 (next): Firebase Storage for court images, landing page + business onboarding flow. PayMongo integration is explicitly deferred pending per-business credential onboarding design.

## Known security gaps (pre-production)

Fixed in PRs #31–#32:
- ~~`totalPrice` calculated client-side~~ → recalculated server-side in `POST /api/bookings`
- ~~Public confirmed-booking list exposes PII~~ → availability reads moved to `GET /api/availability` (Admin SDK)
- ~~No rate limiting on booking creation~~ → Upstash Redis sliding window on `POST /api/bookings`
- ~~`/api/refund` had no auth~~ → Bearer token + admin slug check added
- ~~`PATCH /api/businesses/[slug]` accepted arbitrary body~~ → field allowlist enforced

Still open (address before PayMongo goes live):
1. TOCTOU in `cancelBookingWithRefund` — Firestore updated before refund API call resolves
2. `rescheduleBooking` writes client-supplied price — needs server-side validation
3. PayMongo webhook signature verification not yet implemented
