Bookit-specific extension of the generic `/dev-cycle`. Follow the generic command, substituting the commands below at each step.

---

## Project commands

**Lint:** `npm run lint`
**Typecheck:** `npx tsc --noEmit`
**Unit tests:** `npm test`
**Security/rule tests:** `npm run test:security` (requires emulator)
**E2E tests:** `npm run test:e2e` (requires emulator + dev server)

## Emulator setup (required for security and E2E tests)

Kill stale ports before every session — a long-running emulator accumulates gRPC threads and hangs:
```bash
lsof -ti :8080 | xargs kill -9 2>/dev/null
lsof -ti :9099 | xargs kill -9 2>/dev/null
true
firebase emulators:start   # do NOT pass --project — reads bookme-821b4 from .firebaserc
```

## Additional bookit rules

- Never commit directly to `main` — CI deploys to Vercel on merge
- After merging a PR that other branches depend on, rebase those branches onto updated main before their CI runs
- If a Firestore rule or new collection was added, `test:security` is required even for UI-only PRs
