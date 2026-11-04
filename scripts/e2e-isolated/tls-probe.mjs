import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertLoopbackOnly, assertNoProxy, assertRunId, assertSourceSha, browserEnvironment } from './runtime-contract.mjs';
import { TLS_ORIGIN, TLS_PUBLIC, TLS_CONTROLS, TLS_PNG } from './tls.mjs';

const fail = (code, cause) => { throw new Error('[e2e-isolated/tls-' + code + ']', { cause }); };
const hash = value => createHash('sha256').update(value).digest('hex');
const controlUrl = name => 'https://127.0.0.1:' + TLS_CONTROLS[name] + '/__e2e/tls-control';

export function certificateFailure(error, kind, engine = 'node') {
  const text = [error?.code, error?.message, error?.cause?.code, error?.cause?.message].filter(Boolean).join(' ');
  if (/timed? ?out|ECONNREFUSED|ECONNRESET|ENOTFOUND|ERR_CONNECTION_REFUSED|NS_ERROR_CONNECTION_REFUSED|aborted/i.test(text)) return false;
  if (engine === 'webkit') return /unacceptable TLS certificate|SSL error has occurred|certificate.*(not trusted|invalid)|TLS.*certificate/i.test(text);
  const patterns = kind === 'untrusted'
    ? /DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|ERR_CERT_AUTHORITY_INVALID|SEC_ERROR_UNKNOWN_ISSUER|unknown issuer|self.signed certificate/i
    : /ERR_TLS_CERT_ALTNAME_INVALID|ERR_CERT_COMMON_NAME_INVALID|SSL_ERROR_BAD_CERT_DOMAIN|hostname mismatch|IP address mismatch|NotValidForName|not valid for.*name/i;
  return patterns.test(text);
}

export function assertTlsClientContext(env, interfaces) {
  assertLoopbackOnly(interfaces); assertNoProxy(env);
  const runId = assertRunId(env.ZAPP_E2E_RUN_ID), sourceSha = assertSourceSha(env.GITHUB_SHA);
  if (env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined || env.NODE_OPTIONS || env.BUN_OPTIONS ||
      env.NODE_EXTRA_CA_CERTS !== TLS_PUBLIC + '/ca.crt' || env.SSL_CERT_FILE !== TLS_PUBLIC + '/ca.crt') fail('client-trust-environment');
  return { runId, sourceSha };
}

function assertIdentity(value, runId, sourceSha) {
  if (value?.schema !== 1 || value.run_id !== runId || value.source_sha !== sourceSha || value.origin !== TLS_ORIGIN) fail('identity-mismatch');
}

export async function probeClient({ runId, sourceSha, fetcher = fetch }) {
  assertRunId(runId); assertSourceSha(sourceSha);
  const options = () => ({ redirect: 'error', signal: AbortSignal.timeout(10_000) });
  const identity = await fetcher(TLS_ORIGIN + '/__e2e/identity', options());
  if (!identity.ok) fail('client-identity-status');
  assertIdentity(await identity.json(), runId, sourceSha);
  const media = await fetcher(TLS_ORIGIN + '/__e2e/tls-probe.png', options());
  if (!media.ok || media.headers.get('content-type')?.split(';')[0] !== 'image/png' ||
      hash(Buffer.from(await media.arrayBuffer())) !== hash(TLS_PNG)) fail('client-media');
  for (const name of Object.keys(TLS_CONTROLS)) {
    let rejection;
    try { await fetcher(controlUrl(name), options()); } catch (error) { rejection = error; }
    if (!rejection) fail('client-' + name + '-accepted');
    if (!certificateFailure(rejection, name)) fail('client-' + name + '-not-certificate-error');
  }
  return { identity: true, image: true, untrusted_rejected: true, wrong_san_rejected: true };
}

/** The same browser env filter used by the real isolated Playwright config. */
export async function probeBrowsers({ runId, sourceSha, env, engines, environment = browserEnvironment }) {
  assertRunId(runId); assertSourceSha(sourceSha);
  const browserEnv = environment(env);
  if (browserEnv.PLAYWRIGHT_FIREFOX_POLICIES_JSON !== TLS_PUBLIC + '/firefox-policies.json' ||
      !browserEnv.HOME || browserEnv.HOME !== env.HOME) fail('browser-trust-environment');
  const results = {};
  for (const name of ['chromium', 'firefox', 'webkit']) {
    if (!engines[name]?.launch) fail('browser-missing');
    const browser = await engines[name].launch({ headless: true, env: browserEnv });
    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: false });
      try {
        const page = await context.newPage();
        const response = await page.goto(TLS_ORIGIN + '/__e2e/tls-probe', { waitUntil: 'load', timeout: 15_000 });
        if (response?.status() !== 200) fail('browser-positive-status');
        const observation = await page.evaluate(async () => {
          const image = document.querySelector('#tls-probe-image');
          return { identity: await fetch('/__e2e/identity', { redirect: 'error' }).then(response => response.json()),
            image: image instanceof HTMLImageElement && image.complete && image.naturalWidth === 1 && image.naturalHeight === 1 };
        });
        assertIdentity(observation.identity, runId, sourceSha);
        if (!observation.image) fail('browser-media');
        await page.close();
        for (const kind of Object.keys(TLS_CONTROLS)) {
          const negative = await context.newPage();
          let rejection;
          try { await negative.goto(controlUrl(kind), { waitUntil: 'load', timeout: 15_000 }); }
          catch (error) { rejection = error; }
          finally { await negative.close(); }
          if (!rejection) fail('browser-' + name + '-' + kind + '-accepted');
          if (!certificateFailure(rejection, kind, name)) fail('browser-' + name + '-' + kind + '-not-certificate-error', rejection);
        }
        results[name] = { identity: true, image: true, untrusted_rejected: true, wrong_san_rejected: true };
      } finally { await context.close(); }
    } finally { await browser.close(); }
  }
  return results;
}

export async function probeEdge({ runId, sourceSha, fetcher = fetch }) {
  const response = await fetcher('http://127.0.0.1:9000/__e2e/tls', { redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!response.ok) fail('edge-probe-status');
  const value = await response.json();
  assertIdentity(value, runId, sourceSha);
  if (value.runtime !== 'edge' || ['identity', 'image', 'untrusted_rejected', 'wrong_san_rejected'].some(key => value.checks?.[key] !== true)) fail('edge-probe-incomplete');
  return value.checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (!['node', 'bun', 'browsers', 'edge'].includes(mode) || process.argv.length !== 3) fail('probe-usage');
  const context = assertTlsClientContext(process.env);
  if ((mode === 'bun') !== Boolean(process.versions.bun) || (mode === 'bun' && process.versions.bun !== '1.4.0')) fail('probe-runtime');
  let checks;
  if (mode === 'browsers') checks = await probeBrowsers({ ...context, env: process.env, engines: await import('@playwright/test') });
  else if (mode === 'edge') checks = await probeEdge(context);
  else checks = await probeClient(context);
  process.stdout.write(JSON.stringify({ schema: 1, run_id: context.runId, source_sha: context.sourceSha, origin: TLS_ORIGIN,
    runtime: mode, probe_runner: process.versions.bun ? 'bun' : 'node',
    probe_runner_version: process.versions.bun || process.versions.node, checks }) + '\n');
}
