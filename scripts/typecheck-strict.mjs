#!/usr/bin/env node
/**
 * Runs `tsc` with `noImplicitAny: true` across the whole repo
 * (via tsconfig.strict.json) and fails only on diagnostics that
 * land in the migrated-paths allowlist below.
 *
 * This is the ratchet for the staged noImplicitAny migration described
 * in docs/TypeScriptStrictMigration.md. Grow MIGRATED_PATHS as each
 * stage lands. All paths are repo-relative, POSIX-style.
 *
 * Match semantics:
 * - A path ending in "/" matches any file under that directory.
 * - Any other path matches that exact file.
 */

import { spawnSync } from 'node:child_process';
import { sep } from 'node:path';

const MIGRATED_PATHS = [
  // Stage 1
  'src/types/',
  'src/index.ts',
  // Stage 2
  'src/external/',
  'src/export/',
  'src/core/',
  'src/grouping/',
  'src/filters/',
  // Stage 3 (Sprint 1)
  'src/api/',
  'src/hooks/useGroupingRows.ts',
  'src/hooks/__tests__/useGrouping.test.ts',
  // Stage 3 (Sprint 2)
  'src/hooks/useEventOptions.ts',
  'src/hooks/useFeedEvents.ts',
  'src/hooks/useFetchEvents.ts',
  'src/hooks/useKeyboardShortcuts.ts',
  'src/hooks/useOwnerConfig.ts',
  'src/hooks/useSourceAggregator.ts',
  'src/hooks/useTouchSwipe.ts',
  // Stage 3 (Sprint 3)
  'src/hooks/useDrag.ts',
  'src/hooks/useSavedViews.ts',
  'src/hooks/useSourceStore.ts',
  // Stage 3b
  'src/providers/',
  'src/hooks/useBookingHold.ts',
  'src/hooks/useConditionBuilder.ts',
  'src/hooks/useGrouping.ts',
  'src/hooks/useNormalizedConfig.ts',
  'src/hooks/useResourceLocations.ts',
  'src/hooks/useSavedWorkflows.ts',
  'src/hooks/useTabScopedEvents.ts',
  'src/hooks/useWorkflowTicker.ts',
  'src/hooks/useCalendar.ts',
  'src/hooks/useFeedStore.ts',
  'src/hooks/useSyncedCalendar.ts',
  'src/hooks/useEventDraftState.ts',
  'src/hooks/useRealtimeEvents.ts',
  'src/hooks/useOccurrences.ts',
  'src/hooks/useFocusTrap.ts',
  'src/hooks/useTouchDnd.ts',
  'src/hooks/usePermissions.ts',
  // Stage 4a PR2 / Stage 5 PR6
  'src/ui/ConfigPanel.tsx',
  // Stage 5 PR7
  'src/views/DayView.tsx',
  'src/views/AgendaView.tsx',
  'src/views/MonthView.tsx',
  // Stage 5 PR8
  'src/views/WeekView.tsx',
  'src/views/AssetsView.tsx',
  'src/views/BaseGanttView.tsx',
  // Stage 5 PR9
  'src/views/TimelineView.tsx',
  // Stage 5 PR10
  'src/WorksCalendar.tsx',
  // Stage 5 PR12
  'demo/',
  // Stage 5b PR1
  'src/hooks/__tests__/useSavedViews.test.ts',
  'src/hooks/__tests__/useSourceStore.test.ts',
];

// Implicit-any diagnostic codes. See:
// https://github.com/microsoft/TypeScript/blob/main/src/compiler/diagnosticMessages.json
const IMPLICIT_ANY_CODES = new Set([
  'TS7005', // Variable implicitly has an 'any' type.
  'TS7006', // Parameter implicitly has an 'any' type.
  'TS7011', // Function expression, which lacks return-type annotation, implicitly has an 'any' return type.
  'TS7018', // Object literal's property implicitly has an 'any' type.
  'TS7023', // Implicitly has return type 'any'.
  'TS7031', // Binding element implicitly has an 'any' type.
  'TS7034', // Variable implicitly has type 'any' in some locations.
  'TS7053', // Element implicitly has an 'any' type because expression of type can't be used to index type.
]);

const isMigrated = (file) => {
  const normalized = file.split(sep).join('/');
  return MIGRATED_PATHS.some((p) =>
    p.endsWith('/')
      ? (() => {
          const directory = p.slice(0, -1);
          return normalized === directory || normalized.startsWith(`${directory}/`);
        })()
      : normalized === p,
  );
};

const tscResult = spawnSync(
  'npx',
  ['tsc', '--noEmit', '--pretty', 'false', '-p', 'tsconfig.strict.json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
);

if (tscResult.error) {
  console.error('Failed to invoke tsc:', tscResult.error.message);
  process.exit(2);
}

const output = `${tscResult.stdout ?? ''}${tscResult.stderr ?? ''}`;
const diagRegex = /^([^(]+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/;

const offending = [];
for (const line of output.split('\n')) {
  const match = line.match(diagRegex);
  if (!match) continue;
  const [, file, , , code] = match;
  if (!IMPLICIT_ANY_CODES.has(code)) continue;
  if (isMigrated(file)) offending.push(line);
}

if (offending.length > 0) {
  console.error('Strict type check FAILED — implicit-any errors in migrated paths:');
  console.error('');
  for (const line of offending) console.error(line);
  console.error('');
  console.error(`Total: ${offending.length} error(s).`);
  console.error('See docs/TypeScriptStrictMigration.md for the migration plan.');
  process.exit(1);
}

console.log('Strict type check GREEN.');
console.log(`Migrated paths (${MIGRATED_PATHS.length}):`);
for (const p of MIGRATED_PATHS) console.log(`  - ${p}`);
process.exit(0);
