import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, 'storage-buckets-baseline.json');

export function loadBaseline() {
  const raw = readFileSync(BASELINE_PATH, 'utf-8');
  return JSON.parse(raw);
}

export function validateStorageBuckets(currentBuckets, baseline) {
  const failures = [];
  const baselineById = new Map(baseline.buckets.map((b) => [b.id, b]));
  const currentById = new Map(currentBuckets.map((b) => [b.id, b]));

  for (const bucket of currentBuckets) {
    const expected = baselineById.get(bucket.id);
    if (!expected) {
      failures.push(`bucket novo: ${bucket.id}`);
      continue;
    }
    if (bucket.public !== expected.public) {
      failures.push(`bucket virou ${bucket.public ? 'público' : 'privado'}: ${bucket.id}`);
    }
    const atual = bucket.file_size_limit ?? null;
    const esperado = expected.file_size_limit ?? null;
    if (atual !== esperado) {
      failures.push(
        `limite alterado em ${bucket.id}: esperado ${esperado}, atual ${atual}`
      );
    }
  }

  for (const expected of baseline.buckets) {
    if (!currentById.has(expected.id)) {
      failures.push(`bucket removido: ${expected.id}`);
    }
  }

  return { pass: failures.length === 0, failures };
}
