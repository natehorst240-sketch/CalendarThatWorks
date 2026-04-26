/**
 * SetupLanding — full-page guided setup shown before the calendar loads.
 *
 * Rendered by WorksCalendar when `config.setup.completed === false` and the
 * host hasn't opted out via `showSetupLanding={false}`. Every step uses
 * plain-language copy and an inline SVG illustration so non-technical owners
 * understand what each option does without needing docs.
 *
 * Escape hatch: a prominent "Skip setup guide" button marks setup complete
 * and drops the owner straight into the calendar with default config.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Check, Sparkles, Rocket, Users, Palette, LayoutGrid, Wand2, MapPin, Plane, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { THEMES, THEME_META, normalizeTheme, resolveCssTheme } from '../styles/themes';
import styles from './SetupLanding.module.css';
import {
  IllustrationTheme,
  IllustrationView,
  IllustrationTeam,
  IllustrationRecipe,
} from './SetupLandingIllustrations';

/* ────────────────────────────────────────────────────────────────────────── */
/*  Types                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

export type SetupRecipeId =
  | 'everything'
  | 'by-person'
  | 'by-type'
  | 'on-call'
  | 'this-week';

export type OptionalViewId = 'day' | 'agenda' | 'schedule' | 'base' | 'assets';

/** A category of bookable resource. Drives requirement templates. */
export type AssetTypeDef = { id: string; label: string };

/** A concrete asset created in the wizard. Linked to an AssetTypeDef. */
export type AssetSeed = { id: string; label: string; assetTypeId: string };

/** A required role on a request, e.g. Pilot, Medic. */
export type RoleDef = { id: string; label: string };

/**
 * Per-type rules that asset-request flows read at submit time. The wizard
 * captures the minimum needed for v1: required role slots and an
 * approval-before-scheduling toggle.
 */
export type RequirementTemplate = {
  roles: RoleDef[];
  requiresApproval: boolean;
};

export type SetupLandingResult = {
  calendarName: string;
  theme: string;
  defaultView: 'month' | 'week' | 'day' | 'agenda' | 'schedule' | 'base' | 'assets';
  enabledViews: OptionalViewId[];
  locationLabel: 'Base' | 'Region';
  teamMembers: Array<{ id: string; name: string; color: string }>;
  recipes: SetupRecipeId[];
  assetTypes: AssetTypeDef[];
  assetSeeds: AssetSeed[];
  requirementTemplates: Record<string, RequirementTemplate>;
};

