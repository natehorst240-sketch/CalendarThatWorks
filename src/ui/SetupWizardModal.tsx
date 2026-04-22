/**
 * SetupWizardModal.jsx — First-time owner setup wizard.
 *
 * 3-step wizard shown automatically to owners who haven't completed setup,
 * and accessible any time via the toolbar wand button.
 *
 * Step 1 — Basic info: calendar name + theme picker
 * Step 2 — Smart Views: AdvancedFilterBuilder (skippable)
 * Step 3 — Done: summary + finish
 *
 * Props:
 *   isOpen        boolean
 *   onClose       () => void
 *   updateConfig  (patch) => void   — from useOwnerConfig
 *   categories    string[]          — available category values
 *   resources     string[]          — available resource/person values
 *   onSaveView    (name, filters, opts) => void  — wired to useSavedViews.saveView
 */
import { useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { X, ChevronRight, Check, Sparkles, Camera } from 'lucide-react';
import { THEMES, THEME_META, normalizeTheme } from '../styles/themes';
import { useFocusTrap } from '../hooks/useFocusTrap';
import AdvancedFilterBuilder from './AdvancedFilterBuilder';
import styles from './SetupWizardModal.module.css';

const TOTAL_STEPS = 4;
type TeamMember = {
  id: number;
  name: string;
  color: string;
  avatar: string | null;
};
const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
  { id: 1, name: 'Priya', color: '#8b5cf6', avatar: null },
  { id: 2, name: 'Alex',  color: '#ec4899', avatar: null },
  { id: 3, name: 'Dana',  color: '#14b8a6', avatar: null },
];

type CreatedView = {
  name: string;
  conditions: unknown[];
};

