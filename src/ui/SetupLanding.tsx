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
import { ChevronRight, ChevronLeft, Check, Sparkles, Rocket, Users, Palette, LayoutGrid, Wand2, MapPin } from 'lucide-react';
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

export type SetupLandingResult = {
  calendarName: string;
  theme: string;
  defaultView: 'month' | 'week' | 'day' | 'agenda' | 'schedule' | 'base' | 'assets';
  enabledViews: OptionalViewId[];
  locationLabel: 'Base' | 'Region';
  teamMembers: Array<{ id: string; name: string; color: string }>;
  recipes: SetupRecipeId[];
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

const TOTAL_STEPS = 6;

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
    });
  };

  /* ── Welcome ─────────────────────────────────────────────────────────── */
  if (step === 0) {
    return (
      <div className={styles.landing} data-wc-theme={resolveCssTheme(theme)} role="region" aria-label="Calendar setup">
        <div className={styles.hero}>
          <div className={styles.heroIcon}><Rocket size={40} aria-hidden="true" /></div>
          <h1 className={styles.heroTitle}>Let’s set up your calendar</h1>
          <p className={styles.heroLead}>
            Answer a few easy questions and we’ll pick good settings for you.
            No tech words. No guessing. You can change anything later.
          </p>

          <div className={styles.heroBullets}>
            <div className={styles.heroBullet}><Palette size={16} aria-hidden="true" /> Pick how it looks</div>
            <div className={styles.heroBullet}><LayoutGrid size={16} aria-hidden="true" /> Pick what you see first</div>
            <div className={styles.heroBullet}><Users size={16} aria-hidden="true" /> Add your team</div>
            <div className={styles.heroBullet}><Wand2 size={16} aria-hidden="true" /> Make a smart view</div>
          </div>

          <div className={styles.heroActions}>
            <button className={styles.primaryBtn} onClick={() => setStep(1)} type="button">
              <Sparkles size={16} aria-hidden="true" /> Start setup guide
            </button>
            <button className={styles.skipBtn} onClick={onSkip} type="button">
              Skip setup guide
            </button>
          </div>
          <p className={styles.heroFine}>
            Skip if you already know how this calendar works. You can open setup again from the settings gear.
          </p>
        </div>
      </div>
    );
  }

  /* ── Steps ───────────────────────────────────────────────────────────── */
  return (
    <div className={styles.landing} data-wc-theme={resolveCssTheme(theme)} role="region" aria-label="Calendar setup">
      <div className={styles.shell}>
        <header className={styles.topBar}>
          <span className={styles.brand}><Sparkles size={14} aria-hidden="true" /> Calendar setup</span>
          <span className={styles.stepPill}>Step {step} of {TOTAL_STEPS}</span>
          <button className={styles.skipTextBtn} onClick={onSkip} type="button">
            Skip setup guide
          </button>
        </header>

        <div className={styles.progressTrack} role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={TOTAL_STEPS}>
          <div className={styles.progressFill} style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
        </div>

        <main className={styles.body}>
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
        </main>

        <footer className={styles.footer}>
          <button
            className={styles.backBtn}
            onClick={back}
            type="button"
            disabled={step === 1}
          >
            <ChevronLeft size={15} aria-hidden="true" /> Back
          </button>

          {step < TOTAL_STEPS ? (
            <button className={styles.primaryBtn} onClick={next} type="button">
              Next <ChevronRight size={15} aria-hidden="true" />
            </button>
          ) : (
            <button className={styles.primaryBtn} onClick={handleFinish} type="button">
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
    <section className={styles.step}>
      <h2 className={styles.stepTitle}>What should we call your calendar?</h2>
      <p className={styles.stepPlain}>
        Pick a name your team will know. It shows up at the top of the page.
        Something like <em>“Team Calendar”</em> or <em>“Kitchen Schedule”</em> works great.
      </p>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Calendar name</span>
        <input
          className={styles.input}
          type="text"
          value={name}
          onChange={e => onChange(e.target.value)}
          maxLength={64}
          placeholder="My Calendar"
          autoFocus
        />
      </label>
      <p className={styles.stepTip}>
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
    <section className={styles.step}>
      <h2 className={styles.stepTitle}>How should it look?</h2>
      <p className={styles.stepPlain}>
        Pick a look that feels right for your team. You are only picking colors here.
        You can switch any time.
      </p>

      <div className={styles.themeGrid}>
        {THEMES.map(id => {
          const t = THEME_META[id];
          const selected = normalizedCurrent === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={[styles.themeCard, selected && styles.cardSelected].filter(Boolean).join(' ')}
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
              <div className={styles.themeMeta}>
                <span className={styles.themeLabel}>{t.label}</span>
                {t.dark && <span className={styles.themeBadge}>dark</span>}
                {selected && <span className={styles.selectedMark}><Check size={12} aria-hidden="true" /></span>}
              </div>
              <span className={styles.themeBlurb}>{simpleBlurb(t.description)}</span>
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
    <section className={styles.step}>
      <h2 className={styles.stepTitle}>Which tabs do you want?</h2>
      <p className={styles.stepPlain}>
        Keep only the tabs you need. <strong>Month</strong> and <strong>Week</strong> are always on.
        You can turn any of the others off now — and flip them back on later from settings.
      </p>

      <div className={styles.viewGrid}>
        {VIEW_CHOICES.map(v => {
          const isOptional = !v.alwaysOn;
          const isOn = v.alwaysOn || enabled.includes(v.id as OptionalViewId);
          const label = v.id === 'base' ? locationLabel : v.label;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => isOptional && onToggle(v.id as OptionalViewId)}
              className={[styles.viewCard, isOn && styles.cardSelected].filter(Boolean).join(' ')}
              aria-pressed={isOn}
              aria-disabled={!isOptional}
              disabled={!isOptional}
              title={!isOptional ? 'Always on' : undefined}
            >
              <IllustrationView kind={illustrationKindFor(v.id)} />
              <div className={styles.viewMeta}>
                <span className={styles.viewLabel}>{label}</span>
                {isOn && <span className={styles.selectedMark}><Check size={12} aria-hidden="true" /></span>}
              </div>
              <span className={styles.viewBlurb}>
                {!isOptional ? `${v.plain} (always on)` : v.plain}
              </span>
            </button>
          );
        })}
      </div>

      {enabled.includes('base') && (
        <div className={styles.locationLabelBlock}>
          <div className={styles.locationLabelHeader}>
            <MapPin size={14} aria-hidden="true" />
            <span className={styles.fieldLabel}>What do you call your locations?</span>
          </div>
          <p className={styles.stepPlain}>
            Pick the word that matches how your team talks. This shows up as the tab name
            and in saved views.
          </p>
          <div className={styles.locationLabelChoices}>
            {(['Base', 'Region'] as const).map(value => {
              const selected = locationLabel === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={[styles.chipRadio, selected && styles.chipRadioSelected].filter(Boolean).join(' ')}
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
    <section className={styles.step}>
      <h2 className={styles.stepTitle}>What should you see first?</h2>
      <p className={styles.stepPlain}>
        This is the view your calendar opens to. You can switch views any time with the buttons up top.
      </p>

      <div className={styles.viewGrid}>
        {choices.map(v => {
          const selected = current === v.id;
          const label = v.id === 'base' ? locationLabel : v.label;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(v.id)}
              className={[styles.viewCard, selected && styles.cardSelected].filter(Boolean).join(' ')}
              aria-pressed={selected}
            >
              <IllustrationView kind={illustrationKindFor(v.id)} />
              <div className={styles.viewMeta}>
                <span className={styles.viewLabel}>{label}</span>
                {selected && <span className={styles.selectedMark}><Check size={12} aria-hidden="true" /></span>}
              </div>
              <span className={styles.viewBlurb}>{v.plain}</span>
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
    const nextColor = colors[team.length % colors.length];
    onChange([...team, { id: `t${Date.now()}`, name: '', color: nextColor }]);
  };
  const remove = (id: string) => {
    onChange(team.filter(m => m.id !== id));
  };

  return (
    <section className={styles.step}>
      <h2 className={styles.stepTitle}>Who is on your team?</h2>
      <p className={styles.stepPlain}>
        Add the people who show up on your calendar. Just first names are fine.
        Leave a row blank to skip that person. You can add, rename, or remove people later.
      </p>

      <div className={styles.teamIllustrationRow}>
        <IllustrationTeam members={team.filter(m => m.name.trim()).slice(0, 4)} />
      </div>

      <ul className={styles.teamList}>
        {team.map(m => (
          <li key={m.id} className={styles.teamRow}>
            <span className={styles.dot} style={{ background: m.color }} aria-hidden="true" />
            <input
              className={styles.input}
              type="text"
              value={m.name}
              onChange={e => update(m.id, e.target.value)}
              maxLength={40}
              placeholder="Type a name…"
            />
            {team.length > 1 && (
              <button
                className={styles.rowRemoveBtn}
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

      <button className={styles.secondaryBtn} type="button" onClick={add}>
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
    <section className={styles.step}>
      <h2 className={styles.stepTitle}>Pick a smart view or two</h2>
      <p className={styles.stepPlain}>
        A smart view is a saved way to look at your calendar. We made some for you.
        Tap any box to turn it on. You can always add more, or make your own, later.
      </p>

      <div className={styles.recipeGrid}>
        {RECIPE_CHOICES.map(r => {
          const isOn = selected.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onToggle(r.id)}
              className={[styles.recipeCard, isOn && styles.cardSelected].filter(Boolean).join(' ')}
              aria-pressed={isOn}
            >
              <IllustrationRecipe kind={r.id} />
              <div className={styles.recipeMeta}>
                <span className={styles.recipeTitle}>{r.title}</span>
                {isOn && <span className={styles.selectedMark}><Check size={12} aria-hidden="true" /></span>}
              </div>
              <span className={styles.recipePlain}>{r.plain}</span>
              <span className={styles.recipeExample}>{r.example}</span>
            </button>
          );
        })}
      </div>

      <p className={styles.stepTip}>
        Not sure? Leave <strong>Show everything</strong> on. You can add more views later from the views bar.
      </p>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Utilities                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

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