export type SetupLandingProps = {
  /** Called when owner finishes the guide. Host persists the result. */
  onFinish: (result: SetupLandingResult) => void;
  /** Called when owner skips the guide. Host marks setup.completed=true. */
  onSkip: () => void;
  /** Initial calendar name (from config.title). */
  initialName?: string;
  /** Initial theme (from config.setup.preferredTheme). */
  initialTheme?: string;
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Constants                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

const TOTAL_STEPS = 7;

const DEFAULT_ASSET_TYPES: AssetTypeDef[] = [
  { id: 'aircraft',  label: 'Aircraft' },
  { id: 'vehicle',   label: 'Vehicle' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'room',      label: 'Room' },
];

/** Common role suggestions surfaced as quick-add chips. */
const SUGGESTED_ROLES: RoleDef[] = [
  { id: 'pilot',      label: 'Pilot' },
  { id: 'co-pilot',   label: 'Co-pilot' },
  { id: 'medic',      label: 'Medic' },
  { id: 'driver',     label: 'Driver' },
  { id: 'crew',       label: 'Crew' },
  { id: 'technician', label: 'Technician' },
];

type ViewChoice = {
  id: SetupLandingResult['defaultView'];
  label: string;
  plain: string;
  alwaysOn?: boolean;
};

const VIEW_CHOICES: ViewChoice[] = [
  { id: 'month',    label: 'Month',    plain: 'See one whole month at a time, like a paper calendar.', alwaysOn: true },
  { id: 'week',     label: 'Week',     plain: 'See seven days side by side with start and end times.', alwaysOn: true },
  { id: 'day',      label: 'Day',      plain: 'Zoom in on a single day, hour by hour.' },
  { id: 'agenda',   label: 'List',     plain: 'A simple list of what is coming up next.' },
  { id: 'schedule', label: 'Schedule', plain: 'One row per person. Great for shifts and coverage.' },
  { id: 'base',     label: 'Base',     plain: 'One row per location. Shows the assets, people, and events at each base.' },
  { id: 'assets',   label: 'Assets',   plain: 'One row per asset — vehicles, rooms, equipment.' },
];

const OPTIONAL_VIEW_IDS: OptionalViewId[] = ['day', 'agenda', 'schedule', 'base', 'assets'];

const RECIPE_CHOICES: Array<{
  id: SetupRecipeId;
  title: string;
  plain: string;
  example: string;
}> = [
  {
    id: 'everything',
    title: 'Show everything',
    plain: 'Every event, all together. A good place to start.',
    example: 'Nothing is hidden. You can add filters later.',
  },
  {
    id: 'by-person',
    title: 'Group by person',
    plain: 'Put each person\u2019s events in their own row.',
    example: 'You can see at a glance who is busy and who is free.',
  },
  {
    id: 'by-type',
    title: 'Group by type',
    plain: 'Put all the same kinds of events together.',
    example: 'Meetings with meetings, time off with time off.',
  },
  {
    id: 'on-call',
    title: 'On-call only',
    plain: 'Hide everything that is not an on-call shift.',
    example: 'Useful when you only care about who is covering.',
  },
  {
    id: 'this-week',
    title: 'This week only',
    plain: 'Hide events that are not happening this week.',
    example: 'Cuts out the noise so today stays on top.',
  },
];

const STARTER_TEAM = [
  { id: 't1', name: '',  color: '#3b82f6' },
  { id: 't2', name: '',  color: '#ef4444' },
  { id: 't3', name: '',  color: '#10b981' },
];

/* ────────────────────────────────────────────────────────────────────────── */
/*  Component                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

export default function SetupLanding({
  onFinish,
  onSkip,
  initialName = 'My Calendar',
  initialTheme = 'corporate',
}: SetupLandingProps) {
  // Step 0 is the welcome screen. Steps 1..TOTAL_STEPS are the form.
  const [step, setStep] = useState(0);
  const [calendarName, setCalendarName] = useState(initialName);
  const [theme, setTheme] = useState(initialTheme);
  const [defaultView, setDefaultView] = useState<SetupLandingResult['defaultView']>('month');
  const [enabledViews, setEnabledViews] = useState<OptionalViewId[]>([...OPTIONAL_VIEW_IDS]);
  const [locationLabel, setLocationLabel] = useState<'Base' | 'Region'>('Base');
  const [team, setTeam] = useState(STARTER_TEAM);
  const [recipes, setRecipes] = useState<SetupRecipeId[]>(['everything']);
  const [assetTypes, setAssetTypes] = useState<AssetTypeDef[]>(DEFAULT_ASSET_TYPES);
  const [assetSeeds, setAssetSeeds] = useState<AssetSeed[]>([]);
  const [requirementTemplates, setRequirementTemplates] = useState<Record<string, RequirementTemplate>>({});

  const next = () => setStep(s => Math.min(TOTAL_STEPS, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  const toggleRecipe = (id: SetupRecipeId) => {
    setRecipes(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const toggleEnabledView = (id: OptionalViewId) => {
    setEnabledViews(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  // Views the user can choose as the default (always-on + opted-in optional).
  const defaultViewChoices = useMemo(
    () => VIEW_CHOICES.filter(v => v.alwaysOn || enabledViews.includes(v.id as OptionalViewId)),
    [enabledViews],
  );

  // If the previously picked default view is now disabled, snap back to month.
  const safeDefaultView: SetupLandingResult['defaultView'] =
    defaultViewChoices.some(v => v.id === defaultView) ? defaultView : 'month';

  const handleFinish = () => {
    // Drop empty type slots and any seed pointing at a deleted type so the
    // host never has to defensively filter the result.
    const cleanTypes = assetTypes.filter(t => t.label.trim());
    const validTypeIds = new Set(cleanTypes.map(t => t.id));
    const cleanSeeds = assetSeeds
      .filter(a => a.label.trim() && validTypeIds.has(a.assetTypeId))
      .map(a => ({ ...a, label: a.label.trim() }));
    const cleanTemplates: Record<string, RequirementTemplate> = {};
    for (const typeId of validTypeIds) {
      const template = requirementTemplates[typeId];
      if (!template) continue;
      const roles = template.roles.filter(r => r.label.trim());
      // Only emit a template entry if it actually constrains something.
      if (roles.length === 0 && !template.requiresApproval) continue;
      cleanTemplates[typeId] = { roles, requiresApproval: template.requiresApproval };
    }

    onFinish({
      calendarName: calendarName.trim() || 'My Calendar',
      theme,
      defaultView: safeDefaultView,
      enabledViews,
      locationLabel,
      teamMembers: team
        .filter(m => m.name.trim())
        .map(m => ({ id: m.id, name: m.name.trim(), color: m.color })),
      recipes,
      assetTypes: cleanTypes,
      assetSeeds: cleanSeeds,
      requirementTemplates: cleanTemplates,
    });
  };

  /* ── Welcome ─────────────────────────────────────────────────────────── */
  if (step === 0) {
    return (
      <div className={styles['landing']} data-wc-theme={resolveCssTheme(theme)} role="region" aria-label="Calendar setup">
        <div className={styles['hero']}>
          <div className={styles['heroIcon']}><Rocket size={40} aria-hidden="true" /></div>
          <h1 className={styles['heroTitle']}>Let’s set up your calendar</h1>
          <p className={styles['heroLead']}>
            Answer a few easy questions and we’ll pick good settings for you.
            No tech words. No guessing. You can change anything later.
          </p>

          <div className={styles['heroBullets']}>
            <div className={styles['heroBullet']}><Palette size={16} aria-hidden="true" /> Pick how it looks</div>
            <div className={styles['heroBullet']}><LayoutGrid size={16} aria-hidden="true" /> Pick what you see first</div>
            <div className={styles['heroBullet']}><Users size={16} aria-hidden="true" /> Add your team</div>
            <div className={styles['heroBullet']}><Wand2 size={16} aria-hidden="true" /> Make a smart view</div>
          </div>

          <div className={styles['heroActions']}>
            <button className={styles['primaryBtn']} onClick={() => setStep(1)} type="button">
              <Sparkles size={16} aria-hidden="true" /> Start setup guide
            </button>
            <button className={styles['skipBtn']} onClick={onSkip} type="button">
              Skip setup guide
            </button>
          </div>
          <p className={styles['heroFine']}>
            Skip if you already know how this calendar works. You can open setup again from the settings gear.
          </p>
        </div>
      </div>
    );
  }

  /* ── Steps ───────────────────────────────────────────────────────────── */
  return (
    <div className={styles['landing']} data-wc-theme={resolveCssTheme(theme)} role="region" aria-label="Calendar setup">
      <div className={styles['shell']}>
        <header className={styles['topBar']}>
          <span className={styles['brand']}><Sparkles size={14} aria-hidden="true" /> Calendar setup</span>
          <span className={styles['stepPill']}>Step {step} of {TOTAL_STEPS}</span>
          <button className={styles['skipTextBtn']} onClick={onSkip} type="button">
            Skip setup guide
          </button>
        </header>

        <div className={styles['progressTrack']} role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={TOTAL_STEPS}>
          <div className={styles['progressFill']} style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
        </div>

        <main className={styles['body']}>
          {step === 1 && (
            <StepName name={calendarName} onChange={setCalendarName} />
          )}
          {step === 2 && (
            <StepTheme current={theme} onChange={setTheme} />
          )}
          {step === 3 && (
            <StepTabs
              enabled={enabledViews}
              onToggle={toggleEnabledView}
              locationLabel={locationLabel}
              onLocationLabelChange={setLocationLabel}
            />
          )}
          {step === 4 && (
            <StepView
              current={safeDefaultView}
              onChange={setDefaultView}
              choices={defaultViewChoices}
              locationLabel={locationLabel}
            />
          )}
          {step === 5 && (
            <StepTeam team={team} onChange={setTeam} />
          )}
          {step === 6 && (
            <StepRecipes selected={recipes} onToggle={toggleRecipe} />
          )}
          {step === 7 && (
            <StepAssets
              assetTypes={assetTypes}
              onAssetTypesChange={setAssetTypes}
              assetSeeds={assetSeeds}
              onAssetSeedsChange={setAssetSeeds}
              requirementTemplates={requirementTemplates}
              onRequirementTemplatesChange={setRequirementTemplates}
            />
          )}
        </main>

        <footer className={styles['footer']}>
          <button
            className={styles['backBtn']}
            onClick={back}
            type="button"
            disabled={step === 1}
          >
            <ChevronLeft size={15} aria-hidden="true" /> Back
          </button>

          {step < TOTAL_STEPS ? (
            <button className={styles['primaryBtn']} onClick={next} type="button">
              Next <ChevronRight size={15} aria-hidden="true" />
            </button>
          ) : (
            <button className={styles['primaryBtn']} onClick={handleFinish} type="button">
              <Check size={15} aria-hidden="true" /> I’m done
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Steps                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

function StepName({ name, onChange }: { name: string; onChange: (v: string) => void }) {
  return (
    <section className={styles['step']}>
      <h2 className={styles['stepTitle']}>What should we call your calendar?</h2>
      <p className={styles['stepPlain']}>
        Pick a name your team will know. It shows up at the top of the page.
        Something like <em>“Team Calendar”</em> or <em>“Kitchen Schedule”</em> works great.
      </p>
      <label className={styles['field']}>
        <span className={styles['fieldLabel']}>Calendar name</span>
        <input
          className={styles['input']}
          type="text"
          value={name}
          onChange={e => onChange(e.target.value)}
          maxLength={64}
          placeholder="My Calendar"
          autoFocus
        />
      </label>
      <p className={styles['stepTip']}>
        Tip: Don’t worry — you can rename it any time from the settings gear.
      </p>
    </section>
  );
}

function StepTheme({ current, onChange }: { current: string; onChange: (id: string) => void }) {
  // The stored value may be a legacy id ('corporate', 'ocean', …) for
  // upgraded calendars — normalize before matching so the currently-active
  // card still renders as selected.
  const normalizedCurrent = normalizeTheme(current);
  return (
    <section className={styles['step']}>
      <h2 className={styles['stepTitle']}>How should it look?</h2>
      <p className={styles['stepPlain']}>
        Pick a look that feels right for your team. You are only picking colors here.
        You can switch any time.
      </p>

      <div className={styles['themeGrid']}>
        {THEMES.map(id => {
          const t = THEME_META[id];
          const selected = normalizedCurrent === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={[styles['themeCard'], selected && styles['cardSelected']].filter(Boolean).join(' ')}
              aria-pressed={selected}
              title={t.description}
            >
              <IllustrationTheme
                bg={t.preview.bg}
                surface={t.preview.surface}
                accent={t.preview.accent}
                text={t.preview.text}
                border={t.preview.border}
              />
              <div className={styles['themeMeta']}>
                <span className={styles['themeLabel']}>{t.label}</span>
                {t.dark && <span className={styles['themeBadge']}>dark</span>}
                {selected && <span className={styles['selectedMark']}><Check size={12} aria-hidden="true" /></span>}
              </div>
              <span className={styles['themeBlurb']}>{simpleBlurb(t.description)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StepTabs({
  enabled,
  onToggle,
  locationLabel,
  onLocationLabelChange,
}: {
  enabled: OptionalViewId[];
  onToggle: (id: OptionalViewId) => void;
  locationLabel: 'Base' | 'Region';
  onLocationLabelChange: (v: 'Base' | 'Region') => void;
}) {
  return (
    <section className={styles['step']}>
      <h2 className={styles['stepTitle']}>Which tabs do you want?</h2>
      <p className={styles['stepPlain']}>
        Keep only the tabs you need. <strong>Month</strong> and <strong>Week</strong> are always on.
        You can turn any of the others off now — and flip them back on later from settings.
      </p>

      <div className={styles['viewGrid']}>
        {VIEW_CHOICES.map(v => {
          const isOptional = !v.alwaysOn;
          const isOn = v.alwaysOn || enabled.includes(v.id as OptionalViewId);
          const label = v.id === 'base' ? locationLabel : v.label;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => isOptional && onToggle(v.id as OptionalViewId)}
              className={[styles['viewCard'], isOn && styles['cardSelected']].filter(Boolean).join(' ')}
              aria-pressed={isOn}
              aria-disabled={!isOptional}
              disabled={!isOptional}
              title={!isOptional ? 'Always on' : undefined}
            >
              <IllustrationView kind={illustrationKindFor(v.id)} />
              <div className={styles['viewMeta']}>
                <span className={styles['viewLabel']}>{label}</span>
                {isOn && <span className={styles['selectedMark']}><Check size={12} aria-hidden="true" /></span>}
              </div>
              <span className={styles['viewBlurb']}>
                {!isOptional ? `${v.plain} (always on)` : v.plain}
              </span>
            </button>
          );
        })}
      </div>

      {enabled.includes('base') && (
        <div className={styles['locationLabelBlock']}>
          <div className={styles['locationLabelHeader']}>
            <MapPin size={14} aria-hidden="true" />
            <span className={styles['fieldLabel']}>What do you call your locations?</span>
          </div>
          <p className={styles['stepPlain']}>
            Pick the word that matches how your team talks. This shows up as the tab name
            and in saved views.
          </p>
          <div className={styles['locationLabelChoices']}>
            {(['Base', 'Region'] as const).map(value => {
              const selected = locationLabel === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={[styles['chipRadio'], selected && styles['chipRadioSelected']].filter(Boolean).join(' ')}
                  aria-pressed={selected}
                  onClick={() => onLocationLabelChange(value)}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function StepView({
  current,
  onChange,
  choices,
  locationLabel,
}: {
  current: SetupLandingResult['defaultView'];
  onChange: (v: SetupLandingResult['defaultView']) => void;
  choices: ViewChoice[];
  locationLabel: 'Base' | 'Region';
}) {
  return (
    <section className={styles['step']}>
      <h2 className={styles['stepTitle']}>What should you see first?</h2>
      <p className={styles['stepPlain']}>
        This is the view your calendar opens to. You can switch views any time with the buttons up top.
      </p>

      <div className={styles['viewGrid']}>
        {choices.map(v => {
          const selected = current === v.id;
          const label = v.id === 'base' ? locationLabel : v.label;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(v.id)}
              className={[styles['viewCard'], selected && styles['cardSelected']].filter(Boolean).join(' ')}
              aria-pressed={selected}
            >
              <IllustrationView kind={illustrationKindFor(v.id)} />
              <div className={styles['viewMeta']}>
                <span className={styles['viewLabel']}>{label}</span>
                {selected && <span className={styles['selectedMark']}><Check size={12} aria-hidden="true" /></span>}
              </div>
              <span className={styles['viewBlurb']}>{v.plain}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StepTeam({
  team,
  onChange,
}: {
  team: typeof STARTER_TEAM;
  onChange: (next: typeof STARTER_TEAM) => void;
}) {
  const update = (id: string, name: string) => {
    onChange(team.map(m => (m.id === id ? { ...m, name } : m)));
  };
  const add = () => {
    const colors = ['#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#14b8a6'];
    const nextColor = colors[team.length % colors.length]!;
    onChange([...team, { id: `t${Date.now()}`, name: '', color: nextColor }]);
  };
  const remove = (id: string) => {
    onChange(team.filter(m => m.id !== id));
  };

  return (
    <section className={styles['step']}>
      <h2 className={styles['stepTitle']}>Who is on your team?</h2>
      <p className={styles['stepPlain']}>
        Add the people who show up on your calendar. Just first names are fine.
        Leave a row blank to skip that person. You can add, rename, or remove people later.
      </p>

      <div className={styles['teamIllustrationRow']}>
        <IllustrationTeam members={team.filter(m => m.name.trim()).slice(0, 4)} />
      </div>

      <ul className={styles['teamList']}>
        {team.map(m => (
          <li key={m.id} className={styles['teamRow']}>
            <span className={styles['dot']} style={{ background: m.color }} aria-hidden="true" />
            <input
              className={styles['input']}
              type="text"
              value={m.name}
              onChange={e => update(m.id, e.target.value)}
              maxLength={40}
              placeholder="Type a name…"
            />
            {team.length > 1 && (
              <button
                className={styles['rowRemoveBtn']}
                type="button"
                onClick={() => remove(m.id)}
                aria-label={`Remove ${m.name || 'this person'}`}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <button className={styles['secondaryBtn']} type="button" onClick={add}>
        + Add another person
      </button>
    </section>
  );
}

function StepRecipes({
  selected,
  onToggle,
}: {
  selected: SetupRecipeId[];
  onToggle: (id: SetupRecipeId) => void;
}) {
  return (
    <section className={styles['step']}>
      <h2 className={styles['stepTitle']}>Pick a smart view or two</h2>
      <p className={styles['stepPlain']}>
        A smart view is a saved way to look at your calendar. We made some for you.
        Tap any box to turn it on. You can always add more, or make your own, later.
      </p>

      <div className={styles['recipeGrid']}>
        {RECIPE_CHOICES.map(r => {
          const isOn = selected.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onToggle(r.id)}
              className={[styles['recipeCard'], isOn && styles['cardSelected']].filter(Boolean).join(' ')}
              aria-pressed={isOn}
            >
              <IllustrationRecipe kind={r.id} />
              <div className={styles['recipeMeta']}>
                <span className={styles['recipeTitle']}>{r.title}</span>
                {isOn && <span className={styles['selectedMark']}><Check size={12} aria-hidden="true" /></span>}
              </div>
              <span className={styles['recipePlain']}>{r.plain}</span>
              <span className={styles['recipeExample']}>{r.example}</span>
            </button>
          );
        })}
      </div>

      <p className={styles['stepTip']}>
        Not sure? Leave <strong>Show everything</strong> on. You can add more views later from the views bar.
      </p>
    </section>
  );
}

/* ── Step 7: Assets & Requirements ───────────────────────────────────────── */

type StepAssetsProps = {
  assetTypes: AssetTypeDef[];
  onAssetTypesChange: (next: AssetTypeDef[]) => void;
  assetSeeds: AssetSeed[];
  onAssetSeedsChange: (next: AssetSeed[]) => void;
  requirementTemplates: Record<string, RequirementTemplate>;
  onRequirementTemplatesChange: (next: Record<string, RequirementTemplate>) => void;
};

function StepAssets({
  assetTypes,
  onAssetTypesChange,
  assetSeeds,
  onAssetSeedsChange,
  requirementTemplates,
  onRequirementTemplatesChange,
}: StepAssetsProps) {
  const [newTypeLabel, setNewTypeLabel] = useState('');

  const addType = () => {
    const label = newTypeLabel.trim();
    if (!label) return;
    const id = slugifyTypeId(label, assetTypes);
    onAssetTypesChange([...assetTypes, { id, label }]);
    setNewTypeLabel('');
  };

  const removeType = (typeId: string) => {
    onAssetTypesChange(assetTypes.filter(t => t.id !== typeId));
    onAssetSeedsChange(assetSeeds.filter(a => a.assetTypeId !== typeId));
    const { [typeId]: _removed, ...rest } = requirementTemplates;
    onRequirementTemplatesChange(rest);
  };

  const renameType = (typeId: string, label: string) => {
    onAssetTypesChange(assetTypes.map(t => (t.id === typeId ? { ...t, label } : t)));
  };

  const addAsset = (typeId: string) => {
    const seed: AssetSeed = {
      id: `asset-${Date.now()}-${assetSeeds.length}`,
      label: '',
      assetTypeId: typeId,
    };
    onAssetSeedsChange([...assetSeeds, seed]);
  };

  const updateAsset = (id: string, label: string) => {
    onAssetSeedsChange(assetSeeds.map(a => (a.id === id ? { ...a, label } : a)));
  };

  const removeAsset = (id: string) => {
    onAssetSeedsChange(assetSeeds.filter(a => a.id !== id));
  };

  const getTemplate = (typeId: string): RequirementTemplate =>
    requirementTemplates[typeId] ?? { roles: [], requiresApproval: false };

  const writeTemplate = (typeId: string, patch: Partial<RequirementTemplate>) => {
    const current = getTemplate(typeId);
    onRequirementTemplatesChange({
      ...requirementTemplates,
      [typeId]: { ...current, ...patch },
    });
  };

  const addRole = (typeId: string, role: RoleDef) => {
    const current = getTemplate(typeId);
    if (current.roles.some(r => r.id === role.id)) return;
    writeTemplate(typeId, { roles: [...current.roles, role] });
  };

  const removeRole = (typeId: string, roleId: string) => {
    const current = getTemplate(typeId);
    writeTemplate(typeId, { roles: current.roles.filter(r => r.id !== roleId) });
  };

  return (
    <section className={styles['step']}>
      <h2 className={styles['stepTitle']}>What do you book, and what does each booking need?</h2>
      <p className={styles['stepPlain']}>
        An <em>asset</em> is anything you book — a vehicle, a room, a piece of gear.
        Tell us what kinds you have, then say what each kind needs (a pilot, a medic,
        approval before it’s confirmed). This is the part most calendars miss.
      </p>

      {assetTypes.length === 0 && (
        <p className={styles['stepTip']}>
          No types yet. Add one below to get started — or skip this step entirely
          and come back later from the settings gear.
        </p>
      )}

      {assetTypes.map(type => {
        const seedsOfType = assetSeeds.filter(a => a.assetTypeId === type.id);
        const template = getTemplate(type.id);
        return (
          <div key={type.id} className={styles['assetTypeCard']}>
            <header className={styles['assetTypeHeader']}>
              <Plane size={14} aria-hidden="true" />
              <input
                className={styles['assetTypeName']}
                value={type.label}
                onChange={e => renameType(type.id, e.target.value)}
                aria-label={`Rename ${type.label || type.id}`}
                placeholder="Type name"
              />
              <button
                type="button"
                className={styles['rowRemoveBtn']}
                onClick={() => removeType(type.id)}
                aria-label={`Remove ${type.label || type.id}`}
              >
                <Trash2 size={12} aria-hidden="true" /> Remove type
              </button>
            </header>

            {/* Assets of this type */}
            <div className={styles['assetSubsection']}>
              <span className={styles['fieldLabel']}>Your {(type.label || 'assets').toLowerCase()}</span>
              {seedsOfType.length === 0 && (
                <p className={styles['assetEmpty']}>None added yet.</p>
              )}
              <ul className={styles['assetSeedList']}>
                {seedsOfType.map(seed => (
                  <li key={seed.id} className={styles['assetSeedRow']}>
                    <input
                      className={styles['input']}
                      value={seed.label}
                      placeholder={`e.g. ${exampleNameFor(type.label)}`}
                      onChange={e => updateAsset(seed.id, e.target.value)}
                      aria-label={`Name for asset ${seed.id}`}
                    />
                    <button
                      type="button"
                      className={styles['rowRemoveBtn']}
                      onClick={() => removeAsset(seed.id)}
                      aria-label={`Remove asset ${seed.label || seed.id}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={styles['secondaryBtn']}
                onClick={() => addAsset(type.id)}
              >
                <Plus size={13} aria-hidden="true" /> Add {(type.label || 'asset').toLowerCase()}
              </button>
            </div>

            {/* Required roles */}
            <div className={styles['assetSubsection']}>
              <span className={styles['fieldLabel']}>What does a request need?</span>
              <p className={styles['assetSubDesc']}>
                Pick the roles a booking must fill. The request form will show one slot
                per role so the dispatcher fills them in before submitting.
              </p>
              <div className={styles['rolePillRow']}>
                {template.roles.map(role => (
                  <span key={role.id} className={styles['rolePillSelected']}>
                    {role.label}
                    <button
                      type="button"
                      onClick={() => removeRole(type.id, role.id)}
                      aria-label={`Remove role ${role.label}`}
                      className={styles['rolePillRemove']}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {template.roles.length === 0 && (
                  <span className={styles['assetEmpty']}>No roles required yet.</span>
                )}
              </div>
              <div className={styles['rolePillSuggestRow']}>
                {SUGGESTED_ROLES.filter(r => !template.roles.some(t => t.id === r.id)).map(role => (
                  <button
                    key={role.id}
                    type="button"
                    className={styles['rolePillSuggest']}
                    onClick={() => addRole(type.id, role)}
                  >
                    <Plus size={11} aria-hidden="true" /> {role.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Approval rule */}
            <div className={styles['assetSubsection']}>
              <label className={styles['approvalToggleRow']}>
                <input
                  type="checkbox"
                  checked={template.requiresApproval}
                  onChange={e => writeTemplate(type.id, { requiresApproval: e.target.checked })}
                />
                <ShieldCheck size={14} aria-hidden="true" />
                <span>Requires approval before it’s confirmed</span>
              </label>
            </div>
          </div>
        );
      })}

      {/* Add new asset type */}
      <div className={styles['addTypeRow']}>
        <input
          className={styles['input']}
          value={newTypeLabel}
          onChange={e => setNewTypeLabel(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addType();
            }
          }}
          placeholder="Add another type — e.g. Boat, Drone, Studio…"
          aria-label="New asset type name"
        />
        <button
          type="button"
          className={styles['secondaryBtn']}
          onClick={addType}
          disabled={!newTypeLabel.trim()}
        >
          <Plus size={13} aria-hidden="true" /> Add type
        </button>
      </div>

      <p className={styles['stepTip']}>
        Tip: leave anything blank to skip it. You can edit assets, roles, and approval
        rules any time from <strong>Settings → Assets</strong>.
      </p>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Utilities                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/** Generate a stable id slug from a free-text type label. */
function slugifyTypeId(label: string, existing: AssetTypeDef[]): string {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'type';
  if (!existing.some(t => t.id === base)) return base;
  let n = 2;
  while (existing.some(t => t.id === `${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Friendly placeholder for asset name input, picked from the type label. */
function exampleNameFor(typeLabel: string): string {
  const lc = typeLabel.toLowerCase();
  if (lc.includes('aircraft')) return 'N100AA';
  if (lc.includes('vehicle'))  return 'Truck 12';
  if (lc.includes('room'))     return 'Studio A';
  return `${typeLabel} 1`;
}

/** Map setup view ids to illustration kinds. Base/assets reuse the schedule illustration. */
function illustrationKindFor(id: SetupLandingResult['defaultView']): 'month' | 'week' | 'day' | 'agenda' | 'schedule' {
  if (id === 'base' || id === 'assets') return 'schedule';
  return id;
}

/** Strip jargon words from theme descriptions so 5th-graders get the gist. */
function simpleBlurb(desc: string): string {
  // Keep only the first sentence, it's usually the friendliest.
  const firstSentence = desc.split(/[.!?]/)[0]?.trim() ?? desc;
  return firstSentence.length > 60 ? firstSentence.slice(0, 57) + '\u2026' : firstSentence;
}
