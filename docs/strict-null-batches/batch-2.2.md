# Batch 2.2 — UI import + external form + asset request

## Objective
Reduce strict-null TypeScript errors in three UI seam files without changing runtime behavior.

## Scope
Only edit these files:
- `src/ui/ImportZone.tsx`
- `src/ui/CalendarExternalForm.tsx`
- `src/ui/AssetRequestForm.tsx`

Do not touch other files in this batch.

---

## Global constraints
- No behavior changes
- No unrelated refactors
- Prefer narrowing over casts
- Avoid `as` unless unavoidable
- Use `??` instead of `||` for nullable defaults
- Keep PR small and reviewable

---

## File-specific tasks

### 1. `src/ui/ImportZone.tsx`
Goal: finish typing the import flow and remove loose/null-unsafe handling.

Required changes:
- Replace loose props with an explicit `ImportZoneProps` type
- Type the parsed ICS state explicitly
- Type `processFile(file)` as returning `void`
- Use `catch (err: unknown)` and narrow safely
- Narrow `FileReader` result before passing to `parseICS`
- Prefer shared event types over local duplicate shapes when practical

Preferred shape:
- `parsed` should ideally be `WorksCalendarEvent[] | null`
- `onImport` should accept `WorksCalendarEvent[]`

Avoid:
- introducing new local `any`
- leaving broad casts where a shared type can be used instead

---

### 2. `src/ui/CalendarExternalForm.tsx`
Goal: make field rendering and field normalization strict-null safe.

Required changes:
- Keep `SUPPORTED_FIELD_TYPES` typed as `Set<ExternalFormFieldType>`
- Keep `names` typed as `Set<string>`
- Replace `.includes(field.type)` render branching with explicit comparisons:
  - `field.type !== 'textarea'`
  - `field.type !== 'select'`
  - `field.type !== 'checkbox'`
- Since `normalizeFields()` guarantees a concrete `field.type`, render the final input with:
  - `type={field.type}`
- Normalize placeholder with:
  - `placeholder={field.placeholder ?? ''}`
- Reuse `normalizedFields` inside `useMemo` instead of re-normalizing if safe and convenient

Avoid:
- behavior changes to submit flow
- broad casts

---

### 3. `src/ui/AssetRequestForm.tsx`
Goal: remove `any` from the modal boundary and type all inputs/outputs.

Required changes:
- Add explicit prop types for:
  - `assets`
  - `categories`
  - `initialStart`
  - `initialAssetId`
  - `onSubmit`
  - `onClose`
- Add explicit types for asset/category item shapes
- Add an explicit submit payload type
- Keep `useFocusTrap<HTMLDivElement>(onClose)`
- Replace `||` nullable defaulting with `??` in initial state
- Remove `any` from:
  - `assets.map(...)`
  - `categories.map(...)`
- Use `label ?? id` instead of `label || id`
- If convenient, harden `fromLocalInput()` with safe default destructuring

Preferred shapes:
- `assets: { id: string; label?: string | null }[]`
- `categories: { id: string; label?: string | null }[]`
- `onSubmit: (payload: AssetRequestSubmitPayload) => void`

Avoid:
- changing modal behavior
- changing approval stage payload semantics

---

## Validation
Run:
- `npm run type-check`
- `npm run type-check:strict-null`

Report:
- whether both commands pass
- the new strict-null error count
- the delta from the previous count

---

## Done definition
- No new TypeScript errors introduced
- Strict-null count decreases or stays flat only if one of the files was already clean
- No runtime behavior changes
- Changes stay inside the three scoped files