type SetupWizardModalProps = {
  isOpen: boolean;
  onClose?: () => void;
  updateConfig?: (patch: Record<string, unknown>) => void;
  categories?: string[];
  resources?: string[];
  onSaveView?: (name: string, filters: Record<string, unknown>, options: Record<string, unknown>) => void;
};

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function SetupWizardModal({
  isOpen,
  onClose,
  updateConfig,
  categories = [],
  resources  = [],
  onSaveView,
}: SetupWizardModalProps) {
  const [step,           setStep]           = useState(1);
  const [calendarName,   setCalendarName]   = useState('My WorksCalendar');
  const [selectedTheme,  setSelectedTheme]  = useState('corporate');
  const [createdViews,   setCreatedViews]   = useState<CreatedView[]>([]); // { name, conditions }[]
  const [teamMembers,    setTeamMembers]    = useState<TeamMember[]>(DEFAULT_TEAM_MEMBERS);
  const trapRef = useFocusTrap(onClose);

  if (!isOpen) return null;

  const handleSaveView = (name: string, filters: Record<string, unknown>, conditions: unknown[]) => {
    onSaveView?.(name, filters, { color: null });
    setCreatedViews((prev) => [...prev, { name, conditions }]);
  };

  const handleFinish = () => {
    updateConfig?.({
      title: calendarName.trim() || 'My WorksCalendar',
      setup: {
        preferredTheme: selectedTheme,
        completed: true,
      },
      team: {
        members: teamMembers.map(({ id, name, color, avatar }) => ({ id, name: name.trim() || 'Teammate', color, avatar })),
      },
    });
    onClose?.();
  };

  const handleProfileUpload = (memberId: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev: ProgressEvent<FileReader>) => {
      const avatar = typeof ev.target?.result === 'string' ? ev.target.result : null;
      setTeamMembers((prev) => prev.map((member) =>
        member.id === memberId ? { ...member, avatar } : member
      ));
    };
    reader.readAsDataURL(file);
  };

  const goBack = () => setStep(s => Math.max(1, s - 1));
  const goNext = () => setStep(s => Math.min(TOTAL_STEPS, s + 1));

  return (
    <div
      className={styles.overlay}
      onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        ref={trapRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Calendar setup wizard"
      >
        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}><Sparkles size={16} /></span>
            <h2 className={styles.title}>Calendar Setup</h2>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.stepPill}>Step {step} of {TOTAL_STEPS}</span>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close setup wizard">
              <X size={17} />
            </button>
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div className={styles.progressTrack} role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={TOTAL_STEPS}>
          <div className={styles.progressFill} style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
        </div>

        {/* ── Step content ── */}
        <div className={styles.body}>
          {step === 1 && (
            <Step1
              calendarName={calendarName}
              onCalendarNameChange={setCalendarName}
              selectedTheme={selectedTheme}
              onThemeChange={setSelectedTheme}
            />
          )}
          {step === 2 && (
            <Step2Team
              teamMembers={teamMembers}
              onTeamMemberNameChange={(id, name) => {
                setTeamMembers(prev => prev.map(member =>
                  member.id === id ? { ...member, name } : member
                ));
              }}
              onUpload={handleProfileUpload}
            />
          )}
          {step === 3 && (
            <Step2
              categories={categories}
              resources={resources}
              createdViews={createdViews}
              onSaveView={handleSaveView}
            />
          )}
          {step === 4 && (
            <Step3
              calendarName={calendarName}
              selectedTheme={selectedTheme}
              teamMembers={teamMembers}
              createdViews={createdViews}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {step > 1 && (
              <button className={styles.backBtn} onClick={goBack}>Back</button>
            )}
          </div>
          <div className={styles.footerRight}>
            {step < TOTAL_STEPS ? (
              <button className={styles.nextBtn} onClick={goNext}>
                {step === 3 ? 'Continue' : 'Next'}
                <ChevronRight size={15} />
              </button>
            ) : (
              <button className={styles.finishBtn} onClick={handleFinish}>
                <Check size={14} />
                Finish Setup
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Basic info ───────────────────────────────────────────────────────

type Step1Props = {
  calendarName: string;
  onCalendarNameChange: (name: string) => void;
  selectedTheme: string;
  onThemeChange: (themeId: string) => void;
};

function Step1({ calendarName, onCalendarNameChange, selectedTheme, onThemeChange }: Step1Props) {
  // The wizard seeds `selectedTheme` with a legacy id ('corporate'); normalize
  // so the matching theme-family card shows as selected on first render.
  const normalizedSelected = normalizeTheme(selectedTheme);
  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h3 className={styles.stepTitle}>Name your calendar</h3>
        <p className={styles.stepDesc}>Give your calendar a name and pick a visual theme for your team.</p>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="swm-cal-name">Calendar name</label>
        <input
          id="swm-cal-name"
          className={styles.input}
          type="text"
          value={calendarName}
          onChange={e => onCalendarNameChange(e.target.value)}
          placeholder="e.g. Ops Hub, Team Calendar…"
          maxLength={64}
        />
      </div>

      <div className={styles.field}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.fieldLabel}>Theme</legend>
          <div className={styles.themeGrid}>
          {THEMES.map(id => {
            const theme = THEME_META[id];
            const selected = normalizedSelected === theme.id;
            return (
              <button
                key={theme.id}
                className={[styles.themeCard, selected && styles.themeCardSelected].filter(Boolean).join(' ')}
                onClick={() => onThemeChange(theme.id)}
                title={theme.description}
                aria-pressed={selected}
              >
                {/* Mini preview swatch */}
                <div
                  className={styles.themeSwatch}
                  style={{ background: theme.preview.bg, borderColor: theme.preview.border }}
                >
                  <div className={styles.swatchAccent} style={{ background: theme.preview.accent }} />
                  <div className={styles.swatchLines}>
                    <span style={{ background: theme.preview.text }} />
                    <span style={{ background: theme.preview.text, width: '60%' }} />
                  </div>
                </div>
                <span className={styles.themeLabel}>{theme.label}</span>
                {selected && (
                  <span className={styles.themeCheck}><Check size={10} /></span>
                )}
              </button>
            );
          })}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

// ─── Step 2: Team members ─────────────────────────────────────────────────────

type Step2TeamProps = {
  teamMembers: TeamMember[];
  onTeamMemberNameChange: (id: number, name: string) => void;
  onUpload: (id: number, e: ChangeEvent<HTMLInputElement>) => void;
};

function Step2Team({ teamMembers, onTeamMemberNameChange, onUpload }: Step2TeamProps) {
  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h3 className={styles.stepTitle}>Team Members &amp; Profiles</h3>
        <p className={styles.stepDesc}>Add names and optional profile images used across setup and handoff views.</p>
      </div>

      <div className={styles.memberList}>
        {teamMembers.map((member) => (
          <div key={member.id} className={styles.memberCard}>
            <label className={styles.avatarPicker}>
              <div className={styles.avatarFrame}>
                {member.avatar ? (
                  <img src={member.avatar} alt={`${member.name} avatar`} className={styles.avatarImg} />
                ) : (
                  <div className={styles.avatarFallback} style={{ backgroundColor: member.color }}>
                    {(member.name?.trim()?.[0] ?? '?').toUpperCase()}
                  </div>
                )}
              </div>
              <input
                id={`swm-photo-${member.id}`}
                type="file"
                accept="image/*"
                className={styles.fileInput}
                aria-label={`Upload photo for ${member.name || `team member ${member.id}`}`}
                onChange={(e) => onUpload(member.id, e)}
              />
              <span className={styles.avatarBadge}><Camera size={11} /> Photo</span>
            </label>

            <label htmlFor={`swm-member-${member.id}`} className={styles.fieldLabel}>
              Team member name
            </label>
            <input
              type="text"
              id={`swm-member-${member.id}`}
              className={styles.input}
              value={member.name}
              onChange={(e) => onTeamMemberNameChange(member.id, e.target.value)}
              maxLength={40}
              placeholder="Team member name"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 3: Smart Views ──────────────────────────────────────────────────────

type Step2Props = {
  categories: string[];
  resources: string[];
  createdViews: CreatedView[];
  onSaveView: (name: string, filters: Record<string, unknown>, conditions: unknown[]) => void;
};

function Step2({ categories, resources, createdViews, onSaveView }: Step2Props) {
  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <h3 className={styles.stepTitle}>Create Smart Views</h3>
        <p className={styles.stepDesc}>
          Build filter presets with AND / OR logic — e.g. "On-Call OR Incident for Alice".
          You can skip this and add views later from the saved-views bar.
        </p>
      </div>

      <AdvancedFilterBuilder
        categories={categories}
        resources={resources}
        onSave={onSaveView}
        onUpdate={() => {}}
        onCancelEdit={() => {}}
      />

      {createdViews.length > 0 && (
        <div className={styles.createdList}>
          <span className={styles.createdLabel}>Created this session:</span>
          <div className={styles.createdChips}>
            {createdViews.map((v: CreatedView, i: number) => (
              <span key={i} className={styles.createdChip}>
                <Check size={11} />{v.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Done ─────────────────────────────────────────────────────────────

type Step3Props = {
  calendarName: string;
  selectedTheme: string;
  teamMembers: TeamMember[];
  createdViews: CreatedView[];
};

function Step3({ calendarName, selectedTheme, teamMembers, createdViews }: Step3Props) {
  // Summary card lookup — normalize so legacy ids still resolve to metadata.
  const normalizedSelected = selectedTheme ? normalizeTheme(selectedTheme) : undefined;
  const theme = normalizedSelected
    ? THEME_META[normalizedSelected]
    : undefined;

  return (
    <div className={[styles.step, styles.stepDone].join(' ')}>
      <div className={styles.doneIcon}>
        <Check size={28} />
      </div>

      <div className={styles.stepHeader}>
        <h3 className={styles.stepTitle}>You're all set!</h3>
        <p className={styles.stepDesc}>
          <strong>{calendarName || 'Your calendar'}</strong> is configured and ready to go.
        </p>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryCardLabel}>Theme</span>
          <div className={styles.summaryCardValue}>
            {theme && (
              <span
                className={styles.themeColorDot}
                style={{ background: theme.preview.accent }}
              />
            )}
            {theme?.label ?? selectedTheme}
          </div>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryCardLabel}>Smart Views</span>
          <div className={styles.summaryCardValue}>
            {createdViews.length === 0 ? 'None created' : `${createdViews.length} created`}
          </div>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryCardLabel}>Team Members</span>
          <div className={styles.summaryCardValue}>
            {teamMembers.filter(member => member.name.trim()).length}
          </div>
        </div>
      </div>

      {theme && (
        <div className={styles.themeNote}>
          To apply the <strong>{theme.label}</strong> theme pass{' '}
          <code className={styles.code}>theme="{selectedTheme}"</code> to your{' '}
          <code className={styles.code}>WorksCalendar</code> component.
        </div>
      )}
    </div>
  );
}
