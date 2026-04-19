/**
 * SetupLandingIllustrations — inline SVG diagrams for the setup landing page.
 *
 * Kept in a dedicated file so the main SetupLanding component stays focused
 * on the form. Every illustration is a pure function of its props and ships
 * no binary assets, so the bundle stays tiny and the diagrams stay in sync
 * with the design system.
 */
import type { CSSProperties } from 'react';
import type { SetupRecipeId } from './SetupLanding';

/* ────────────────────────────────────────────────────────────────────────── */
/*  Theme preview                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

export type IllustrationThemeProps = {
  bg: string;
  surface: string;
  accent: string;
  text: string;
  border: string;
};

/** Miniature calendar surface painted in the theme's five preview colors. */
export function IllustrationTheme({ bg, surface, accent, text, border }: IllustrationThemeProps) {
  return (
    <svg viewBox="0 0 120 72" role="img" aria-label="Theme preview" style={svgStyle}>
      <rect x="0" y="0" width="120" height="72" rx="6" fill={bg} stroke={border} />
      <rect x="6" y="6" width="108" height="10" rx="2" fill={surface} stroke={border} />
      <rect x="9" y="9" width="18" height="4" rx="1" fill={accent} />
      <rect x="6" y="20" width="108" height="46" rx="2" fill={surface} stroke={border} />
      {/* mini event pills */}
      <rect x="10" y="25" width="28" height="6" rx="2" fill={accent} opacity="0.85" />
      <rect x="42" y="25" width="20" height="6" rx="2" fill={text} opacity="0.22" />
      <rect x="10" y="35" width="18" height="6" rx="2" fill={text} opacity="0.22" />
      <rect x="32" y="35" width="30" height="6" rx="2" fill={accent} opacity="0.65" />
      <rect x="66" y="35" width="22" height="6" rx="2" fill={text} opacity="0.22" />
      <rect x="10" y="45" width="40" height="6" rx="2" fill={accent} opacity="0.85" />
      <rect x="54" y="45" width="24" height="6" rx="2" fill={text} opacity="0.22" />
      <rect x="10" y="55" width="16" height="6" rx="2" fill={text} opacity="0.22" />
      <rect x="30" y="55" width="36" height="6" rx="2" fill={accent} opacity="0.5" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  View preview                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

export type IllustrationViewKind = 'month' | 'week' | 'day' | 'agenda' | 'schedule';

/** Wireframe showing the shape of each starting view. */
export function IllustrationView({ kind }: { kind: IllustrationViewKind }) {
  const pill = 'var(--wc-accent, #3b82f6)';
  const ink = 'var(--wc-text, #0f172a)';
  const soft = 'var(--wc-border, #cbd5e1)';
  const bg = 'var(--wc-surface, #f8fafc)';

  return (
    <svg viewBox="0 0 140 84" role="img" aria-label={`${kind} view preview`} style={svgStyle}>
      <rect x="0" y="0" width="140" height="84" rx="6" fill={bg} stroke={soft} />
      {kind === 'month' && <MonthWireframe ink={ink} soft={soft} pill={pill} />}
      {kind === 'week' && <WeekWireframe ink={ink} soft={soft} pill={pill} />}
      {kind === 'day' && <DayWireframe ink={ink} soft={soft} pill={pill} />}
      {kind === 'agenda' && <AgendaWireframe ink={ink} soft={soft} pill={pill} />}
      {kind === 'schedule' && <ScheduleWireframe ink={ink} soft={soft} pill={pill} />}
    </svg>
  );
}

function MonthWireframe({ ink, soft, pill }: { ink: string; soft: string; pill: string }) {
  const cells = [] as JSX.Element[];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      const x = 6 + c * 18.5;
      const y = 10 + r * 16;
      cells.push(<rect key={`${r}-${c}`} x={x} y={y} width={18} height={16} fill="none" stroke={soft} />);
    }
  }
  return (
    <g>
      {cells}
      <rect x="8" y="14" width="10" height="2" fill={ink} opacity="0.4" />
      <rect x="8" y="18" width="14" height="3" rx="1" fill={pill} opacity="0.85" />
      <rect x="45" y="30" width="14" height="3" rx="1" fill={pill} opacity="0.6" />
      <rect x="82" y="46" width="14" height="3" rx="1" fill={pill} opacity="0.85" />
    </g>
  );
}

function WeekWireframe({ ink, soft, pill }: { ink: string; soft: string; pill: string }) {
  const days = [] as JSX.Element[];
  for (let c = 0; c < 7; c++) {
    const x = 6 + c * 18.5;
    days.push(<line key={c} x1={x} y1={10} x2={x} y2={76} stroke={soft} />);
  }
  return (
    <g>
      {days}
      <line x1="6" y1="10" x2="134" y2="10" stroke={soft} />
      <rect x="9" y="18" width="14" height="18" rx="2" fill={pill} opacity="0.75" />
      <rect x="46" y="30" width="14" height="14" rx="2" fill={pill} opacity="0.55" />
      <rect x="102" y="44" width="14" height="22" rx="2" fill={pill} opacity="0.85" />
    </g>
  );
}

