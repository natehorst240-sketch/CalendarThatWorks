/**
 * AssetsDemoExample — Phase 1 Sprint 4 PR D performance + visual fixture.
 *
 * 20 aircraft × 200 events distributed across the current month. Exercises:
 *   - All 5 approval stages (requested / approved / finalized / pending_higher / denied)
 *   - Category hue via categoriesConfig (5 shipped categories)
 *   - Manual LocationProvider (host-free default reading meta.location)
 *   - Grouping by region (sticky asset column + collapse headers)
 *   - Zoom control round-trip (Day / Week / Month / Quarter)
 *   - Denied + pending_higher pills open the audit drawer
 *
 * Data is seeded from a mulberry32 PRNG so the fixture is visually stable
 * across reloads and reproducible for `npm run qa:visual`.
 */
import { useMemo, useState } from 'react';
import { WorksCalendar, createManualLocationProvider, DEFAULT_CATEGORIES } from '../src/index.js';

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260417);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

// ── Fixture constants ─────────────────────────────────────────────────────────
const REGIONS = ['West', 'Central', 'East'];
const AIRPORTS = ['KPHX', 'KLAX', 'KDEN', 'KBOS', 'KSEA', 'KORD', 'KJFK', 'KATL', 'KDFW', 'KMIA'];

const TAIL_NUMBERS = [
  'N121AB', 'N505CD', 'N88QR', 'N733XY', 'N901JT',
  'N245LM', 'N612RT', 'N847WK', 'N154BG', 'N398HV',
  'N476PN', 'N229DM', 'N581FY', 'N763CS', 'N042EL',
  'N818OU', 'N967RA', 'N335IV', 'N721ZT', 'N456QD',
];

const MODELS = [
  'Citation CJ3', 'Citation XLS', 'King Air 350', 'Phenom 300',
  'Challenger 350', 'Gulfstream G280', 'Pilatus PC-24',
];

const EVENT_TITLES = {
  training:    ['Recurrent training', 'Type rating', 'SIM session', 'CRM refresh'],
  pr:          ['VIP lift to KTEB', 'Charter: Aspen', 'Charter: Cabo', 'Dispatch ferry'],
  maintenance: ['A-check', 'Brake inspection', 'Avionics upgrade', 'Paint refresh'],
  coverage:    ['Coverage block', 'On-call standby', 'Crew rotation', 'Position flight'],
  other:       ['Insurance audit', 'Hangar move', 'Ground handling', 'Photo shoot'],
};

const CATEGORY_IDS = DEFAULT_CATEGORIES.map(c => c.id);

const STAGE_DISTRIBUTION = [
  // weighted: more approved/finalized than the exception states.
  ...Array(5).fill('approved'),
  ...Array(4).fill('finalized'),
  ...Array(3).fill('requested'),
  ...Array(2).fill('pending_higher'),
  ...Array(1).fill('denied'),
];

// ── Resource fixtures (20 aircraft) ───────────────────────────────────────────
const RESOURCES = TAIL_NUMBERS.map((tail, i) => ({
  id:    tail,
  name:  tail,
  group: REGIONS[i % REGIONS.length],
  meta: {
    model:    MODELS[i % MODELS.length],
    location: {
      text:   pick(AIRPORTS),
      status: rand() < 0.85 ? 'live' : 'stale',
      asOf:   new Date().toISOString(),
    },
  },
}));

// ── Event fixtures (~200 across the current month) ────────────────────────────
function buildEvents(monthAnchor) {
  const year  = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const out = [];

  for (let i = 0; i < 200; i++) {
    const resource    = pick(RESOURCES);
    const categoryId  = pick(CATEGORY_IDS);
    const title       = pick(EVENT_TITLES[categoryId] ?? EVENT_TITLES.other);
    const startDay    = randInt(1, daysInMonth);
    const durationDay = randInt(0, 3);
    const stage       = pick(STAGE_DISTRIBUTION);

    const start = new Date(year, month, startDay);
    const end   = new Date(year, month, Math.min(startDay + durationDay, daysInMonth));

    const history = [
      { action: 'submit',  at: new Date(start.getTime() - 7 * 86400e3).toISOString(), actor: 'dispatcher-1' },
    ];
    if (stage === 'approved' || stage === 'finalized') {
      history.push({ action: 'approve', at: new Date(start.getTime() - 5 * 86400e3).toISOString(), actor: 'ops-lead',     tier: 1 });
    }
    if (stage === 'finalized') {
      history.push({ action: 'finalize', at: new Date(start.getTime() - 4 * 86400e3).toISOString(), actor: 'chief-pilot', tier: 2 });
    }
    if (stage === 'pending_higher') {
      history.push({ action: 'approve',   at: new Date(start.getTime() - 5 * 86400e3).toISOString(), actor: 'ops-lead', tier: 1 });
      history.push({ action: 'downgrade', at: new Date(start.getTime() - 3 * 86400e3).toISOString(), actor: 'auditor',  tier: 2, reason: 'Split decision — needs chief pilot review.' });
    }
    if (stage === 'denied') {
      history.push({ action: 'deny', at: new Date(start.getTime() - 2 * 86400e3).toISOString(), actor: 'chief-pilot', tier: 2, reason: 'Conflicts with higher-priority dispatch.' });
    }

    out.push({
      id:       `ev-${i}`,
      title,
      start,
      end,
      resource: resource.id,
      category: categoryId,
      status:   stage === 'denied' ? 'cancelled' : 'confirmed',
      meta: {
        sublabel:      resource.meta.model,
        region:        resource.group,
        approvalStage: { stage, updatedAt: history[history.length - 1].at, history },
      },
    });
  }
  return out;
}

// ── Location provider wired to resource.meta.location ─────────────────────────
const locationProvider = createManualLocationProvider({
  resources: RESOURCES,
});

const CATEGORIES_CONFIG = {
  categories: DEFAULT_CATEGORIES,
  pillStyle:  'hue',
  defaultCategoryId: 'other',
};

// ── Component ─────────────────────────────────────────────────────────────────
export function AssetsDemoExample() {
  const [currentDate] = useState(() => new Date());
  const events = useMemo(() => buildEvents(currentDate), [currentDate]);

  return (
    <div style={{ height: '100%' }}>
      <WorksCalendar
        calendarId="assets-demo"
        initialView="assets"
        events={events}
        resources={RESOURCES}
        locationProvider={locationProvider}
        categoriesConfig={CATEGORIES_CONFIG}
        theme="soft"
      />
    </div>
  );
}
