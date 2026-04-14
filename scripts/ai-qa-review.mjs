/**
 * ai-qa-review.mjs
 *
 * Sends Playwright screenshots to a vision-capable LLM (Qwen2-VL via Ollama,
 * or DashScope) and writes a structured QA report to qa-output/visual-review.md
 *
 * Configuration (env vars, all optional):
 *
 *   OLLAMA_BASE_URL   Ollama OpenAI-compatible endpoint  (default: http://localhost:11434/v1)
 *   OLLAMA_MODEL      Vision model to use                (default: qwen2-vl:7b)
 *
 *   DASHSCOPE_API_KEY If set, routes to DashScope instead of Ollama
 *   DASHSCOPE_MODEL   DashScope model ID                 (default: qwen-vl-max)
 *
 *   OPENAI_BASE_URL   Generic override (LM Studio, etc.) – overrides Ollama base
 *   OPENAI_API_KEY    API key for generic override
 *   LM_STUDIO_MODEL   Model name for generic override    (default: local-model)
 *
 * Usage:
 *   node scripts/ai-qa-review.mjs
 *   npm run qa:review
 */
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// ── Paths ────────────────────────────────────────────────────────────────────

const SHOTS_DIR    = 'qa-output/screenshots';
const REPORT_PATH  = 'qa-output/playwright-report.json';
const OUTPUT_PATH  = 'qa-output/visual-review.md';
const BATCH_SIZE   = 5; // images per API request

// ── Client setup ─────────────────────────────────────────────────────────────

function buildClient() {
  // DashScope (Alibaba Cloud) — native Qwen-VL in the cloud
  if (process.env.DASHSCOPE_API_KEY) {
    return {
      client: new OpenAI({
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: process.env.DASHSCOPE_API_KEY,
      }),
      model: process.env.DASHSCOPE_MODEL || 'qwen-vl-max',
    };
  }

  // Generic override (LM Studio, hosted OpenAI-compatible)
  if (process.env.OPENAI_BASE_URL || process.env.LM_STUDIO_BASE_URL) {
    return {
      client: new OpenAI({
        baseURL: process.env.OPENAI_BASE_URL || process.env.LM_STUDIO_BASE_URL,
        apiKey: process.env.OPENAI_API_KEY || process.env.LM_STUDIO_API_KEY || 'lm-studio',
      }),
      model: process.env.LM_STUDIO_MODEL || 'local-model',
    };
  }

  // Default: Ollama local (qwen2-vl:7b)
  return {
    client: new OpenAI({
      baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
      apiKey: 'ollama', // Ollama doesn't validate the key, but the header is required
    }),
    model: process.env.OLLAMA_MODEL || 'qwen2-vl:7b',
  };
}

// ── Image helpers ─────────────────────────────────────────────────────────────

