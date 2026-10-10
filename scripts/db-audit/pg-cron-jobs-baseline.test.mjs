import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePgCronJobs, loadBaseline } from './pg-cron-jobs-baseline.js';

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