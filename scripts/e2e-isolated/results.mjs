import { createHash } from 'node:crypto';

// Schema: Playwright v1.64.1 packages/playwright/src/reporters/json.ts.
// Counts describe test cases, not retry attempts or nested steps. Public output
// deliberately excludes titles, error bodies, stdout, attachments and config.
const OUTCOMES = new Set(['expected', 'unexpected', 'flaky', 'skipped']);
const STATUSES = new Set(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
const EXPECTED = new Set(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
const fail = code => { throw new Error('PLAYWRIGHT_REPORT_' + code); };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const string = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Fixed exception for one reviewed test, never a caller-supplied allowlist.
// Reporter v1.64.1 makes file/title relative to rootDir (the isolated testDir).
// The native inventory supplies the column; the complete identity must match.
const CONVERSATION_SKIP = Object.freeze({
  sourceFile: 'e2e/conversation.spec.ts',
  sourceBlob: 'e205dc3a6eea158c5b00b592dfb7aa467ef46f98',
  reportFile: 'conversation.spec.ts', line: 59,
  titlePath: ['conversation.spec.ts', 'Conversation state transitions'],
  title: 'resolving conversation via CloseConversationDialog succeeds',
  reason: "CloseConversationDialog coberto em Chromium; Radix Select portal nao responde a getByRole('option') de forma confiavel em Firefox/WebKit no CI",
  projects: ['firefox-conversation', 'webkit-conversation'],
  chromium: 'chromium-e2e-core',
});

function conversationSkipContract(proof, inventory, scope) {
  if (scope !== 'authenticated-suite') fail('PLATFORM_SKIP_SCOPE');
  if (!record(proof) || JSON.stringify(Object.keys(proof).sort()) !== JSON.stringify(['sourceBlobs', 'sourceSha']) ||
      typeof proof.sourceSha !== 'string' || !/^[0-9a-f]{40}$/.test(proof.sourceSha) || /^0{40}$/.test(proof.sourceSha) ||
      !record(proof.sourceBlobs) || Object.keys(proof.sourceBlobs).length !== 1 ||
      proof.sourceBlobs[CONVERSATION_SKIP.sourceFile] !== CONVERSATION_SKIP.sourceBlob) fail('PLATFORM_SKIP_SOURCE');
  const keys = new Map();
  for (const project of [...CONVERSATION_SKIP.projects, CONVERSATION_SKIP.chromium]) {
    const matches = inventory.cases.filter(item => item.project === project && item.location?.file === CONVERSATION_SKIP.reportFile && item.location?.line === CONVERSATION_SKIP.line);
    if (matches.length !== 1) fail('PLATFORM_SKIP_INVENTORY');
    const item = matches[0];
    if (!integer(item.location.column) || item.location.column === 0 || item.expectedStatus !== 'passed' || !Array.isArray(item.annotationTypes) ||
        item.annotationTypes.some(type => !string(type) || ['skip', 'fixme', 'fail'].includes(type))) fail('PLATFORM_SKIP_INVENTORY');
    const key = createHash('sha256').update(JSON.stringify([project, CONVERSATION_SKIP.reportFile, CONVERSATION_SKIP.line, item.location.column, CONVERSATION_SKIP.titlePath, CONVERSATION_SKIP.title])).digest('hex');
    if (item.key !== key) fail('PLATFORM_SKIP_IDENTITY');
    keys.set(project, key);
  }
  return { keys: new Set(CONVERSATION_SKIP.projects.map(project => keys.get(project))), allKeys: new Set(keys.values()), chromiumKey: keys.get(CONVERSATION_SKIP.chromium),
    metadata: { sourceSha: proof.sourceSha, file: CONVERSATION_SKIP.sourceFile, gitBlob: CONVERSATION_SKIP.sourceBlob } };
}

function matchingPlatformAnnotations(testAnnotations, resultAnnotations, skipped) {
  const pairs = annotations => {
    if (!Array.isArray(annotations) || annotations.some(annotation => !record(annotation) || !string(annotation.type) ||
        (annotation.description !== undefined && (typeof annotation.description !== 'string' || annotation.description.length > 4096)))) return null;
    if (annotations.some(annotation => ['fixme', 'fail'].includes(annotation.type))) return null;
    const skips = annotations.filter(annotation => annotation.type === 'skip');
    if (skipped ? skips.length !== 1 || skips[0].description !== CONVERSATION_SKIP.reason : skips.length !== 0) return null;
    return annotations.map(annotation => JSON.stringify([annotation.type, annotation.description ?? null])).sort();
  };
  const left = pairs(testAnnotations), right = pairs(resultAnnotations);
  return left !== null && right !== null && JSON.stringify(left) === JSON.stringify(right);
}

function knownConversationSkip(item) {
  if (item.expectedStatus !== 'skipped' || item.status !== 'skipped' || item.results.length !== 1) return false;
  const result = item.results[0];
  return result.status === 'skipped' && result.workerIndex >= 0 && result.retry === 0 && result.errors.length === 0 && result.error === undefined &&
    matchingPlatformAnnotations(item.annotations, result.annotations, true);
}

function projectList(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some(value => !string(value)) || new Set(values).size !== values.length) fail('INVALID_PROJECTS');
  return [...values].sort();
}

function readReport(json) {
  if (!record(json) || !record(json.config) || !Array.isArray(json.config.projects) || !Array.isArray(json.suites) || !Array.isArray(json.errors)) fail('INVALID_SHAPE');
  const configured = projectList(json.config.projects.map(project => project?.name));
  const known = new Set(configured);
  for (const project of json.config.projects) {
    if (project.repeatEach !== undefined && project.repeatEach !== 1) fail('REPEAT_EACH_UNSUPPORTED');
  }
  const cases = [];
  const keys = new Set();
  const walk = (suites, parents = [], depth = 0) => {
    if (!Array.isArray(suites) || depth > 32) fail('INVALID_SUITES');
    for (const suite of suites) {
      if (!record(suite) || !string(suite.title)) fail('INVALID_SUITE');
      const titlePath = [...parents, suite.title];
      if (suite.specs !== undefined && !Array.isArray(suite.specs)) fail('INVALID_SPECS');
      for (const spec of suite.specs || []) {
        if (!record(spec) || !string(spec.title) || !string(spec.file) || !integer(spec.line) || spec.line === 0 || !integer(spec.column) || !Array.isArray(spec.tests) || spec.tests.length === 0) fail('INVALID_SPEC');
        for (const item of spec.tests) {
          if (!record(item) || !known.has(item.projectName) || !EXPECTED.has(item.expectedStatus) || !OUTCOMES.has(item.status) || !Array.isArray(item.results) || !Array.isArray(item.annotations)) fail('INVALID_TEST');
          const key = createHash('sha256').update(JSON.stringify([item.projectName, spec.file, spec.line, spec.column, titlePath, spec.title])).digest('hex');
          if (keys.has(key)) fail('DUPLICATE_CASE');
          keys.add(key);
          for (const [attempt, result] of item.results.entries()) {
            if (!record(result) || !STATUSES.has(result.status) || !Number.isSafeInteger(result.workerIndex) || result.workerIndex < -1 || !integer(result.retry) || !Array.isArray(result.errors)) fail('INVALID_RESULT');
            if (result.retry !== attempt) fail('INVALID_RETRY_SEQUENCE');
          }
          cases.push({
            key, project: item.projectName,
            location: { file: spec.file, line: spec.line, column: spec.column },
            expectedStatus: item.expectedStatus, status: item.status,
            annotationTypes: item.annotations.map(annotation => annotation?.type).filter(type => typeof type === 'string'),
            annotations: item.annotations,
            results: item.results,
          });
        }
      }
      if (suite.suites !== undefined) walk(suite.suites, titlePath, depth + 1);
    }
  };
  walk(json.suites);
  return { cases, configured, errors: json.errors.length };
}

function matchingProjects(cases, expected) {
  const actual = [...new Set(cases.map(item => item.project))].sort();
  if (expected && JSON.stringify(actual) !== JSON.stringify(projectList(expected))) fail('PROJECT_INVENTORY_MISMATCH');
  return actual;
}

/** Consume only the separate JSON emitted by `playwright test --list`. */
export function readPlaywrightInventory(json, { projects } = {}) {
  const report = readReport(json);
  if (report.errors) fail('INVENTORY_COLLECTION_ERRORS');
  if (!report.cases.length) fail('EMPTY_INVENTORY');
  if (report.cases.some(item => item.results.length !== 0)) fail('INVENTORY_CONTAINS_EXECUTIONS');
  const actualProjects = matchingProjects(report.cases, projects);
  return {
    schema: 1, kind: 'playwright-inventory', total: report.cases.length,
    projects: actualProjects,
    cases: report.cases.map(({ key, project, location, expectedStatus, annotationTypes }) => ({ key, project, location, expectedStatus, annotationTypes })),
  };
}

const emptyCounts = () => ({
  total: 0, collected: 0, executed: 0, passed: 0, expected_failure: 0,
  unexpected_pass: 0, failed: 0, flaky: 0, skipped_explicit: 0,
  skipped_runtime: 0, not_run: 0, missing_from_report: 0,
  extra_reported: 0, collection_errors: 0,
});

function publicCase(item, outcome) {
  return { key: item.key, project: item.project, location: item.location, outcome };
}

/**
 * ok preserves predeclared skips/expected failures, but never counts them as
 * passes. allPassed additionally requires every listed case to have passed.
 * Newly skipped tests, absent results, flaky retries and collection errors fail.
 * The opt-in authenticated-suite contract classifies only the two pinned
 * platform skips; every other skip fails. Known skips never make allPassed true.
 */
export function summarizePlaywrightResult(json, { scope = 'unknown', expectedProjects, inventory, conversationPlatformSkips } = {}) {
  const summary = { schema: 1, scope: /^[a-z0-9_-]{1,64}$/.test(scope) ? scope : 'invalid', ok: false, allPassed: false, inventoryVerified: false, counts: emptyCounts(), projects: [], reasons: [], cases: [] };
  if (conversationPlatformSkips !== undefined) summary.counts.known_runtime_skip = 0;
  const reason = code => { if (!summary.reasons.includes(code)) summary.reasons.push(code); };
  try {
    if (summary.scope === 'invalid') fail('INVALID_SCOPE');
    if (!record(inventory) || inventory.schema !== 1 || inventory.kind !== 'playwright-inventory' || !Array.isArray(inventory.cases) || inventory.cases.length === 0 || inventory.total !== inventory.cases.length) fail('MISSING_OR_INVALID_INVENTORY');
    const expected = new Map(inventory.cases.map(item => [item.key, item]));
    if (expected.size !== inventory.cases.length) fail('DUPLICATE_INVENTORY_CASE');
    const projects = matchingProjects(inventory.cases, expectedProjects || inventory.projects);
    summary.projects = projects;
    summary.counts.total = expected.size;
    const report = readReport(json);
    const platform = conversationPlatformSkips === undefined ? null : conversationSkipContract(conversationPlatformSkips, inventory, scope);
    if (platform) summary.runtimeSkipContract = platform.metadata;
    summary.inventoryVerified = true;
    summary.counts.collected = report.cases.length;
    summary.counts.collection_errors = report.errors;
    if (report.errors) reason('collection_errors');
    if (!record(json.stats)) fail('MISSING_STATS');
    const actualStats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
    const seen = new Set();
    for (const item of report.cases) {
      actualStats[item.status] += 1;
      const baseline = expected.get(item.key);
      if (!baseline) {
        summary.counts.extra_reported += 1;
        summary.cases.push(publicCase(item, 'extra_reported'));
        reason('extra_reported');
        continue;
      }
      seen.add(item.key);
      const executed = item.results.some(result => result.workerIndex >= 0 && result.status !== 'skipped');
      if (executed) summary.counts.executed += 1;
      const last = item.results.at(-1);
      const finalStatus = last?.status;
      let outcome;
      if (item.results.length === 0 || (item.results.every(result => result.status === 'skipped') && item.results.every(result => result.workerIndex === -1) && baseline.expectedStatus !== 'skipped')) {
        outcome = 'not_run';
      } else if (item.status === 'flaky') {
        outcome = 'flaky';
      } else if (finalStatus === 'skipped') {
        outcome = baseline.expectedStatus === 'skipped' && item.expectedStatus === 'skipped' ? 'skipped_explicit' : 'skipped_runtime';
      } else if (finalStatus === 'passed' && baseline.expectedStatus !== 'passed') {
        outcome = 'unexpected_pass';
      } else if (finalStatus === 'passed' && item.expectedStatus === 'passed' && item.status === 'expected' && last.workerIndex >= 0) {
        outcome = 'passed';
      } else if (['failed', 'timedOut'].includes(finalStatus) && baseline.expectedStatus === finalStatus && item.expectedStatus === finalStatus && item.status === 'expected' && last.workerIndex >= 0) {
        outcome = 'expected_failure';
      } else {
        outcome = 'failed';
      }
      if (outcome === 'passed' && item.results.some(result => result.status !== 'passed' || result.errors.length > 0 || result.error)) {
        outcome = 'failed';
        reason('inconsistent_pass');
      }
      if (item.status === 'expected' && item.results.length > 1) {
        outcome = 'failed';
        reason('inconsistent_attempt_count');
      }
      if (outcome === 'skipped_explicit' && (item.status !== 'skipped' || item.results.some(result => result.status !== 'skipped'))) {
        outcome = 'failed';
        reason('inconsistent_skip');
      }
      if (platform && platform.keys.has(item.key) && outcome === 'skipped_runtime' && knownConversationSkip(item)) outcome = 'known_runtime_skip';
      if (platform && platform.allKeys.has(item.key) && outcome === 'passed' && !matchingPlatformAnnotations(item.annotations, last.annotations, false)) {
        outcome = 'failed';
        reason('inconsistent_platform_annotations');
      }
      if (platform && outcome === 'skipped_explicit') reason('unreviewed_skip');
      summary.counts[outcome] += 1;
      summary.cases.push(publicCase(item, outcome));
      if (!['passed', 'skipped_explicit', 'expected_failure', 'known_runtime_skip'].includes(outcome)) reason(outcome);
    }
    for (const [key, item] of expected) {
      if (seen.has(key)) continue;
      summary.counts.missing_from_report += 1;
      summary.cases.push(publicCase(item, 'missing_from_report'));
      reason('missing_from_report');
    }
    for (const name of Object.keys(actualStats)) {
      if (!integer(json.stats[name]) || json.stats[name] !== actualStats[name]) reason('stats_mismatch');
    }
    if (platform && summary.counts.known_runtime_skip > 0 && !summary.cases.some(item => item.key === platform.chromiumKey && item.outcome === 'passed')) reason('platform_skip_without_chromium_pass');
    if (summary.counts.total !== summary.counts.passed + summary.counts.expected_failure + summary.counts.unexpected_pass + summary.counts.failed + summary.counts.flaky + summary.counts.skipped_explicit + summary.counts.skipped_runtime + summary.counts.not_run + summary.counts.missing_from_report + (summary.counts.known_runtime_skip || 0)) reason('case_count_mismatch');
    summary.ok = summary.reasons.length === 0;
    summary.allPassed = summary.ok && summary.counts.passed === summary.counts.total;
  } catch (error) {
    summary.counts.collection_errors += 1;
    reason(/^PLAYWRIGHT_REPORT_[A-Z_]+$/.test(error?.message) ? error.message : 'PLAYWRIGHT_REPORT_INVALID_DATA');
  }
  return summary;
}
