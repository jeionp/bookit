Bookit-specific extension of the generic `/refactor-wave`. Run the generic command using the conventions below.

---

## Shared lib locations

| Pattern | Target file |
|---|---|
| API auth checks | `src/lib/api/auth.ts` |
| Slot / date formatting | `src/lib/slots.ts` |
| Firestore collection names | `src/lib/api/constants.ts` |
| Request validation helpers | `src/lib/api/validation.ts` |
| Payment / booking types | `src/lib/types.ts` |

---

## Size targets

| File type | Target | Split strategy |
|---|---|---|
| API routes (`src/app/api/`) | ≤150 lines | Extract to lib |
| React components | ≤300 lines | Split into subcomponents in same folder |
| Lib files | No hard limit | Group by concern |

## Component split pattern

1. Identify logical sections (e.g. a wizard step, a settings panel, an action group)
2. Extract each into its own file in the same directory
3. Shared sub-components (e.g. `LabeledInput`) go in a `Shared.tsx` in the same folder
4. Parent becomes a thin orchestrator
