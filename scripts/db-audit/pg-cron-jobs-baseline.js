import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, 'pg-cron-jobs-baseline.json');

export function loadBaseline() {
  const raw = readFileSync(BASELINE_PATH, 'utf-8');
  return JSON.parse(raw);
}

export function validatePgCronJobs(currentJobs, baseline) {
  const failures = [];
  const baselineByName = new Map(baseline.cron_jobs.map((j) => [j.jobname, j]));
  const currentByName = new Map(currentJobs.map((j) => [j.jobname, j]));

  for (const job of currentJobs) {
    const expected = baselineByName.get(job.jobname);
    if (!expected) {
      failures.push(`job novo: ${job.jobname}`);
      continue;
    }
    if (job.schedule !== expected.schedule) {
      failures.push(
        `schedule alterado em ${job.jobname}: esperado ${expected.schedule}, atual ${job.schedule}`
      );
    }
  }

  for (const expected of baseline.cron_jobs) {
    if (!currentByName.has(expected.jobname)) {
      failures.push(`job removido: ${expected.jobname}`);
    }
  }

  return { pass: failures.length === 0, failures };
}