function DayWireframe({ ink, soft, pill }: { ink: string; soft: string; pill: string }) {
  return (
    <g>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <line key={i} x1="20" y1={12 + i * 12} x2="132" y2={12 + i * 12} stroke={soft} />
      ))}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <rect key={`t${i}`} x="6" y={10 + i * 12} width="10" height="2" fill={ink} opacity="0.4" />
      ))}
      <rect x="22" y="16" width="106" height="12" rx="2" fill={pill} opacity="0.85" />
      <rect x="22" y="42" width="78" height="10" rx="2" fill={pill} opacity="0.55" />
      <rect x="22" y="58" width="56" height="14" rx="2" fill={pill} opacity="0.75" />
    </g>
  );
}

function AgendaWireframe({ ink, soft, pill }: { ink: string; soft: string; pill: string }) {
  return (
    <g>
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <rect x="6" y={10 + i * 18} width="128" height="14" rx="3" fill="none" stroke={soft} />
          <rect x="10" y={14 + i * 18} width="4" height="6" rx="1" fill={pill} opacity="0.9" />
          <rect x="18" y={14 + i * 18} width="64" height="2" fill={ink} opacity="0.55" />
          <rect x="18" y={18 + i * 18} width="40" height="2" fill={ink} opacity="0.3" />
        </g>
      ))}
    </g>
  );
}

function ScheduleWireframe({ ink, soft, pill }: { ink: string; soft: string; pill: string }) {
  return (
    <g>
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <rect x="6" y={12 + i * 16} width="24" height="14" rx="2" fill={ink} opacity="0.08" />
          <circle cx="14" cy={19 + i * 16} r="3" fill={pill} opacity={0.4 + i * 0.15} />
          <rect x="34" y={14 + i * 16} width="100" height="10" rx="2" fill="none" stroke={soft} />
          <rect x={36 + i * 14} y={16 + i * 16} width={24 + i * 8} height="6" rx="1" fill={pill} opacity="0.85" />
        </g>
      ))}
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Team preview                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

export type IllustrationTeamMember = { id: string; name: string; color: string };

/** Row of avatar bubbles — fills with placeholders if the team is thin. */
export function IllustrationTeam({ members }: { members: IllustrationTeamMember[] }) {
  const placeholderColors = ['#94a3b8', '#94a3b8', '#94a3b8', '#94a3b8'];
  const filled = members.slice(0, 4);
  const placeholders = placeholderColors.slice(0, Math.max(0, 3 - filled.length));

  const bubbles = [
    ...filled.map((m, i) => ({ key: m.id, color: m.color, letter: firstLetter(m.name), x: 12 + i * 30 })),
    ...placeholders.map((color, i) => ({
      key: `ph-${i}`,
      color,
      letter: '?',
      x: 12 + (filled.length + i) * 30,
    })),
  ];

  return (
    <svg viewBox="0 0 140 48" role="img" aria-label="Team preview" style={svgStyle}>
      {bubbles.map(b => (
        <g key={b.key}>
          <circle cx={b.x + 12} cy="24" r="14" fill={b.color} opacity={b.letter === '?' ? 0.35 : 1} />
          <text
            x={b.x + 12}
            y="28"
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fill="#ffffff"
            fontFamily="system-ui, sans-serif"
          >
            {b.letter}
          </text>
        </g>
      ))}
    </svg>
  );
}

function firstLetter(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Smart-view recipe previews                                                */
/* ────────────────────────────────────────────────────────────────────────── */

/** Tiny diagram of what each recipe does with the events. */
export function IllustrationRecipe({ kind }: { kind: SetupRecipeId }) {
  return (
    <svg viewBox="0 0 140 72" role="img" aria-label={`${kind} recipe preview`} style={svgStyle}>
      <rect x="0" y="0" width="140" height="72" rx="6" fill="var(--wc-surface, #f8fafc)" stroke="var(--wc-border, #cbd5e1)" />
      {kind === 'everything' && <RecipeEverything />}
      {kind === 'by-person' && <RecipeByPerson />}
      {kind === 'by-type' && <RecipeByType />}
      {kind === 'on-call' && <RecipeOnCall />}
      {kind === 'this-week' && <RecipeThisWeek />}
    </svg>
  );
}

const pillColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

function RecipeEverything() {
  // A messy jumble of every color — the "firehose" default.
  const pills = [
    { x: 8, y: 12, w: 40, c: 0 },
    { x: 52, y: 12, w: 22, c: 1 },
    { x: 78, y: 12, w: 30, c: 2 },
    { x: 8, y: 24, w: 26, c: 3 },
    { x: 38, y: 24, w: 46, c: 4 },
    { x: 88, y: 24, w: 20, c: 5 },
    { x: 8, y: 36, w: 32, c: 1 },
    { x: 44, y: 36, w: 24, c: 2 },
    { x: 72, y: 36, w: 36, c: 0 },
    { x: 8, y: 48, w: 48, c: 4 },
    { x: 60, y: 48, w: 20, c: 5 },
    { x: 84, y: 48, w: 28, c: 3 },
  ];
  return (
    <g>
      {pills.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height="6" rx="2" fill={pillColors[p.c]} opacity="0.85" />
      ))}
    </g>
  );
}

