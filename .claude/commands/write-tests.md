Bookit-specific extension of the generic `/write-tests`. The generic command covers structure and principles; this file adds bookit-specific mock patterns and E2E selectors.

---

## Bookit file map

| What changed | Test file |
|---|---|
| `src/app/api/X/route.ts` | `src/app/api/X/route.test.ts` |
| `firestore.rules` | `tests/security/` |
| Any UI flow | `tests/e2e/` |
| `src/lib/X.ts` | co-located `src/lib/X.test.ts` |

---

## Unit test — key mock patterns

```typescript
// Module-level mock — use vi.hoisted for values referenced in vi.mock factories
const mockFn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/some-module', () => ({ someExport: mockFn }));

// Upstash Ratelimit — MUST use a regular function, not an arrow function
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    function MockRatelimit() { return { limit: mockRatelimitLimit }; },
    { slidingWindow: vi.fn() },
  ),
}));

// Singleton reset between describe blocks:
// vi.clearAllMocks() does NOT reset mockResolvedValue — use vi.resetAllMocks()
vi.resetModules();
const mod = await import('./route');  // use 'mod', not 'module' (blocked by ESLint rule)
```

---

## E2E patterns

- **Slot tests:** call `selectTomorrow(page)` before `waitForSlots` — headless Chromium filters past hours by UTC, so today's morning slots may be gone by afternoon
- **Two-tap slot selection:** click a slot twice to commit a single-hour selection (first click → pending-start, second click → commits)
- **Multi-slot range:** click start slot, then click end slot (no drag — drag was removed in Chunk C)
- **Action bar visibility:** check for `page.getByRole('button', { name: /book now/i })` — the bar uses CSS transform to hide, so `isVisible()` on the container is always true
- **Radio buttons:** click the `input` element directly, not the label
- **sr-only checkboxes:** `locator('label').filter({ hasText: '...' }).click()` — `getByLabel` does not work
- **Admin nav:** `getByRole('link', { name: 'Admin', exact: true })`
- **Avoid `/next/i`** as a button selector — matches the Next.js Dev Tools overlay. Use `/^next →/i` or a step-specific label
- **Strict-mode violations:** if a locator matches multiple elements, scope to a parent (`getByTestId('availability-section').locator(...)`) or add a size class (`button.w-7.h-7`) to narrow it

---

## Emulator commands

```bash
lsof -ti :8080 | xargs kill -9 2>/dev/null
lsof -ti :9099 | xargs kill -9 2>/dev/null
true
firebase emulators:start   # do NOT pass --project
npm run test:security      # security rules
npm run test:e2e           # E2E (also needs npm run dev in another terminal)
```
