import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

export function validReference(reference) {
  return typeof reference === 'string' &&
    /^[a-z0-9./_-]+:[A-Za-z0-9_.-]+(?:@sha256:[a-f0-9]{64})?$/.test(reference) &&
    !/:latest(?:@|$)/.test(reference);
}

const errorCode = error => /^(invalid-image-lock|invalid-image-reference|docker-[a-z]+-failed|nonlocal-docker-context|missing-or-ambiguous-image-digest)$/.test(error?.message)
  ? error.message : 'unexpected-image-metadata';

/** Read/pull image metadata only. This never creates a container, volume or credential. */
export function resolveImages(lock, command = spawnSync) {
  const images = lock?.images;
  if (!images || typeof images !== 'object' || Array.isArray(images) || Object.keys(images).length === 0) throw new Error('invalid-image-lock');
  for (const [name, reference] of Object.entries(images)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || !validReference(reference)) throw new Error('invalid-image-reference');
  }
  const clientConfig = mkdtempSync(join(tmpdir(), 'zapp-e2e-image-client-'));
  const resolved = {};
  const pending = [];
  let active = { operation: 'context' };
  const docker = (args, timeout = 60_000) => {
    const result = command('docker', ['--host', 'unix:///var/run/docker.sock', ...args], {
      env: { PATH: process.env.PATH, DOCKER_CONFIG: clientConfig },
      encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0 || result.error || result.signal) throw new Error('docker-' + args[0] + '-failed');
    return String(result.stdout || '').trim();
  };
  try {
    const context = JSON.parse(docker(['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']));
    if (context !== 'unix:///var/run/docker.sock') throw new Error('nonlocal-docker-context');
    for (const [name, reference] of Object.entries(images)) {
      if (/@sha256:[a-f0-9]{64}$/.test(reference)) {
        resolved[name] = { configured: reference, already_pinned: true, pulled_in_this_step: false };
        continue;
      }
      pending.push(name);
      active = { image: name, reference, operation: 'pull' };
      docker(['pull', reference], 15 * 60_000);
      active = { image: name, reference, operation: 'inspect' };
      const digests = JSON.parse(docker(['image', 'inspect', reference, '--format', '{{json .RepoDigests}}']));
      const repository = reference.slice(0, reference.lastIndexOf(':'));
      const matching = Array.isArray(digests)
        ? digests.filter(value => typeof value === 'string' && value.startsWith(repository + '@sha256:') && /@sha256:[a-f0-9]{64}$/.test(value))
        : [];
      if (matching.length !== 1) throw new Error('missing-or-ambiguous-image-digest');
      resolved[name] = {
        configured: reference, already_pinned: false, pulled_in_this_step: true,
        proposed: reference + matching[0].slice(repository.length),
      };
    }
    return {
      schema: 1, stage: pending.length ? 'image-lock-review-required' : 'image-lock-already-pinned',
      images: resolved, pending_review: pending,
      containers_created: 0, credentials_generated: 0, sql_executed: 0, e2e_executed: 0,
    };
  } catch (error) {
    const sanitized = new Error(errorCode(error));
    sanitized.resolution = {
      schema: 1, stage: 'image-resolution-failed', code: sanitized.message,
      failed: active, images: resolved, pending_review: pending,
      containers_created: 0, credentials_generated: 0, sql_executed: 0, e2e_executed: 0,
    };
    throw sanitized;
  } finally {
    rmSync(clientConfig, { recursive: true, force: true });
  }
}

export function main(args = process.argv.slice(2)) {
  if (args.length !== 1) { process.stderr.write('usage: resolve-images.mjs <report.json>\n'); process.exit(2); }
  const destination = resolve(args[0]);
  mkdirSync(dirname(destination), { recursive: true });
  let report;
  let status;
  try {
    const lock = JSON.parse(readFileSync(new URL('./images.lock.json', import.meta.url), 'utf8'));
    report = resolveImages(lock);
    status = report.pending_review.length ? 2 : 0;
  } catch (error) {
    // Controlled messages only: never dump Docker errors/environment or raw inspect JSON.
    report = error?.resolution ?? { schema: 1, stage: 'image-resolution-failed', code: errorCode(error), containers_created: 0, credentials_generated: 0, sql_executed: 0, e2e_executed: 0 };
    status = 1;
  }
  writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'report_ready=true\n');
  if (status === 2) process.stderr.write('IMAGE_LOCK_REVIEW_REQUIRED: review the reported digests and pin the lock before any bootstrap/login.\n');
  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
