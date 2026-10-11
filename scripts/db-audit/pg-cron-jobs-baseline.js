import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, 'pg-cron-jobs-baseline.json');

export function loadBaseline() {
  const raw = readFileSync(BASELINE_PATH, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Compara o estado atual dos jobs do pg_cron (cron.job) contra o baseline
 * versionado. Reprova: job desconhecido, job removido, schedule alterado e
 * jobname duplicado na lista atual (o Map sozinho esconderia a duplicata).
 */
export function validatePgCronJobs(currentJobs, baseline) {
  const failures = [];
  const baselineByName = new Map(baseline.cron_jobs.map((j) => [j.jobname, j]));

  const currentByName = new Map();
  const seen = new Set();
  for (const job of currentJobs) {
    if (seen.has(job.jobname)) {
      failures.push(`jobname duplicado na lista atual: ${job.jobname}`);
      continue;
    }
    seen.add(job.jobname);
    currentByName.set(job.jobname, job);
  }

  for (const job of currentByName.values()) {
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

/**
 * Aceita um JSON vindo do `cron.job` (cron.job tem as colunas jobname e
 * schedule) no formato { cron_jobs: [...] } ou como array de { jobname,
 * schedule }. Usado pelo bloco CLI abaixo.
 */
export function readCurrentJobs(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const jobs = Array.isArray(parsed) ? parsed : parsed.cron_jobs;
  if (!Array.isArray(jobs)) {
    throw new Error('JSON sem campo cron_jobs[] nem array de jobs');
  }
  return jobs.map((j) => ({ jobname: j.jobname, schedule: j.schedule }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const baseline = loadBaseline();
    const current = readCurrentJobs(process.argv[2]);
    const result = validatePgCronJobs(current, baseline);
    if (!result.pass) {
      console.error(
        `pg-cron jobs baseline guard failed:\n  - ${result.failures.join('\n  - ')}`
      );
      process.exitCode = 1;
    } else {
      console.log(
        `pg-cron jobs baseline guard: ${current.length} jobs conferem com o baseline versionado.`
      );
    }
  } catch (error) {
    console.error(`pg-cron jobs baseline guard failed: ${error.message}`);
    process.exitCode = 1;
  }
}