function RecipeByPerson() {
  // Three labelled rows, one per person.
  const rows = [
    { y: 10, color: '#3b82f6', letter: 'S', pills: [{ x: 40, w: 30 }, { x: 74, w: 22 }] },
    { y: 30, color: '#ef4444', letter: 'M', pills: [{ x: 40, w: 48 }] },
    { y: 50, color: '#10b981', letter: 'A', pills: [{ x: 40, w: 22 }, { x: 66, w: 18 }, { x: 88, w: 26 }] },
  ];
  return (
    <g>
      {rows.map((r, i) => (
        <g key={i}>
          <circle cx="18" cy={r.y + 7} r="7" fill={r.color} />
          <text x="18" y={r.y + 10} textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="system-ui">{r.letter}</text>
          <line x1="32" y1={r.y + 7} x2="134" y2={r.y + 7} stroke="var(--wc-border, #cbd5e1)" />
          {r.pills.map((p, j) => (
            <rect key={j} x={p.x} y={r.y + 3} width={p.w} height="8" rx="2" fill={r.color} opacity="0.85" />
          ))}
        </g>
      ))}
    </g>
  );
}

function RecipeByType() {
  // Three labelled type stacks.
  const groups = [
    { y: 8,  label: 'Meetings',  color: '#3b82f6', count: 3 },
    { y: 28, label: 'On-call',   color: '#ef4444', count: 2 },
    { y: 48, label: 'Time off',  color: '#10b981', count: 4 },
  ];
  return (
    <g>
      {groups.map((g, i) => (
        <g key={i}>
          <rect x="6" y={g.y} width="50" height="14" rx="3" fill={g.color} opacity="0.18" />
          <text x="10" y={g.y + 10} fontSize="8" fontWeight="700" fill={g.color} fontFamily="system-ui">{g.label}</text>
          {Array.from({ length: g.count }).map((_, j) => (
            <rect key={j} x={62 + j * 18} y={g.y + 3} width="14" height="8" rx="2" fill={g.color} opacity="0.85" />
          ))}
        </g>
      ))}
    </g>
  );
}

function RecipeOnCall() {
  // Only red (on-call) pills survive; others are faded out as "hidden".
  return (
    <g>
      <rect x="8"  y="12" width="40" height="6" rx="2" fill="#94a3b8" opacity="0.25" />
      <rect x="52" y="12" width="26" height="6" rx="2" fill="#ef4444" />
      <rect x="82" y="12" width="30" height="6" rx="2" fill="#94a3b8" opacity="0.25" />
      <rect x="8"  y="26" width="46" height="6" rx="2" fill="#ef4444" />
      <rect x="58" y="26" width="26" height="6" rx="2" fill="#94a3b8" opacity="0.25" />
      <rect x="8"  y="40" width="30" height="6" rx="2" fill="#94a3b8" opacity="0.25" />
      <rect x="42" y="40" width="34" height="6" rx="2" fill="#ef4444" />
      <rect x="8"  y="54" width="56" height="6" rx="2" fill="#ef4444" />
      <text x="122" y="32" fontSize="8" fontWeight="700" fill="#ef4444" fontFamily="system-ui" textAnchor="end">only red</text>
    </g>
  );
}

function RecipeThisWeek() {
  // Seven-day strip highlighting this week.
  const days = [] as JSX.Element[];
  for (let i = 0; i < 7; i++) {
    const x = 6 + i * 18.5;
    const highlighted = i >= 2 && i <= 4;
    days.push(
      <g key={i}>
        <rect x={x} y="14" width="18" height="44" rx="2" fill={highlighted ? 'var(--wc-accent, #3b82f6)' : 'var(--wc-border, #cbd5e1)'} opacity={highlighted ? 0.2 : 0.3} />
        {highlighted && (
          <>
            <rect x={x + 2} y="22" width="14" height="4" rx="1" fill="var(--wc-accent, #3b82f6)" />
            <rect x={x + 2} y="30" width="12" height="4" rx="1" fill="var(--wc-accent, #3b82f6)" opacity="0.7" />
          </>
        )}
      </g>,
    );
  }
  return (
    <g>
      {days}
      <text x="70" y="10" fontSize="8" fontWeight="700" fill="var(--wc-text, #0f172a)" fontFamily="system-ui" textAnchor="middle">this week</text>
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Shared                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

const svgStyle: CSSProperties = {
  width: '100%',
  height: 'auto',
  display: 'block',
  borderRadius: 6,
};
