import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = process.env.RECONCILIATION_REPO || process.cwd();
const { extractConnectionState, evoFetch } = await import(pathToFileURL(path.join(repo, 'supabase/functions/_shared/evolution-send.ts')).href);

const stateCases = [
  { input: { data: { Connected: true, LoggedIn: true } }, expected: 'open' },
  { input: { data: { Connected: false, LoggedIn: true } }, expected: 'connecting' },
  { input: { data: { Connected: false, LoggedIn: false } }, expected: 'close' },
].map(c => ({ ...c, actual: extractConnectionState(c.input) }))
 .map(c => ({ ...c, matches_plan_contract: c.actual === c.expected }));

// Dummy environment and in-memory fetcher: no network or real secret access.
globalThis.Deno = { env: { get: key => ({
  EVOLUTION_API_FLAVOR: 'go',
  EVOLUTION_INSTANCE_TOKEN: 'fixture-primary-token',
  EVOLUTION_INSTANCE_NAME: 'PRIMARY',
})[key] } };
const captures = [];
const mockFetch = async (url, options) => {
  captures.push({ url, method: options.method, apikey_marker: options.headers.apikey });
  return new Response('{}', { status: 200 });
};
await evoFetch('https://example.invalid', 'fixture-admin-key', '/message/sendText/SECONDARY', { number: '5500000000000', text: 'offline fixture' }, mockFetch);
await evoFetch('https://example.invalid', 'fixture-admin-key', '/message/sendText/SECONDARY', { number: '5500000000000', text: 'offline fixture' }, mockFetch, 'POST', undefined, 'fixture-secondary-token');
const result = {
  baseline: '2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6',
  command: 'node --experimental-strip-types audit/modules/transversal/local-semantic-probes.mjs',
  probe_kind: 'direct import of unchanged pinned TypeScript functions; synthetic fixture inputs; injected in-memory fetcher',
  network_requests: 0,
  connection_state_cases: stateCases,
  transport_captures: captures,
  secondary_without_explicit_token_uses_primary_fixture: captures[0].apikey_marker === 'fixture-primary-token',
  secondary_with_explicit_token_uses_secondary_fixture: captures[1].apikey_marker === 'fixture-secondary-token',
};
fs.writeFileSync(new URL('./local-semantic-probes.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
