@AGENTS.md

# Project: bookit

Multi-tenant court booking platform. Next.js 16 App Router, Firebase (Firestore + Auth), PayMongo payments, Tailwind CSS v4. Multi-tenancy is slug-based: `/[businessSlug]`. Do not suggest Prisma, Postgres, or non-Firebase auth libraries.

## Git workflow — mandatory

Always work on a `feature/<name>` branch. Never commit directly to `main`. After pushing the branch, open a PR and wait for CI before merging. Direct pushes to `main` skip CI and deploy untested code to Vercel.

## Test suite — run before every PR

Three suites, all require `firebase emulators:start` (Auth on 9099, Firestore on 8080):

| Command | Runner | What it covers |
|---|---|---|
| `npm run test:security` | Vitest | Firestore security rules (`tests/security/`) |
| `npm run test:e2e` | Playwright | Full booking + admin flows (`tests/e2e/`) |
| `npm test` | Vitest | Unit tests in `src/**/*.test.ts` (currently none) |

**Before running tests, always restart the emulators fresh:**
```
lsof -ti :8080 | xargs kill -9 2>/dev/null; lsof -ti :9099 | xargs kill -9 2>/dev/null; true
firebase emulators:start
```
A long-running emulator accumulates gRPC threads and eventually hangs — restart at the start of every session.

## Architecture quick-reference

- `src/lib/businesses.ts` — static business/facility config (source of truth for slugs, courts, prices, hours)
- `src/lib/firebase/client.ts` — Firebase SDK init + emulator connect
- `src/lib/firebase/bookings.ts` — all Firestore booking reads/writes
- `src/context/AuthContext.tsx` — auth state + admin slug loading (`admins/{uid}`)
- `src/components/admin/` — admin dashboard (AdminGuard, AdminView, AdminScheduleView, BookingDetailPanel, etc.)
- `firestore.rules` — security rules; must be updated alongside any new collection/field

## Admin dashboard state

RBAC: admins are identified by `/admins/{uid}` documents with a `slugs` array. `AdminGuard` reads this via `AuthContext` on every page load and redirects non-admins to the storefront.

Phases shipped: Auth & Access Control, Master Schedule View, Booking Management (cancel/reschedule/search), Analytics Dashboard (Revenue/Bookings/Hours/Cancellation Rate, court utilization, peak hours heatmap), Completed bookings in My Bookings.

Phase 5 (next): customer booking history in detail panel, payment status display, refund prompt on admin cancel, manual walk-in booking entry.

## Known security gaps (pre-production)

1. `totalPrice` is calculated client-side — needs server-side verification before PayMongo goes live.
2. Public confirmed-booking queries expose `userId`/`userEmail`/`userName` — move availability reads to a Cloud Function.
3. PayMongo webhook signature verification not yet implemented.
4. No rate limiting on `createBooking`.
