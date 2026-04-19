/**
 * Grouping perf benchmark
 *
 * Measures groupRows() + buildFieldAccessor() cost across realistic dataset
 * sizes (500 / 1000 / 2000 events) and nesting depths (1 / 2 / 3 levels).
 *
 * Target: <100ms grouping pass at 1000 events × 3 levels — the budget that
 * keeps render work below the 16ms-per-frame ceiling at interactive rates.
 *
 * Writes a baseline snapshot to docs/perf-baselines.json.  Future runs can
 * diff against it to catch regressions.
 *
 * Usage:
 *   node scripts/perf-benchmark.mjs
 *   node scripts/perf-benchmark.mjs --write        # update baseline
 */
import { groupRows }          from '../src/grouping/groupRows.js';
import { buildFieldAccessor } from '../src/grouping/buildFieldAccessor.js';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve }   from 'node:path';
import { fileURLToPath }      from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(__dirname, '../docs/perf-baselines.json');

// ── Fixture generator ────────────────────────────────────────────────────────
const ROLES     = ['Nurse', 'Doctor', 'Tech', 'Admin'];
const SHIFTS    = ['Day', 'Night', 'Swing'];
const LOCATIONS = ['ICU', 'ER', 'OR', 'Clinic', 'Float'];

function makeRows(count) {
  const rows = new Array(count);
  for (let i = 0; i < count; i++) {
    const event = {
      id:       `evt-${i}`,
      title:    `Shift ${i}`,
      role:     ROLES[i % ROLES.length],
      shift:    SHIFTS[i % SHIFTS.length],
      location: LOCATIONS[i % LOCATIONS.length],
      priority: (i % 4) + 1,
      meta:     {},
    };
    rows[i] = { emp: null, events: [event] };
  }
  return rows;
}

// ── Timer ────────────────────────────────────────────────────────────────────
function bench(label, runs, fn) {
  // Warm-up — JIT + cache population.
  for (let i = 0; i < 3; i++) fn();

  const samples = new Array(runs);
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples[i] = performance.now() - t0;
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(runs * 0.50)];
  const p95 = samples[Math.floor(runs * 0.95)];
  const min = samples[0];
  const max = samples[runs - 1];
  return { label, runs, min, p50, p95, max };
}

// ── Scenarios ────────────────────────────────────────────────────────────────
const SIZES = [500, 1000, 2000];
const DEPTHS = [
  { label: '1-level', fields: ['role'] },
  { label: '2-level', fields: ['role', 'shift'] },
  { label: '3-level', fields: ['role', 'shift', 'location'] },
];

function runBenchmark() {
  const results = [];
  for (const size of SIZES) {
    const rows = makeRows(size);
    for (const depth of DEPTHS) {
      const accessor = buildFieldAccessor(depth.fields, 'resource');
      const res = bench(
        `groupRows · ${size}ev · ${depth.label}`,
        50,
        () => groupRows(rows, {
          groupBy:       true,
          fieldAccessor: accessor,
        }),
      );
      results.push({ size, depth: depth.label, ...res });
    }
  }
  return results;
}

// ── Budget check ─────────────────────────────────────────────────────────────
const TARGET_MS = 100; // p95 budget at 1000ev × 3-level

function report(results) {
  console.log('\nGrouping perf benchmark');
  console.log('─'.repeat(72));
  console.log(
    'size'.padEnd(6),
    'depth'.padEnd(10),
    'runs'.padEnd(6),
    'min'.padStart(8),
    'p50'.padStart(8),
    'p95'.padStart(8),
    'max'.padStart(8),
  );
  console.log('─'.repeat(72));
  for (const r of results) {
    console.log(
      String(r.size).padEnd(6),
      r.depth.padEnd(10),
      String(r.runs).padEnd(6),
      `${r.min.toFixed(2)}ms`.padStart(8),
      `${r.p50.toFixed(2)}ms`.padStart(8),
      `${r.p95.toFixed(2)}ms`.padStart(8),
      `${r.max.toFixed(2)}ms`.padStart(8),
    );
  }

  const bellwether = results.find(r => r.size === 1000 && r.depth === '3-level');
  if (bellwether) {
    console.log('─'.repeat(72));
    const pass = bellwether.p95 < TARGET_MS;
    console.log(
      `${pass ? 'PASS' : 'FAIL'}  1000ev · 3-level · p95 = ${bellwether.p95.toFixed(2)}ms ` +
      `(budget < ${TARGET_MS}ms)`,
    );
    if (!pass) process.exitCode = 1;
  }
}

function diffAgainstBaseline(current) {
  if (!existsSync(BASELINE_PATH)) return;
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  if (!Array.isArray(baseline.results)) return;
  console.log('\nDelta vs. baseline (p95):');
  for (const r of current) {
    const prior = baseline.results.find(b => b.size === r.size && b.depth === r.depth);
    if (!prior) continue;
    const delta = r.p95 - prior.p95;
    const pct   = (delta / prior.p95) * 100;
    const sign  = delta >= 0 ? '+' : '';
    console.log(
      `  ${r.size}ev · ${r.depth.padEnd(8)} ${sign}${delta.toFixed(2)}ms (${sign}${pct.toFixed(1)}%)`,
    );
  }
}

// ── Entry ────────────────────────────────────────────────────────────────────
const write = process.argv.includes('--write');
const results = runBenchmark();
report(results);
diffAgainstBaseline(results);

if (write) {
  const payload = {
    generatedAt: new Date().toISOString(),
    node:        process.version,
    targetMs:    TARGET_MS,
    results,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nBaseline written → ${BASELINE_PATH}`);
}
