/**
 * ConfigWizard — the capstone of the v2 wizard slice (issue #386).
 *
 * Walks a host through five steps to produce a `CalendarConfig`:
 *
 *   1. Profile      — pick a starter preset (uses `applyProfilePreset`)
 *   2. Catalogs     — resourceTypes + roles editors
 *   3. Resources    — registry editor (id, name, type, location)
 *   4. Pools        — list of `PoolCard`s + an "Add pool" button that
 *                     opens the existing `PoolBuilder` modal
 *   5. Review       — settings + `validateConfig` results + JSON output
 *
 * The wizard owns its draft `CalendarConfig` state. Hosts mount it
 * from their settings / onboarding flow, pass an optional
 * `initialConfig` to edit, and receive the finished config via
 * `onComplete`.
 *
 * Out of scope deliberately:
 *   - Industry-specific capability lists. PoolBuilder auto-derives
 *     them from the live registry; the wizard doesn't curate.
 *   - Full i18n. User-facing strings stay English-only for v1;
 *     hosts wanting localization can fork the component until
 *     a translation layer ships.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import {
  applyProfilePreset, applyProfileSampleData, getProfileSampleData,
  listProfilePresets, PROFILE_PRESETS,
} from '../../core/config/profilePresets'
import type { ProfileId } from '../../core/config/profilePresets'
import { validateConfig } from '../../core/config/validateConfig'
import { serializeConfig } from '../../core/config/serializeConfig'
import {
  defaultCalendarConfig,
  type CalendarConfig, type ConfigResource, type ConfigResourceType, type ConfigRole,
  type ConfigSettings,
} from '../../core/config/calendarConfig'
import type { ResourcePool } from '../../core/pools/resourcePoolSchema'
import type { EngineResource } from '../../core/engine/schema/resourceSchema'
import PoolCard from '../pools/PoolCard'
import PoolBuilder from '../pools/PoolBuilder'
import styles from './ConfigWizard.module.css'

export interface ConfigWizardProps {
  /**
   * Optional starting config — pass to edit an existing setup.
   *
   * Read once at mount: changing this prop while the wizard is
   * mounted does **not** reset the in-progress draft. Hosts that
   * need to swap configs (e.g. switching tenants) should remount
   * the wizard with a fresh React `key` so the draft state is
   * dropped cleanly and the user's in-progress edits don't get
   * silently merged into the new starting point.
   */
  readonly initialConfig?: CalendarConfig
  /** Fired when the user clicks "Finish" on the Review step. */
  readonly onComplete: (config: CalendarConfig) => void
  /** Fired when the user dismisses the wizard. */
  readonly onCancel: () => void
}

const STEPS = [
  { id: 'profile',   label: 'Profile' },
  { id: 'catalogs',  label: 'Types & roles' },
  { id: 'resources', label: 'Resources' },
  { id: 'pools',     label: 'Pools' },
  { id: 'review',    label: 'Review' },
] as const
type StepId = typeof STEPS[number]['id']

