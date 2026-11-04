import { readFileSync } from 'node:fs';
import { assertLocalOrigin, assertLoopbackOnly, assertNoProxy, assertOfficialHostIsLocal, currentNetworkNamespace, ORIGIN, fail } from './runtime-contract.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const mode = process.argv[2];
assertLoopbackOnly();
assertNoProxy(process.env);
assertLocalOrigin(process.env.API_URL);
assertOfficialHostIsLocal(readFileSync('/etc/hosts', 'utf8'));

if (mode === 'network') {
  process.stdout.write(JSON.stringify({ network_namespace: currentNetworkNamespace(), loopback_only: true, official_host_local: true }) + '\n');
} else if (mode === 'platform') {
  const checks = [
    { name: 'auth', url: 'http://127.0.0.1:9999/health' },
    { name: 'rest', url: 'http://127.0.0.1:3001/ready' },
    { name: 'storage', url: 'http://127.0.0.1:5000/status' },
    {
      name: 'realtime', url: 'http://127.0.0.1:4000/api/tenants/realtime-dev/health',
      headers: { Authorization: 'Bearer ' + process.env.ANON_KEY, Host: 'realtime-dev.supabase-realtime' },
      healthy: json => json?.data?.healthy === true,
    },
  ];
  const deadline = Date.now() + 180_000;
  let state = {};
  do {
    state = Object.fromEntries(await Promise.all(checks.map(async check => {
      try {
        const response = await fetch(check.url, { headers: check.headers, redirect: 'error', signal: AbortSignal.timeout(5_000) });
        const ok = response.ok && (!check.healthy || check.healthy(await response.json()));
        return [check.name, { ready: ok, http_status: response.status }];
      } catch { return [check.name, { ready: false, http_status: null }]; }
    })));
    if (Object.values(state).every(value => value.ready)) break;
    await delay(2_000);
  } while (Date.now() < deadline);
  process.stdout.write(JSON.stringify({ phase: 'platform', services: state }) + '\n');
  if (!Object.values(state).every(value => value.ready)) fail('platform-not-ready');
} else if (mode === 'frontend') {
  const deadline = Date.now() + 120_000;
  let ready = false;
  do {
    try {
      const identity = await fetch(ORIGIN + '/__e2e/identity', { redirect: 'error', signal: AbortSignal.timeout(5_000) });
      const data = await identity.json();
      if (!identity.ok || data.run_id !== process.env.ZAPP_E2E_RUN_ID || data.source_sha !== process.env.GITHUB_SHA) fail('foreign-gateway');
      const page = await fetch(ORIGIN + '/auth', { redirect: 'error', signal: AbortSignal.timeout(10_000) });
      // This proves the dev server responded; admission separately imports and
      // validates the real Vite Supabase configuration inside the browser.
      ready = page.ok && (await page.text()).includes('/@vite/client');
      if (ready) break;
    } catch (error) {
      if (error?.message === '[e2e-isolated/foreign-gateway]') throw error;
    }
    await delay(2_000);
  } while (Date.now() < deadline);
  if (!ready) fail('frontend-not-ready');
  process.stdout.write(JSON.stringify({ phase: 'frontend', ready: true }) + '\n');
} else if (mode === 'seed') {
  const seed = JSON.parse(readFileSync('/output/seed-ready.json', 'utf8'));
  if (seed.run_id !== process.env.ZAPP_E2E_RUN_ID || seed.source_sha !== process.env.GITHUB_SHA ||
      seed.auth_login_real !== true || seed.supervisor_rls_read !== true) fail('seed-proof-mismatch');
  process.stdout.write(JSON.stringify({ phase: 'seed', ready: true, network_namespace: currentNetworkNamespace() }) + '\n');
} else {
  fail('unknown-probe');
}
