# bookit — Technical Progress & Handoff

> Last updated: 2026-04-28. Covers everything merged to `main` plus what is currently open in PR #12.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Data Model](#4-data-model)
5. [Security Rules](#5-security-rules)
6. [Feature Progress](#6-feature-progress)
7. [Admin Dashboard Deep-Dive](#7-admin-dashboard-deep-dive)
8. [Test Suite](#8-test-suite)
9. [Development Setup](#9-development-setup)
10. [Known Gaps & Security Backlog](#10-known-gaps--security-backlog)
11. [Next Steps — Phase 5](#11-next-steps--phase-5)

---

## 1. Project Overview

**bookit** is a multi-tenant court/facility booking platform. Each business gets its own storefront at `/<businessSlug>` (e.g. `/paddleup`). Customers browse courts, pick time slots, and pay. Business owners manage bookings through an admin dashboard at `/<businessSlug>/admin`.

Currently one business is configured (`paddleup` — a pickleball facility in Quezon City). The platform is designed so adding a new business is a config-only change in `src/lib/businesses.ts`.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 App Router | Breaking changes from earlier versions — read `node_modules/next/dist/docs/` before touching routing |
| Styling | Tailwind CSS v4 | |
| Database | Firebase Firestore | Client SDK (browser), emulator for local dev |
| Auth | Firebase Auth | Email/password only; emulator for local dev |
| Payments | PayMongo | Philippine payment gateway; not yet integrated |
| Hosting | Vercel | Auto-deploys `main` on merge |
| Testing | Playwright (E2E) + Vitest (unit + security rules) | |

---

## 3. Repository Structure

```
src/
  app/
    layout.tsx                  # Root layout — wraps AuthProvider
    page.tsx                    # Root redirect → /paddleup
    [businessSlug]/
      layout.tsx                # Per-business layout
      page.tsx                  # Storefront (booking flow)
      _components/              # Storefront UI components
        AvailabilitySection.tsx # Date picker + court selector + slot grid + booking bar
        FacilityCard.tsx
        BookingSection.tsx
        ...
      admin/
        page.tsx                # Admin entry point — renders AdminGuard + AdminView
  components/
    admin/
      AdminGuard.tsx            # Client-side auth + role check; redirects non-admins
      AdminView.tsx             # Shell: header, Schedule/Analytics tab bar
      AdminScheduleView.tsx     # Daily grid view with search bar
      AdminAnalyticsView.tsx    # Period selector + stat cards + charts
      ScheduleGrid.tsx          # Visual grid: courts as columns, hours as rows
      BookingDetailPanel.tsx    # Slide-in panel: booking info + cancel + reschedule
    booking/
      MyBookings.tsx            # Customer booking history tab
      SlotGrid.tsx              # Hour-slot grid for customer booking
      BookingActionBar.tsx      # Sticky bar showing price + Book button
      BookingConfirmModal.tsx   # Confirmation dialog before final booking
  context/
    AuthContext.tsx             # onAuthStateChanged + admin slug loading
  lib/
    types.ts                    # Business, Facility, OperatingHours interfaces
    businesses.ts               # Static business/facility config (source of truth)
    slots.ts                    # Slot generation, grouping, validation helpers
    firebase/
      client.ts                 # Firebase app init + emulator connection
      bookings.ts               # All Firestore booking reads/writes
      admin.ts                  # getAdminSlugs (reads /admins/{uid})
    booking/
      useSlotSelection.ts       # Drag-to-select hook used by SlotGrid
firestore.rules                 # Firestore security rules
tests/
  e2e/
    booking-flow.spec.ts        # 44 Playwright tests — full storefront flow
    admin.spec.ts               # 40 Playwright tests — admin dashboard
    helpers.ts                  # Seed/clear helpers for emulator
  security/
    firestore.rules.test.ts     # 34 Vitest tests — security rules unit tests
.github/workflows/
  ci.yml                        # Lint + type-check (no emulator)
  test.yml                      # Vitest unit tests (no emulator)
  e2e.yml                       # Security rules + E2E (spins up emulator)
```

---

## 4. Data Model

### `bookings` collection

```typescript
interface Booking {
  id: string;           // Firestore document ID
  userId: string;       // Firebase Auth UID of the booking owner
  userEmail: string;
  userName: string;
  businessSlug: string; // e.g. "paddleup"
  businessName: string;
  facilityId: string;   // e.g. "court-1"
  facilityName: string; // e.g. "Court 1"
  date: string;         // "YYYY-MM-DD" local date
  hours: number[];      // [9, 10] means 9 AM–11 AM (each entry = one hour slot)
  totalPrice: number;   // in lowest currency unit (PHP centavos? or whole pesos — TBC)
  currency: string;     // "PHP"
  status: "confirmed" | "cancelled";
  createdAt: Timestamp;
}
```

**No "completed" status in Firestore.** Past confirmed bookings are derived client-side in `MyBookings.tsx` using `isBookingPast()` — avoids background writes or Cloud Functions.

### `admins` collection

```
/admins/{uid}
  slugs: string[]   // e.g. ["paddleup"]
```

Written out-of-band (Firebase Console or `scripts/grant-admin.mjs`). No client writes allowed. Admin status is loaded once per auth state change in `AuthContext` and cached in `adminSlugs` state.

### Business config

Businesses and facilities live in `src/lib/businesses.ts` as a static array — **not in Firestore**. Slug, court names, prices, operating hours, and prime-time windows are all defined there. To add a new business, add an entry to that array and re-deploy.

---

## 5. Security Rules

Full rules are in `firestore.rules`. Key decisions:

| Rule | Rationale |
|---|---|
| `admins` write: always false | Admin records are managed out-of-band only — no client can grant themselves admin |
| `bookings` list: `status == "confirmed"` publicly readable | Required for the availability display (shows which slots are taken). Trade-off: full booking documents including `userId`/`userEmail` are visible. See gap #2 in §10. |
| `bookings` update (owner): only `status → "cancelled"` | Prevents users from changing price, date, or other fields |
| `bookings` update (admin): any field | Allows reschedule (date/facilityId/hours/totalPrice change) and cancel |
| `bookings` create (admin): userId can differ from auth.uid | Allows walk-in bookings on behalf of customers |
| `bookings` delete: always false | Soft-delete only — cancelled bookings are retained for audit |

The `isAdminOfSlug(slug)` helper function does a cross-document `get()` of `/admins/{uid}` — this counts toward Firestore read quotas on every rule evaluation that calls it.

---

## 6. Feature Progress

### Merged to `main`

| PR | Feature |
|---|---|
| #1–#7 | Initial booking flow: slot grid, drag selection, booking modal, Firebase integration, auth modal |
| #8 | Firestore security rules + 34 rule unit tests |
| #9 | README |
| #10 | Sidebar About card hidden on mobile |
| #11 | Admin dashboard Phase 1 (auth/access control) + Phase 2 (master schedule view) |

### Open in PR #12 (`feature/admin-phase3`)

- Admin dashboard Phase 3 — booking management (cancel, reschedule, search)
- Admin dashboard Phase 4 — analytics dashboard
- My Bookings "Completed" state for past bookings
- E2E test suite expansion (40 admin tests, 44 booking-flow tests)
- `AuthContext` hardening (try-catch on `getAdminSlugs` to prevent infinite loading spinner)
- `clearFirestore` AbortController timeout (prevents 30s test hangs when emulator is slow)

---

## 7. Admin Dashboard Deep-Dive

### Access control flow

```
User visits /<slug>/admin
  → AdminGuard checks AuthContext.loading
      → loading: show spinner
      → done, !isAdminOf(slug): router.replace(/<slug>)
      → done, isAdminOf(slug): render AdminView
```

`AuthContext` loads admin slugs from Firestore on every `onAuthStateChanged` event. If Firestore is unreachable the call is caught and loading resolves with empty slugs (user is redirected to storefront).

### AdminView shell

Tab bar with **Schedule** and **Analytics** tabs. Header contains business name/badge, "Public view" link, and Sign out button.

### Schedule tab — `AdminScheduleView`

- Date navigation (prev/next day chevrons)
- Search bar (filters by `userName` or `userEmail`, client-side)
- `ScheduleGrid`: courts as columns, hours as rows, booking blocks are buttons
- `BookingDetailPanel`: slides in on block click

### BookingDetailPanel — three states

1. **Detail view** — shows facility, date, time range, customer name/email, total price, booking ID. Two action buttons: "Cancel booking" and "Reschedule".
2. **Cancel confirm** — "Cancel this booking?" with Yes/No. Admin bypass: no 2-hour restriction (that only applies in MyBookings for customers).
3. **Reschedule form** — court dropdown, date input, live slot picker (fetches availability excluding the current booking via `getBookedHoursExcluding`), price preview. Conflict-checked via Firestore transaction on confirm.

Key implementation details:
- Panel is `key={selectedBooking.id}` — forces full remount when switching between bookings, resetting form state.
- Slot loading uses `useRef` request counter to discard stale async responses.
- `loadSlots()` is called from event handlers only (not `useEffect`) to satisfy the `react-hooks/set-state-in-effect` lint rule.

### Analytics tab — `AdminAnalyticsView`

Period selector: Today / This Week / This Month / Year to Date. All date ranges are computed in local time.

Stat cards (`data-testid` attributes set for E2E):
- `stat-revenue` — sum of `totalPrice` for confirmed bookings
- `stat-bookings` — count of confirmed bookings
- `stat-hours` — total hours booked (sum of `hours.length`)
- `stat-cancellation-rate` — `cancelled / total`; shown in red when > 15%

Additional sections (only rendered when `bookingCount > 0`):
- Court utilization — horizontal bars, width = `(courtHours / maxCourtHours) * 100%`
- Peak hours heatmap — horizontal bars per hour with booking count

### Firestore functions used by admin

| Function | Purpose |
|---|---|
| `getAllBookingsForDay(slug, date)` | Schedule grid — all statuses |
| `getBookedHoursExcluding(slug, facilityId, date, excludeId)` | Reschedule slot picker |
| `rescheduleBooking(bookingId, ...)` | Firestore transaction with conflict check |
| `cancelBooking(bookingId)` | Sets status → "cancelled" |
| `getBookingsInRange(slug, start, end)` | Analytics date-range query |

---

## 8. Test Suite

### Running locally

```bash
# Start emulators first (do this at the start of every session)
lsof -ti :8080 | xargs kill -9 2>/dev/null
lsof -ti :9099 | xargs kill -9 2>/dev/null
firebase emulators:start

# In a separate terminal
npm run test:security   # Vitest — Firestore rules (no browser needed)
npm run test:e2e        # Playwright — full app (needs dev server + emulators)
```

The Firestore emulator accumulates JVM gRPC threads over time. After a long-running session it can exhaust the OS thread limit, causing test hangs. **Always kill and restart the emulator before a test run.**

### E2E test helpers (`tests/e2e/helpers.ts`)

| Helper | What it does |
|---|---|
| `clearFirestore()` | DELETE all documents via emulator REST API (8s AbortController timeout) |
| `seedBooking(opts)` | Creates a confirmed booking; authenticates as seed user for rule compliance |
| `seedBookingForUser(opts)` | Creates a booking for a specific user using `Bearer owner` admin bypass; includes `createdAt` (required for `orderBy` queries) |
| `seedAdminDoc(uid, slugs)` | Writes `/admins/{uid}` using `Bearer owner` bypass |
| `createTestUser(email, password, displayName)` | Creates auth emulator user; safe to call multiple times |
| `signInUser(email, password)` | Returns `{ idToken, localId }` |
| `todayKey()` / `dateKeyDelta(n)` | Local-time date strings |

### Test patterns to know

**React 19 + Firebase mocks (unit tests):**
- Always mock `@/lib/firebase/bookings` in `AvailabilitySection` tests. Re-apply resolved values in `beforeEach` after `jest.clearAllMocks()`.
- Wrap renders in `await act(async () => { ... })` when components have async `useEffect`s.
- For click-drag interactions: wrap `mouseDown` in its own `act` before firing `mouseUp` on window — the `mouseUp` listener is re-registered after `mouseDown` commits.

**E2E slot tests:**
- Call `selectTomorrow(page)` before `waitForSlots(page)` — today's past hours are filtered in headless Chromium using UTC, making tests timezone-dependent. Tomorrow always shows all slots.
- `waitForSlots` first waits for "Loading availability…" to appear (2s timeout, swallowed), then waits for it to disappear — handles the race where loading finishes before the assertion runs.

---

## 9. Development Setup

See `README.md` for the full setup guide. Quick reference:

```bash
# Install deps
npm install

# Copy env
cp .env.example .env.local  # fill in Firebase config

# Start emulators (Auth + Firestore)
firebase emulators:start

# Dev server (separate terminal)
npm run dev

# Seed an admin user for local testing
node scripts/seed-admin-emulator.mjs
```

### Granting admin access

**Emulator:** `node scripts/seed-admin-emulator.mjs` — writes `/admins/{uid}` directly via the emulator REST API.

**Production:** `node scripts/grant-admin.mjs <email> <slug>` — uses `firebase-admin` with a service account. Requires `service-account.json` (gitignored) in the project root.

---

## 10. Known Gaps & Security Backlog

These were identified during a security review and intentionally deferred. They must be addressed before a production launch, especially before PayMongo goes live.

### Gap 1 — Client-side price calculation (critical before payments)

`totalPrice` is calculated in `useSlotSelection.ts` (browser) and written directly to Firestore. The security rule only checks `totalPrice > 0`, not that the amount is correct. A malicious user calling the Firebase SDK directly could write `totalPrice: 1`.

**Fix:** Route booking creation through a Next.js Server Action or API Route that recalculates `totalPrice` from `src/lib/businesses.ts` before writing to Firestore.

### Gap 2 — PII exposure via public availability query

The `bookings` list rule allows anyone to query `where("status", "==", "confirmed")`. This returns full booking documents including `userId`, `userEmail`, and `userName`.

**Fix:** Create a Cloud Function `getAvailability(businessSlug, facilityId, date)` that returns only the `hours` array. Lock down the `list` rule to remove the public `status == "confirmed"` branch.

### Gap 3 — PayMongo webhook signature verification (not yet built)

No webhook handler exists yet. When added, it must verify the `X-Paymongo-Signature` header using PayMongo's HMAC-SHA256 scheme before trusting the event.

### Gap 4 — No rate limiting on booking creation

A malicious user can flood `createBooking`, blocking all slots for a facility. Fix with Firebase App Check + Cloud Function wrapper, or Upstash Redis rate limiting in a Next.js API route.

---

## 11. Next Steps — Phase 5

Phase 5 is the next planned sprint: **Customer & Financial Ops**.

### 5a — Customer booking history in admin panel

When a booking is open in `BookingDetailPanel`, show a "Customer history" section listing the customer's other bookings (same `businessSlug`, same `userId`). Requires a new Firestore query: `where("businessSlug", "==", slug), where("userId", "==", uid), orderBy("createdAt", "desc")`.

### 5b — Payment status display

Add a `paymentStatus` field to the `Booking` interface (`"unpaid" | "paid" | "refunded"`). Display it as a badge in `BookingDetailPanel`. For now this can be a manual field — full PayMongo integration comes later.

### 5c — Refund prompt on admin cancel

When an admin cancels a booking, check if `paymentStatus === "paid"` and show a "Issue refund?" prompt. The actual refund call goes to the PayMongo refund API via a Next.js API route (never directly from the browser — the API key must stay server-side).

### 5d — Manual walk-in booking entry

Add a "New booking" button on the admin schedule view. Opens a form: customer name, email, court, date, time slots. On submit, calls `createBooking` with `userId = currentAdminUid` (or a dedicated walk-in sentinel ID). The Firestore rule already allows admins to create bookings where `userId !== auth.uid`.

### Suggested implementation order

1. Walk-in booking form (5d) — purely additive, no new fields needed, unblocks revenue
2. Payment status display (5b) — UI-only first, adds the field for future PayMongo wiring
3. Refund prompt on cancel (5c) — depends on 5b; stub the refund call until PayMongo is integrated
4. Customer history in panel (5a) — nice-to-have, can be done any time

### Tests to add alongside Phase 5

Add to `tests/e2e/admin.spec.ts`:
- Walk-in form: fills form, confirms, booking appears on grid
- Walk-in form: slot conflict shows error
- Refund prompt: appears when cancelling a paid booking; dismissed when cancelling an unpaid one
- Customer history: panel shows previous bookings for the same customer
