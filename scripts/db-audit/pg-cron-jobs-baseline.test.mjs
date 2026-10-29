import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { validatePgCronJobs, loadBaseline } from './pg-cron-jobs-baseline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = loadBaseline();

function makeJob(jobname, schedule) {
  return { jobname, schedule };
}

function currentFromBaseline() {
  return baseline.cron_jobs.map((j) => ({ jobname: j.jobname, schedule: j.schedule }));
}

test('validatePgCronJobs: aprova quando tudo confere', () => {
  const result = validatePgCronJobs(currentFromBaseline(), baseline);
  assert.equal(result.pass, true);
  assert.equal(result.failures.length, 0);
});

test('validatePgCronJobs: reprova job novo', () => {
  const current = [...currentFromBaseline()];
  current.push(makeJob('job-novo', '* * * * *'));
  const result = validatePgCronJobs(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('job novo')));
});

test('validatePgCronJobs: reprova job removido', () => {
  const current = currentFromBaseline().filter((j) => j.jobname !== 'talkx-scheduler-1min');
  const result = validatePgCronJobs(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('job removido')));
});

test('validatePgCronJobs: reprova schedule alterado', () => {
  const current = baseline.cron_jobs.map((j) => ({
    jobname: j.jobname,
    schedule: j.jobname === 'talkx-scheduler-1min' ? '*/2 * * * *' : j.schedule,
  }));
  const result = validatePgCronJobs(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('schedule alterado')));
});

test('validatePgCronJobs: reprova multiplos jobs alterados', () => {
  const current = baseline.cron_jobs.map((j) => ({
    jobname: j.jobname,
    schedule: j.jobname === 'talkx-scheduler-1min' ? '*/2 * * * *' : j.jobname === 'avatars-refresh' ? '0 * * * *' : j.schedule,
  }));
  const result = validatePgCronJobs(current, baseline);
  assert.equal(result.pass, false);
  assert.equal(result.failures.length, 2);
});

test('validatePgCronJobs: reprova job novo e removido ao mesmo tempo', () => {
  const current = currentFromBaseline()
    .filter((j) => j.jobname !== 'avatars-refresh')
    .concat([makeJob('job-novo', '* * * * *')]);
  const result = validatePgCronJobs(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('job removido')));
  assert.ok(result.failures.some((f) => f.includes('job novo')));
});

test('validatePgCronJobs: reprova schedule alterado combinado com job removido', () => {
  const current = currentFromBaseline()
    .filter((j) => j.jobname !== 'avatars-refresh')
    .map((j) => (j.jobname === 'talkx-scheduler-1min' ? { ...j, schedule: '*/2 * * * *' } : j));
  const result = validatePgCronJobs(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('schedule alterado')));
  assert.ok(result.failures.some((f) => f.includes('job removido')));
});

test('validatePgCronJobs: reprova schedule alterado combinado com job novo', () => {
  const current = currentFromBaseline()
    .concat([makeJob('job-novo', '* * * * *')])
    .map((j) => (j.jobname === 'cleanup-link-preview-cache' ? { ...j, schedule: '13 3 * * *' } : j));
  const result = validatePgCronJobs(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('schedule alterado')));
  assert.ok(result.failures.some((f) => f.includes('job novo')));
});

test('validatePgCronJobs: reprova jobname duplicado na lista atual', () => {
  const current = [...currentFromBaseline(), makeJob('avatars-refresh', '7 * * * *')];
  const result = validatePgCronJobs(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('duplicado')));
});

test('validatePgCronJobs: reprova duplicata com schedule diferente do baseline', () => {
  const current = [...currentFromBaseline(), makeJob('avatars-refresh', '0 * * * *')];
  const result = validatePgCronJobs(current, baseline);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('duplicado')));
});

function runCli(currentJobs) {
  const dir = mkdtempSync(join(tmpdir(), 'pgcron-baseline-'));
  const fixture = join(dir, 'current.json');
  writeFileSync(fixture, JSON.stringify({ cron_jobs: currentJobs }), 'utf-8');
  const script = join(__dirname, 'pg-cron-jobs-baseline.js');
  return spawnSync(process.execPath, [script, fixture], { encoding: 'utf-8' });
}

test('CLI: sai 0 quando o estado atual confere com o baseline', () => {
  const res = runCli(currentFromBaseline());
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /conferem com o baseline/);
});

test('CLI: sai 1 quando ha drift', () => {
  const current = currentFromBaseline().filter((j) => j.jobname !== 'avatars-refresh');
  const res = runCli(current);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /job removido/);
});
