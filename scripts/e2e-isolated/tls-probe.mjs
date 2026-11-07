import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertLoopbackOnly, assertNoProxy, assertRunId, assertSourceSha, browserEnvironment } from './runtime-contract.mjs';
import { TLS_ORIGIN, TLS_PUBLIC, TLS_CONTROLS, TLS_PNG } from './tls.mjs';

const fail = (code, cause) => { throw new Error('[e2e-isolated/tls-' + code + ']', { cause }); };
const hash = value => createHash('sha256').update(value).digest('hex');
const controlUrl = name => 'https://127.0.0.1:' + TLS_CONTROLS[name] + '/__e2e/tls-control';

export function navigationDiagnostic(page, url, runId, sourceSha) {
  const frame = page.mainFrame();
  const record = { request_count: 0, request_failed_count: 0, request_finished_count: 0,
    response_count: 0, ignored_event_count: 0, response_statuses: [], failure_error_texts: [] };
  let resolveTerminal, terminalSeen = false;
  const terminal = new Promise(resolve => { resolveTerminal = resolve; });
  const finished = () => { terminalSeen = true; resolveTerminal(); };
  const matches = request => {
    try {
      if (request.url() === url && request.method() === 'GET' && request.resourceType() === 'document' &&
          request.isNavigationRequest() && request.frame() === frame) return true;
    } catch { /* A request without a frame is not the controlled navigation. */ }
    record.ignored_event_count++;
    return false;
  };
  const safeText = value => {
    if (typeof value !== 'string' || !value) return null;
    const text = value.replaceAll(runId, '[run]').replaceAll(sourceSha, '[source]')
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]').replace(/[?&]\S+/g, '[query]')
      .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '[id]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT REDACTED]')
      .replace(/[\x00-\x1f\x7f]+/g, ' ').trim();
    return text.length > 512 ? '[error-text-too-long]' : text;
  };
  const listeners = {
    request: request => { if (matches(request)) record.request_count++; },
    requestfailed: request => {
      if (!matches(request)) return;
      record.request_failed_count++;
      if (record.failure_error_texts.length < 3) record.failure_error_texts.push(safeText(request.failure()?.errorText));
      finished();
    },
    requestfinished: request => { if (matches(request)) { record.request_finished_count++; finished(); } },
    response: response => {
      if (!matches(response.request())) return;
      record.response_count++;
      if (record.response_statuses.length < 3) record.response_statuses.push(response.status());
    },
  };
  for (const [event, listener] of Object.entries(listeners)) page.on(event, listener);
  return {
    record,
    async wait() {
      if (terminalSeen) return;
      let timer;
      try { await Promise.race([terminal, new Promise(resolve => { timer = setTimeout(resolve, 1_000); })]); }
      finally { clearTimeout(timer); }
    },
    stop() { for (const [event, listener] of Object.entries(listeners)) page.off(event, listener); },
  };
}

export function certificateFailure(error, kind, engine = 'node') {
  const text = [error?.code, error?.message, error?.cause?.code, error?.cause?.message].filter(Boolean).join(' ');
  if (/timed? ?out|ECONNREFUSED|ECONNRESET|ENOTFOUND|ERR_CONNECTION_REFUSED|NS_ERROR_CONNECTION_REFUSED|aborted/i.test(text)) return false;
  if (engine === 'webkit') return /unacceptable TLS certificate|SSL error has occurred|certificate.*(not trusted|invalid)|TLS.*certificate/i.test(text);
  const patterns = kind === 'untrusted'
    ? /DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|ERR_CERT_AUTHORITY_INVALID|SEC_ERROR_UNKNOWN_ISSUER|unknown issuer|self.signed certificate/i
    : /ERR_TLS_CERT_ALTNAME_INVALID|ERR_CERT_COMMON_NAME_INVALID|SSL_ERROR_BAD_CERT_DOMAIN|hostname mismatch|IP address mismatch|NotValidForName|not valid for.*name/i;
  return patterns.test(text);
}

/**
 * WebKit/Linux can collapse a rejected provisional TLS load into the generic
 * `Operation was cancelled`. That string alone is never certificate evidence.
 * Accept it only when the exact controlled top-level request also failed once,
 * with the same native cancellation and without any response/finished event.
 */
export function certificateNavigationFailure(error, kind, engine, record) {
  if (certificateFailure(error, kind, engine)) return true;
  if (engine !== 'webkit' || !['untrusted', 'wrong_san'].includes(kind)) return false;
  const nativeCancellation = value => {
    if (typeof value !== 'string') return false;
    if (/timed? ?out|ECONNREFUSED|ECONNRESET|ENOTFOUND|ERR_CONNECTION_REFUSED|NS_ERROR_CONNECTION_REFUSED|connection refused|aborted/iu.test(value)) return false;
    const lines = value.trim().split(/\r?\n/u);
    return /^(?:page\.goto:\s*)?Operation was cancelled(?:; maybe frame was detached\?)?$/iu.test(lines[0] ?? '')
      && (lines.length === 1 || lines[1] === 'Call log:');
  };
  const messages = [error?.message, error?.cause?.message].filter(Boolean);
  return messages.length > 0
    && messages.every(nativeCancellation)
    && record?.request_count === 1
    && record.request_failed_count === 1
    && record.request_finished_count === 0
    && record.response_count === 0
    && record.ignored_event_count === 0
    && record.response_statuses?.length === 0
    && record.failure_error_texts?.length === 1
    && nativeCancellation(record.failure_error_texts[0]);
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
export async function probeBrowsers({ runId, sourceSha, env, engines, environment = browserEnvironment,
  diagnostic = record => process.stderr.write('[e2e-isolated/tls-navigation-diagnostic] ' + JSON.stringify(record) + '\n') }) {
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
          let observation, rejection;
          try {
            // Establish a committed, trusted HTTPS document on this exact page
            // before exercising a failed navigation. Each control starts fresh.
            const warmupUrl = TLS_ORIGIN + '/__e2e/identity';
            const warmup = await negative.goto(warmupUrl, { waitUntil: 'load', timeout: 15_000 });
            if (warmup?.status() !== 200 || negative.url() !== warmupUrl) fail('browser-' + name + '-' + kind + '-warmup-document');
            assertIdentity(await warmup.json(), runId, sourceSha);
            observation = navigationDiagnostic(negative, controlUrl(kind), runId, sourceSha);
            try { await negative.goto(controlUrl(kind), { waitUntil: 'load', timeout: 15_000 }); }
            catch (error) { rejection = error; }
            // WebKit provisional-load failure can abort goto independently of
            // Network.loadingFailed. This bounded observation never approves TLS.
            if (rejection && !certificateFailure(rejection, kind, name)) await observation.wait();
            diagnostic({ engine: name, kind, ...observation.record });
          } finally { observation?.stop(); await negative.close(); }
          if (!rejection) fail('browser-' + name + '-' + kind + '-accepted');
          if (!certificateNavigationFailure(rejection, kind, name, observation?.record)) {
            fail('browser-' + name + '-' + kind + '-not-certificate-error', rejection);
          }
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
