import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const STRICT_NULL_ERROR_CODES = new Set([
  'TS18047',
  'TS18048',
  'TS2322',
  'TS2323',
  'TS2326',
  'TS2327',
  'TS2339',
  'TS2345',
  'TS2531',
  'TS2532',
  'TS2533',
  'TS2722',
]);

const MIGRATED_PATHS = [
  'src/grouping/groupRows.ts',
  'src/grouping/__tests__/groupRows.test.ts',
  'src/hooks/useFocusTrap.ts',
  'src/hooks/__tests__/useFocusTrap.test.tsx',
  'src/__tests__/WorksCalendar.employees.sync.test.tsx',
  'src/__tests__/WorksCalendar.recurringScopedEdit.test.tsx',
  'src/__tests__/groupingFilteringSorting.integration.test.ts',
  'src/__tests__/phaseB.integration.test.tsx',
  'src/api/v1/__tests__/sync.test.ts',
  'src/views/TimelineView.tsx',
  'src/api/v1/adapters/SupabaseAdapter.ts',
  'src/core/scheduleOverlap.ts',
  'src/core/__tests__/scheduleMutations.test.ts',
  'src/filters/__tests__/filterEngine.test.ts',
  'src/filters/__tests__/filterState.test.ts',
  'src/hooks/__tests__/useBookingHold.test.tsx',
  'src/hooks/__tests__/useDrag.test.ts',
  'src/hooks/__tests__/useSavedViews.test.ts',
];

const BASELINE_PATH = path.resolve(process.cwd(), 'scripts/strict-null-baseline.json');

const tscBin = path.resolve(process.cwd(), 'node_modules/typescript/bin/tsc');

if (!fs.existsSync(tscBin)) {
  console.error('❌ Local TypeScript compiler not found. Run npm install before strict-null checking.');
  process.exit(1);
}

const tscResult = spawnSync(
  process.execPath,
  [tscBin, '--noEmit', '--pretty', 'false', '--strictNullChecks', 'true'],
  { encoding: 'utf8' },
);

if (tscResult.error) {
  console.error(`❌ Failed to run TypeScript compiler: ${tscResult.error.message}`);
  process.exit(1);
}

const output = `${tscResult.stdout ?? ''}${tscResult.stderr ?? ''}`;
const repoRoot = process.cwd();

const diagnostics = output
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
    if (!match) return null;
    const [, filePath, lineNumber, columnNumber, code, message] = match;
    return {
      filePath: path.resolve(repoRoot, filePath),
      lineNumber: Number(lineNumber),
      columnNumber: Number(columnNumber),
      code,
      message,
      raw: line,
    };
  })
  .filter((entry) => entry !== null);

if (tscResult.status !== 0 && diagnostics.length === 0) {
  console.error('❌ TypeScript compiler failed without parseable diagnostics.');
  if (output.trim()) {
    console.error(output.trim());
  }
  process.exit(1);
}

// === GLOBAL COUNTER RATchet ===
const strictNullDiagnostics = diagnostics.filter((entry) =>
  STRICT_NULL_ERROR_CODES.has(entry.code),
);

let baselineTotal = null;

if (fs.existsSync(BASELINE_PATH)) {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  baselineTotal = baseline.baselineTotal;
}

console.log(`📊 strict-null diagnostics (total): ${strictNullDiagnostics.length}`);

if (baselineTotal !== null) {
  console.log(`📊 baseline: ${baselineTotal}`);

  if (strictNullDiagnostics.length > baselineTotal) {
    console.error('❌ strict-null regression detected (global counter exceeded baseline)');
    process.exit(1);
  }
}

// === MIGRATED PATH ENFORCEMENT ===
const migratedPathSet = new Set(MIGRATED_PATHS.map((filePath) => path.resolve(repoRoot, filePath)));

const strictNullFailures = strictNullDiagnostics.filter((entry) =>
  migratedPathSet.has(entry.filePath),
);

if (strictNullFailures.length > 0) {
  console.error('❌ Stage 7 strict-null ratchet failed in migrated paths.');
  for (const failure of strictNullFailures) {
    console.error(`- ${failure.raw}`);
  }
  process.exit(1);
}

console.log('✅ strict-null ratchet passed');
console.log(`Checked migrated paths: ${MIGRATED_PATHS.join(', ')}`);
