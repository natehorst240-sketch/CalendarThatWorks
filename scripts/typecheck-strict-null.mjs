import { spawnSync } from 'node:child_process';
import path from 'node:path';

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
];

const tscResult = spawnSync(
  'npx',
  ['tsc', '--noEmit', '--pretty', 'false', '--strictNullChecks', 'true'],
  { encoding: 'utf8' },
);

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

const migratedPathSet = new Set(MIGRATED_PATHS.map((filePath) => path.resolve(repoRoot, filePath)));
const strictNullFailures = diagnostics.filter((entry) =>
  STRICT_NULL_ERROR_CODES.has(entry.code)
  && migratedPathSet.has(entry.filePath),
);

if (strictNullFailures.length > 0) {
  console.error('❌ Stage 7 strict-null ratchet failed in migrated paths.');
  for (const failure of strictNullFailures) {
    console.error(`- ${failure.raw}`);
  }
  process.exit(1);
}

console.log('✅ Stage 7 strict-null ratchet passed for migrated paths.');
console.log(`Checked migrated paths: ${MIGRATED_PATHS.join(', ')}`);