export default function ConfigWizard({
  initialConfig, onComplete, onCancel,
}: ConfigWizardProps): JSX.Element {
  // Track when a step has a nested modal open (currently only the
  // pools step's PoolBuilder). While the child modal is mounted we
  // disable the wizard-level focus trap's Escape callback so a single
  // Escape doesn't cascade through both shells and drop the user's
  // in-progress edits.
  const [childModalOpen, setChildModalOpen] = useState(false)
  const trapRef = useFocusTrap<HTMLDivElement>(childModalOpen ? null : onCancel)
  const [config, setConfig] = useState<CalendarConfig>(initialConfig ?? defaultCalendarConfig())
  const [step, setStep] = useState<number>(0)

  const update = useCallback((updater: (c: CalendarConfig) => CalendarConfig) => {
    setConfig(updater)
  }, [])
  const goto = useCallback((target: number) => {
    setStep(Math.max(0, Math.min(STEPS.length - 1, target)))
  }, [])

  const stepId: StepId = STEPS[step]!.id
  const isLast = step === STEPS.length - 1

  // Wizard-wide validation — single source of truth shared by the
  // Review step's pill and the Finish button's disabled state.
  // validateConfig is pure, so re-running on every config change is
  // cheap and guarantees the two read the same thing.
  const validation = useMemo(() => validateConfig(config), [config])

  return (
    <div
      className={styles['overlay']}
      onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && onCancel()}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        className={styles['panel']}
      >
        <header className={styles['head']}>
          <h2 id="wizard-title" className={styles['title']}>Set up calendar</h2>
          <button
            type="button"
            className={styles['closeBtn']}
            onClick={onCancel}
            aria-label="Close wizard"
          >×</button>
        </header>

        <ol className={styles['breadcrumbs']} aria-label="Wizard steps">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={styles['crumb']}
              data-active={i === step}
              data-done={i < step}
            >
              <button
                type="button"
                className={styles['crumbBtn']}
                onClick={() => goto(i)}
                aria-current={i === step ? 'step' : undefined}
              >
                <span className={styles['crumbIndex']}>{i + 1}</span>
                <span className={styles['crumbLabel']}>{s.label}</span>
              </button>
            </li>
          ))}
        </ol>

        <section className={styles['body']} aria-live="polite">
          {stepId === 'profile'   && <ProfileStep   config={config} setConfig={update} />}
          {stepId === 'catalogs'  && <CatalogsStep  config={config} setConfig={update} />}
          {stepId === 'resources' && <ResourcesStep config={config} setConfig={update} />}
          {stepId === 'pools'     && <PoolsStep     config={config} setConfig={update} onChildModalOpen={setChildModalOpen} />}
          {stepId === 'review'    && <ReviewStep    config={config} setConfig={update} validation={validation} />}
        </section>

        <footer className={styles['foot']}>
          <button type="button" className={styles['btnSecondary']} onClick={onCancel}>
            Cancel
          </button>
          <span className={styles['footSpacer']} />
          <button
            type="button"
            className={styles['btnSecondary']}
            disabled={step === 0}
            onClick={() => goto(step - 1)}
          >
            Back
          </button>
          {!isLast && (
            <button
              type="button"
              className={styles['btnPrimary']}
              onClick={() => goto(step + 1)}
            >
              Next
            </button>
          )}
          {isLast && (
            <button
              type="button"
              className={styles['btnPrimary']}
              disabled={!validation.ok}
              title={validation.ok
                ? undefined
                : `Fix ${validation.issues.length} validation issue${validation.issues.length === 1 ? '' : 's'} before finishing.`}
              aria-describedby={validation.ok ? undefined : 'wizard-validation-summary'}
              onClick={() => onComplete(config)}
            >
              Finish
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

// ─── Step 1 — profile picker ───────────────────────────────────────────────

interface StepProps {
  readonly config: CalendarConfig
  readonly setConfig: (updater: (c: CalendarConfig) => CalendarConfig) => void
}

function ProfileStep({ config, setConfig }: StepProps): JSX.Element {
  return (
    <div className={styles['stepInner']}>
      <p className={styles['hint']}>
        Pick a starter preset. We'll seed your labels, resource types, and
        roles based on the industry. You can edit anything afterward.
      </p>
      <div className={styles['profileGrid']}>
        {listProfilePresets().map(p => (
          <button
            key={p.id}
            type="button"
            className={styles['profileCard']}
            data-selected={config.profile === p.id}
            onClick={() => setConfig(c => applyProfilePreset(p.id, c))}
            aria-pressed={config.profile === p.id}
          >
            <span className={styles['profileLabel']}>{p.label}</span>
            <span className={styles['profileDesc']}>{p.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Step 2 — catalogs (resourceTypes + roles) ─────────────────────────────

function CatalogsStep({ config, setConfig }: StepProps): JSX.Element {
  return (
    <div className={styles['stepInner']}>
      <IdLabelEditor
        label="Resource types"
        hint="What kinds of resources can be booked? (e.g. Truck, Person, Room)"
        items={config.resourceTypes ?? []}
        onChange={(next) => setConfig(c => ({ ...c, resourceTypes: next }))}
      />
      <IdLabelEditor
        label="Roles"
        hint="What roles do people / resources fulfill on events? (e.g. Driver, Organizer)"
        items={config.roles ?? []}
        onChange={(next) => setConfig(c => ({ ...c, roles: next }))}
      />
    </div>
  )
}

function IdLabelEditor({
  label, hint, items, onChange,
}: {
  label: string
  hint: string
  items: readonly { id: string; label: string }[]
  onChange: (next: readonly { id: string; label: string }[]) => void
}): JSX.Element {
  return (
    <fieldset className={styles['fieldset']}>
      <legend className={styles['legend']}>{label}</legend>
      <p className={styles['hint']}>{hint}</p>
      <ul className={styles['rowList']}>
        {items.map((it, i) => (
          <li key={i} className={styles['row']}>
            <input
              type="text"
              className={styles['input']}
              value={it.id}
              placeholder="id (e.g. driver)"
              aria-label={`${label} ${i + 1} id`}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onChange(items.map((x, j) => j === i ? { ...x, id: e.target.value } : x))
              }
            />
            <input
              type="text"
              className={styles['input']}
              value={it.label}
              placeholder="label (e.g. Driver)"
              aria-label={`${label} ${i + 1} label`}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onChange(items.map((x, j) => j === i ? { ...x, label: e.target.value } : x))
              }
            />
            <button
              type="button"
              className={styles['removeBtn']}
              aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >×</button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles['addBtn']}
        onClick={() => onChange([...items, { id: '', label: '' }])}
      >+ Add {label.toLowerCase().replace(/s$/, '')}</button>
    </fieldset>
  )
}

// ─── Step 3 — resources registry editor ────────────────────────────────────

function ResourcesStep({ config, setConfig }: StepProps): JSX.Element {
  const resources = config.resources ?? []
  const setResources = (next: readonly ConfigResource[]) =>
    setConfig(c => ({ ...c, resources: next }))
  // Builder form keeps callers free to omit (rather than set to
  // undefined) optional fields — exactOptionalPropertyTypes draws
  // a hard line between the two.
  const updateAt = (i: number, mut: (prev: ConfigResource) => ConfigResource) => {
    setResources(resources.map((r, j) => j === i ? cleanResource(mut(r)) : r))
  }
  const types = config.resourceTypes ?? []

  // Track in-progress lat/lon strings per row so a half-typed
  // coordinate (lat first, lon still empty) doesn't fabricate a
  // synthetic 0 for the missing side. Commit `location` to the
  // config only when both fields are finite numbers; clear it when
  // both are empty; leave it untouched in between so the user sees
  // their typed value mid-edit without poisoning distance pools.
  //
  // Drafts are keyed by a stable per-row id (#460): keying by array
  // index meant deleting a row above another shifted indices and
  // re-attached the deleted row's typed coordinate to its neighbour.
  // The rowKeys array is kept in lock-step with `resources` —
  // `addResource` / `removeAt` push/splice both at the same index;
  // a length-mismatch effect catches up on external mutations
  // (e.g. "Load sample data" or initialConfig editing).
  const rowKeyCounter = useRef(0)
  const makeRowKey = useCallback(() => `row-${rowKeyCounter.current++}`, [])
  const [rowKeys, setRowKeys] = useState<readonly string[]>(
    () => resources.map(() => `row-${rowKeyCounter.current++}`),
  )
  useEffect(() => {
    if (rowKeys.length === resources.length) return
    setRowKeys(prev => {
      if (prev.length > resources.length) return prev.slice(0, resources.length)
      const padded = [...prev]
      while (padded.length < resources.length) padded.push(makeRowKey())
      return padded
    })
  }, [resources.length, rowKeys.length, makeRowKey])

  const [coords, setCoords] = useState<Map<string, { lat: string; lon: string }>>(new Map())
  const coordValue = (i: number, which: 'lat' | 'lon'): string => {
    const key = rowKeys[i]
    const draft = key ? coords.get(key) : undefined
    if (draft && draft[which] !== undefined) return draft[which]
    const r = resources[i]
    return r?.location ? String(r.location[which]) : ''
  }
  const setCoord = (i: number, which: 'lat' | 'lon', raw: string) => {
    const key = rowKeys[i]
    if (!key) return
    setCoords(prev => {
      const existing = prev.get(key) ?? {
        lat: resources[i]?.location ? String(resources[i]!.location!.lat) : '',
        lon: resources[i]?.location ? String(resources[i]!.location!.lon) : '',
      }
      const next = { ...existing, [which]: raw }
      const out = new Map(prev)
      out.set(key, next)
      // Decide whether to commit the parsed pair to the config.
      const lat = next.lat === '' ? null : Number(next.lat)
      const lon = next.lon === '' ? null : Number(next.lon)
      const bothFinite = lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon)
      const bothCleared = next.lat === '' && next.lon === ''
      if (bothFinite) {
        updateAt(i, prev => withOptional(prev, 'location', { lat: lat as number, lon: lon as number }))
      } else if (bothCleared) {
        updateAt(i, prev => withOptional(prev, 'location', undefined))
      }
      // Otherwise: partial entry — config.location is left exactly as
      // it was. The local draft keeps the user's typed value visible.
      return out
    })
  }
  const removeAt = (i: number) => {
    const droppedKey = rowKeys[i]
    setResources(resources.filter((_, j) => j !== i))
    setRowKeys(prev => prev.filter((_, j) => j !== i))
    if (droppedKey) {
      setCoords(prev => {
        if (!prev.has(droppedKey)) return prev
        const next = new Map(prev)
        next.delete(droppedKey)
        return next
      })
    }
  }
  const addResource = () => {
    setResources([...resources, { id: '', name: '' }])
    setRowKeys(prev => [...prev, makeRowKey()])
  }
  const profile = isProfileId(config.profile) ? config.profile : null
  const sample = profile ? getProfileSampleData(profile) : null
  const canLoadSample = profile !== null && sample !== null && sample.resources.length > 0
  return (
    <div className={styles['stepInner']}>
      <p className={styles['hint']}>
        Register the concrete resources hosts will book. Add capabilities
        and locations later — they're optional, but the v2 query DSL
        reads them when present.
      </p>
      {canLoadSample && (
        <button
          type="button"
          className={styles['sampleBtn']}
          onClick={() => profile && setConfig(c => applyProfileSampleData(profile, c))}
          aria-label="Load sample data for this profile"
        >Load sample data</button>
      )}
      {resources.length === 0 && (
        <p className={styles['empty']}>No resources yet.</p>
      )}
      <ul className={styles['resourceList']}>
        {resources.map((r, i) => (
          <li key={rowKeys[i] ?? `idx-${i}`} className={styles['resourceRow']}>
            <input
              type="text"
              className={styles['input']}
              value={r.id}
              placeholder="id"
              aria-label={`Resource ${i + 1} id`}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                updateAt(i, prev => ({ ...prev, id: e.target.value }))}
            />
            <input
              type="text"
              className={styles['input']}
              value={r.name}
              placeholder="name"
              aria-label={`Resource ${i + 1} name`}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                updateAt(i, prev => ({ ...prev, name: e.target.value }))}
            />
            <select
              className={styles['select']}
              value={r.type ?? ''}
              aria-label={`Resource ${i + 1} type`}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                updateAt(i, prev => withOptional(prev, 'type', e.target.value || undefined))}
            >
              <option value="">— type —</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input
              type="number"
              step="any"
              className={styles['inputNarrow']}
              value={coordValue(i, 'lat')}
              placeholder="lat"
              aria-label={`Resource ${i + 1} latitude`}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCoord(i, 'lat', e.target.value)}
            />
            <input
              type="number"
              step="any"
              className={styles['inputNarrow']}
              value={coordValue(i, 'lon')}
              placeholder="lon"
              aria-label={`Resource ${i + 1} longitude`}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCoord(i, 'lon', e.target.value)}
            />
            <button
              type="button"
              className={styles['removeBtn']}
              aria-label={`Remove resource ${i + 1}`}
              onClick={() => removeAt(i)}
            >×</button>
            {(config.roles ?? []).length > 0 && (
              <RoleChips
                resourceIndex={i}
                roles={config.roles ?? []}
                selected={readResourceRoles(r)}
                onToggle={(roleId) => updateAt(i, prev => toggleResourceRole(prev, roleId))}
              />
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles['addBtn']}
        onClick={() => addResource()}
      >+ Add resource</button>
    </div>
  )
}

const PROFILE_IDS: readonly ProfileId[] = ['trucking', 'aviation', 'scheduling', 'custom']
function isProfileId(v: unknown): v is ProfileId {
  return typeof v === 'string' && (PROFILE_IDS as readonly string[]).includes(v)
}

function readResourceRoles(r: ConfigResource): readonly string[] {
  const raw = (r.meta as Record<string, unknown> | undefined)?.['roles']
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
}

function toggleResourceRole(r: ConfigResource, roleId: string): ConfigResource {
  const current = readResourceRoles(r)
  const next = current.includes(roleId)
    ? current.filter(x => x !== roleId)
    : [...current, roleId]
  // Drop the meta.roles key entirely when empty so the saved config
  // doesn't carry an empty array (cleaner JSON, lossless round-trip).
  const meta = { ...(r.meta as Record<string, unknown> ?? {}) }
  if (next.length > 0) {
    meta['roles'] = next
  } else {
    delete meta['roles']
  }
  if (Object.keys(meta).length === 0) {
    const { meta: _drop, ...rest } = r
    return rest
  }
  return { ...r, meta }
}

function RoleChips({
  resourceIndex, roles, selected, onToggle,
}: {
  resourceIndex: number
  roles: readonly { id: string; label: string }[]
  selected: readonly string[]
  onToggle: (roleId: string) => void
}): JSX.Element {
  return (
    <div className={styles['roleChips']} role="group" aria-label={`Resource ${resourceIndex + 1} roles`}>
      {roles.map(role => {
        const active = selected.includes(role.id)
        return (
          <button
            key={role.id}
            type="button"
            className={styles['roleChip']}
            data-active={active}
            aria-pressed={active}
            onClick={() => onToggle(role.id)}
          >{role.label || role.id}</button>
        )
      })}
    </div>
  )
}

/**
 * Set or remove an optional field on a record without leaking an
 * explicit `undefined` into the result. With
 * `exactOptionalPropertyTypes: true`, `{ foo: undefined }` is a
 * different shape from `{}`, and the latter is what we want when
 * the field is meant to be absent. Used by the resources-step
 * inputs and the review-step settings handlers.
 */
function withOptional<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  value: T[K] | undefined,
): T {
  if (value === undefined) {
    const { [key]: _drop, ...rest } = obj as Record<K, unknown> & Partial<T>
    return rest as unknown as T
  }
  return { ...obj, [key]: value } as T
}

function cleanResource(r: ConfigResource): ConfigResource {
  // Drop a partial location (only one of lat/lon set) so the saved
  // config doesn't carry malformed coordinates downstream.
  if (r.location && (!Number.isFinite(r.location.lat) || !Number.isFinite(r.location.lon))) {
    const { location: _drop, ...rest } = r
    return rest
  }
  return r
}

// ─── Step 4 — pools (list + PoolBuilder modal) ─────────────────────────────

function PoolsStep({
  config, setConfig, onChildModalOpen,
}: StepProps & { readonly onChildModalOpen?: (open: boolean) => void }): JSX.Element {
  const pools = config.pools ?? []
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  // Mirror the modal's open/closed state up to the wizard root so the
  // outer focus trap's Escape callback can step aside while the
  // inner PoolBuilder is mounted.
  useEffect(() => {
    onChildModalOpen?.(editingIndex !== null)
    return () => onChildModalOpen?.(false)
  }, [editingIndex, onChildModalOpen])
  // Adapt ConfigResource[] → ReadonlyMap<id, EngineResource> for PoolBuilder.
  const resourceMap = useMemo(() => {
    const m = new Map<string, EngineResource>()
    for (const r of config.resources ?? []) {
      m.set(r.id, asEngineResource(r))
    }
    return m
  }, [config.resources])
  const isCreate = editingIndex === pools.length

  return (
    <div className={styles['stepInner']}>
      <p className={styles['hint']}>
        Pools group resources by membership or query. The v2 engine resolves
        the concrete member at submit time.
      </p>
      {pools.length === 0 && <p className={styles['empty']}>No pools yet.</p>}
      <div className={styles['poolList']}>
        {pools.map((p, i) => (
          <PoolCard
            key={p.id || i}
            pool={p}
            resources={resourceMap}
            onEdit={() => setEditingIndex(i)}
            onToggleDisabled={() => setConfig(c => ({
              ...c,
              pools: pools.map((x, j) => j === i ? { ...x, disabled: !x.disabled } : x),
            }))}
            actions={(
              <button
                type="button"
                className={styles['rowBtn']}
                onClick={() => setConfig(c => ({ ...c, pools: pools.filter((_, j) => j !== i) }))}
                aria-label={`Delete pool ${p.name}`}
              >Delete</button>
            )}
          />
        ))}
      </div>
      <button
        type="button"
        className={styles['addBtn']}
        onClick={() => setEditingIndex(pools.length)}
      >+ Add pool</button>

      {editingIndex !== null && (
        <PoolBuilder
          pool={isCreate ? null : pools[editingIndex] ?? null}
          resources={resourceMap}
          onCancel={() => setEditingIndex(null)}
          onSave={(saved) => {
            setConfig(c => ({
              ...c,
              pools: isCreate
                ? [...pools, saved]
                : pools.map((p, j) => j === editingIndex ? saved : p),
            }))
            setEditingIndex(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * Lift a `ConfigResource` to the runtime `EngineResource` shape so
 * `PoolBuilder` (and the live preview) can score against it. Just a
 * field rename; capabilities + location land under `meta` where the
 * resolver expects them.
 */
function asEngineResource(r: ConfigResource): EngineResource {
  const meta: Record<string, unknown> = { ...(r.meta ?? {}) }
  if (r.capabilities) meta['capabilities'] = r.capabilities
  if (r.location)     meta['location'] = r.location
  return {
    id: r.id, name: r.name, meta,
  } as EngineResource
}

// ─── Step 5 — review (settings + validation + JSON) ────────────────────────

type ValidateConfigResult = ReturnType<typeof validateConfig>

function ReviewStep({
  config, setConfig, validation,
}: StepProps & { readonly validation: ValidateConfigResult }): JSX.Element {
  const json = useMemo(
    () => JSON.stringify(serializeConfig(config), null, 2),
    [config],
  )
  const settings = config.settings ?? {}
  const setSettings = (next: ConfigSettings) =>
    setConfig(c => ({ ...c, settings: next }))

  return (
    <div className={styles['stepInner']}>
      <fieldset className={styles['fieldset']}>
        <legend className={styles['legend']}>Settings</legend>
        <label className={styles['settingRow']}>
          <span className={styles['settingLabel']}>Conflict mode</span>
          <select
            className={styles['select']}
            value={settings.conflictMode ?? ''}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSettings(
              withOptional(settings, 'conflictMode', (e.target.value || undefined) as ConfigSettings['conflictMode']),
            )}
          >
            <option value="">(default)</option>
            <option value="block">block</option>
            <option value="soft">soft</option>
            <option value="off">off</option>
          </select>
        </label>
        <label className={styles['settingRow']}>
          <span className={styles['settingLabel']}>Timezone</span>
          <input
            type="text"
            className={styles['input']}
            value={settings.timezone ?? ''}
            placeholder="America/Denver"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSettings(
              withOptional(settings, 'timezone', e.target.value || undefined),
            )}
          />
        </label>
      </fieldset>

      <fieldset className={styles['fieldset']} data-testid="wizard-validation">
        <legend className={styles['legend']}>
          Validation {validation.ok ? <span className={styles['okPill']}>OK</span> : <span className={styles['errPill']}>{validation.issues.length} issue{validation.issues.length === 1 ? '' : 's'}</span>}
        </legend>
        {validation.ok && <p className={styles['hint']}>No issues found. Ready to finish.</p>}
        {!validation.ok && (
          <>
            <p id="wizard-validation-summary" className={styles['hint']}>
              Fix these issues to enable Finish.
            </p>
            <ul className={styles['issueList']}>
              {validation.issues.map((issue, i) => (
                <li key={i} className={styles['issueRow']}>
                  <code className={styles['issuePath']}>{issue.path}</code>
                  <span className={styles['issueKind']}>{issue.kind}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </fieldset>

      <fieldset className={styles['fieldset']}>
        <legend className={styles['legend']}>Generated config.json</legend>
        <div className={styles['jsonActions']}>
          <button
            type="button"
            className={styles['btnSecondary']}
            onClick={() => downloadJson(json, 'config.json')}
          >Download config.json</button>
        </div>
        <pre className={styles['json']} data-testid="wizard-json">{json}</pre>
      </fieldset>
    </div>
  )
}

/**
 * Trigger a browser download for a JSON string. Uses the
 * `Blob` + `URL.createObjectURL` + invisible `<a download>` dance
 * because that's the only cross-browser way to ship a file from a
 * pure-client wizard. The URL is revoked on the next tick rather
 * than synchronously so older Safari and embedded WebViews — which
 * sometimes process the click out-of-band — can still resolve the
 * Blob before the URL goes away.
 *
 * No-op when run outside a browser (test environments without
 * `document` or `URL.createObjectURL`); the click would throw and
 * we don't want it to.
 */
function downloadJson(content: string, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return
  const blob = new Blob([content], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(href), 0)
}

function cleanSettings(s: ConfigSettings): ConfigSettings {
  const out: { -readonly [K in keyof ConfigSettings]: ConfigSettings[K] } = {}
  if (s.conflictMode) out.conflictMode = s.conflictMode
  if (s.timezone)     out.timezone     = s.timezone
  return out
}

// Hint to the bundler/test that PROFILE_PRESETS is referenced for type
// imports above; otherwise tree-shakers might prune it from the
// dts bundle when no consumer uses it. Cheap no-op.
void PROFILE_PRESETS

// Re-export step state types for callers that want to drive their
// own wizard variant. Concrete types declared above stay closed.
export type ConfigWizardStepId = StepId
export type { ConfigResource, ConfigResourceType, ConfigRole, ConfigSettings }
