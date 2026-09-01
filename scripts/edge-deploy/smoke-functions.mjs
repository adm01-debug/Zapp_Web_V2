#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyManifestDigest } from './manifest-lib.mjs';

const DEFAULT_ALLOWED_ORIGIN = 'https://zapp-web-v2.vercel.app';
const DEFAULT_DENIED_ORIGIN = 'https://edge-smoke.invalid';

function parseArgs(argv) {
  const args = {
    manifestPath: 'supabase/deployment-manifest.json',
    concurrency: 8,
    retries: 3,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--manifest') args.manifestPath = argv[++index];
    else if (key === '--base-url') args.baseUrl = argv[++index];
    else if (key === '--output') args.outputPath = argv[++index];
    else if (key === '--git-sha') args.gitSha = argv[++index];
    else if (key === '--run-id') args.runId = argv[++index];
    else if (key === '--concurrency') args.concurrency = Number(argv[++index]);
    else if (key === '--retries') args.retries = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${key}`);
  }
  for (const required of ['baseUrl', 'outputPath', 'gitSha', 'runId']) {
    if (!args[required]) throw new Error(`Missing required argument: ${required}`);
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 20) {
    throw new Error('concurrency must be an integer between 1 and 20');
  }
  if (!Number.isInteger(args.retries) || args.retries < 1 || args.retries > 5) {
    throw new Error('retries must be an integer between 1 and 5');
  }
  return args;
}

async function fetchWithRetry(url, init, { retries, expectedStatuses, fetchImpl }) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (expectedStatuses.includes(response.status)) return response;
      lastError = new Error(`unexpected HTTP ${response.status}`);
      if (response.status < 500) return response;
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw lastError;
}

export async function smokeFunction({ fn, baseUrl, retries, fetchImpl = fetch }) {
  const url = `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(fn.name)}`;
  try {
    const allowed = await fetchWithRetry(url, {
      method: 'OPTIONS',
      headers: {
        Origin: DEFAULT_ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    }, { retries, expectedStatuses: [200, 204], fetchImpl });
    const allowedOrigin = allowed.headers.get('access-control-allow-origin');
    const availabilityOk = [200, 204].includes(allowed.status) && allowedOrigin === DEFAULT_ALLOWED_ORIGIN;

    const denied = await fetchWithRetry(url, {
      method: 'OPTIONS',
      headers: {
        Origin: DEFAULT_DENIED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
      },
    }, { retries, expectedStatuses: [200, 204], fetchImpl });
    const deniedOrigin = denied.headers.get('access-control-allow-origin');
    const corsDenialOk = [200, 204].includes(denied.status) &&
      deniedOrigin !== DEFAULT_DENIED_ORIGIN && deniedOrigin !== '*';

    let anonymousGateway = null;
    if (fn.verify_jwt) {
      const anonymous = await fetchWithRetry(url, {
        method: 'POST',
        headers: { Origin: DEFAULT_ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
        body: '{}',
      }, { retries, expectedStatuses: [401], fetchImpl });
      anonymousGateway = { status: anonymous.status, passed: anonymous.status === 401 };
    }

    const passed = availabilityOk && corsDenialOk && (anonymousGateway?.passed ?? true);
    return {
      name: fn.name,
      verify_jwt: fn.verify_jwt,
      passed,
      checks: {
        availability: { status: allowed.status, allow_origin: allowedOrigin, passed: availabilityOk },
        denied_origin: { status: denied.status, allow_origin: deniedOrigin, passed: corsDenialOk },
        anonymous_gateway: anonymousGateway,
      },
    };
  } catch (error) {
    return {
      name: fn.name,
      verify_jwt: fn.verify_jwt,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

export async function runSmokeSuite(args) {
  const manifest = JSON.parse(await readFile(args.manifestPath, 'utf8'));
  verifyManifestDigest(manifest);
  const results = await runPool(
    manifest.functions,
    args.concurrency,
    (fn) => smokeFunction({ fn, baseUrl: args.baseUrl, retries: args.retries }),
  );
  const passed = results.filter((result) => result.passed).length;
  const evidence = {
    schema_version: 1,
    project_ref: manifest.project_ref,
    git_sha: args.gitSha,
    github_run_id: String(args.runId),
    created_at: new Date().toISOString(),
    source_manifest_sha256: manifest.manifest_sha256,
    summary: { total: results.length, passed, failed: results.length - passed },
    results,
  };
  await writeFile(args.outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidence;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidence = await runSmokeSuite(args);
  for (const result of evidence.results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`);
  }
  console.log(
    `Edge smoke: ${evidence.summary.passed}/${evidence.summary.total} passed; ` +
    `${evidence.summary.failed} failed`,
  );
  if (evidence.summary.failed > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