function imageToDataUrl(filePath) {
  const bytes = fs.readFileSync(filePath);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function buildImageContentPart(filePath) {
  return {
    type: 'image_url',
    image_url: { url: imageToDataUrl(filePath) },
  };
}

// ── Playwright report helpers ─────────────────────────────────────────────────

function loadTestResults() {
  if (!fs.existsSync(REPORT_PATH)) return [];
  try {
    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
    const out = [];

    function walkSuite(suite, prefix = '') {
      const suiteTitle = [prefix, suite.title].filter(Boolean).join(' > ');
      for (const spec of suite.specs || []) {
        const specTitle = [suiteTitle, spec.title].filter(Boolean).join(' > ');
        for (const t of spec.tests || []) {
          const results  = t.results || [];
          const statuses = results.map((r) => r.status).filter(Boolean);
          const errors   = results.flatMap((r) =>
            (r.errors || []).map((e) => e.message || JSON.stringify(e)),
          );
          out.push({
            title: specTitle,
            status: statuses.includes('failed')
              ? 'failed'
              : statuses.includes('timedOut')
                ? 'timedOut'
                : statuses.includes('passed')
                  ? 'passed'
                  : 'unknown',
            errors,
          });
        }
      }
      for (const child of suite.suites || []) walkSuite(child, suiteTitle);
    }

    for (const suite of report.suites || []) walkSuite(suite);
    return out;
  } catch {
    return [];
  }
}

// ── Prompt builders ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior frontend QA engineer specialising in calendar UIs.
You review screenshots of WorksCalendar — a Vite/React embeddable calendar component.
Be specific: describe exactly what you see, where it is on screen, and how severe it is.
Use the severity labels: [CRITICAL], [MAJOR], [MINOR], [COSMETIC].`;

function batchPrompt(shotNames, testResultsJson) {
  return `You are reviewing ${shotNames.length} screenshot(s) of WorksCalendar:
${shotNames.map((n, i) => `  Image ${i + 1}: ${n}`).join('\n')}

For each screenshot look for:
• Layout: overflow, clipping, misalignment, broken grid
• Pills/events: wrong width, missing, overlapping incorrectly, cross-week clip errors
• Toolbar/navigation: buttons invisible, misaligned, wrong active state
• Modals/popovers: off-screen, z-index bleed, missing close button
• Typography: truncation, overflow, illegible text
• Responsive: elements too small, touch targets under 44px, horizontal scroll on mobile
• Accessibility: missing focus rings, low contrast

${testResultsJson ? `Playwright test results (for cross-reference):\n${testResultsJson}\n` : ''}
Return a markdown list. Each item: severity label, screenshot name, short location, and clear description.
Example:
- [MAJOR] 02-week-desktop — toolbar overlaps time-gutter by ~8 px on the left edge`;
}

function summaryPrompt(allFindings) {
  return `You have reviewed all WorksCalendar screenshots. Here are all per-batch findings:

${allFindings}

Now write the final QA report with exactly these sections:

# WorksCalendar Visual QA Report

## Overall Status
(one sentence: Ready / Needs work / Broken)

## Critical Issues
(show-stoppers — list or "None")

## Major Issues
(significant but not blocking — list or "None")

## Minor / Cosmetic Issues
(polish items — list or "None")

## Likely Root Causes
(engineering diagnosis — CSS, state, layout engine, etc.)

## Recommended Next Fixes
(ordered by impact, actionable, reference file names where possible)

## Suggested Additional Tests
(gaps in the current screenshot set)

Be concise and practical.`;
}

// ── Core logic ────────────────────────────────────────────────────────────────

async function reviewBatch(client, model, shots, testResultsJson) {
  // Build the content array: [text prompt, image1, image2, ...]
  const shotNames = shots.map((s) => path.basename(s));
  const content   = [
    { type: 'text', text: batchPrompt(shotNames, testResultsJson) },
    ...shots.map(buildImageContentPart),
  ];

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content },
    ],
  });

  return response.choices?.[0]?.message?.content || '(no response)';
}

async function buildSummary(client, model, allFindings) {
  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: summaryPrompt(allFindings) },
    ],
  });
  return response.choices?.[0]?.message?.content || '(no response)';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { client, model } = buildClient();

  // Gather screenshots
  if (!fs.existsSync(SHOTS_DIR)) {
    console.error(`Screenshots directory not found: ${SHOTS_DIR}`);
    console.error('Run "npx playwright test visual-qa" first.');
    process.exit(1);
  }

  const shots = fs
    .readdirSync(SHOTS_DIR)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => path.join(SHOTS_DIR, f));

  if (shots.length === 0) {
    console.error(`No PNG screenshots found in ${SHOTS_DIR}`);
    process.exit(1);
  }

  console.log(`Found ${shots.length} screenshot(s). Using model: ${model}`);

  // Load Playwright results for context (optional — won't fail if missing)
  const testResults    = loadTestResults();
  const testResultsJson = testResults.length
    ? JSON.stringify(testResults, null, 2)
    : null;

  // Process in batches
  const batches    = [];
  for (let i = 0; i < shots.length; i += BATCH_SIZE) {
    batches.push(shots.slice(i, i + BATCH_SIZE));
  }

  const batchResults = [];
  for (let i = 0; i < batches.length; i++) {
    const batch     = batches[i];
    const batchNums = batch.map((s) => path.basename(s)).join(', ');
    console.log(`\nBatch ${i + 1}/${batches.length}: ${batchNums}`);
    try {
      const result = await reviewBatch(
        client, model, batch,
        // Only include test results in the first batch to save tokens
        i === 0 ? testResultsJson : null,
      );
      batchResults.push(`## Batch ${i + 1}: ${batchNums}\n\n${result}`);
      console.log(result);
    } catch (err) {
      const msg = `Error in batch ${i + 1}: ${err.message}`;
      batchResults.push(`## Batch ${i + 1}: ${batchNums}\n\n_${msg}_`);
      console.error(msg);
    }
  }

  // Build summary from all batch findings
  console.log('\nBuilding summary report...');
  let summary;
  try {
    summary = await buildSummary(client, model, batchResults.join('\n\n'));
  } catch (err) {
    summary = `# WorksCalendar Visual QA Report\n\n_Summary generation failed: ${err.message}_\n\n${batchResults.join('\n\n')}`;
  }

  // Write output
  fs.mkdirSync('qa-output', { recursive: true });
  const timestamp = new Date().toISOString();
  const output    = `<!-- Generated: ${timestamp} | Model: ${model} -->\n\n${summary}\n\n---\n\n# Raw Batch Findings\n\n${batchResults.join('\n\n')}`;
  fs.writeFileSync(OUTPUT_PATH, output, 'utf8');

  console.log(`\nReport written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
