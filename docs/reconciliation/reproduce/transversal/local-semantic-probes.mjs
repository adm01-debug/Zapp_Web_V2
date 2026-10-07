import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { attestProvenance, installNetworkBlock } from '../lib/source-provenance.mjs';

const repo = fs.realpathSync(process.env.RECONCILIATION_REPO || process.cwd());
// Um caminho de checkout não é permissão para executar outra fonte: o HEAD e o SHA-256
// de cada módulo executado são atestados ANTES do import.
const pins = JSON.parse(fs.readFileSync(new URL('./source-pins.json', import.meta.url), 'utf8'));
const provenance = attestProvenance({ root: repo, pins });
// Fontes atestadas acima (módulo importado e seu import transitivo):
//   supabase/functions/_shared/evolution-send.ts
//   supabase/functions/_shared/evolution-go-routes.ts
// Bloqueio de rede instalado antes de carregar o código: as tentativas são medidas, não declaradas.
const network = installNetworkBlock(globalThis);

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
  // O rótulo do baseline é o HEAD observado e atestado, nunca um literal fixo.
  baseline_commit: provenance.observed.head,
  baseline_sha_expected: provenance.expected.baseline_sha,
  provenance,
  command: 'node audit/modules/transversal/local-semantic-probes.mjs',
  probe_kind: 'direct import of unchanged pinned TypeScript functions; synthetic fixture inputs; injected in-memory fetcher',
  harness_adaptation: { kind: 'none', note: 'the attested modules are imported unchanged; only the fetcher is injected' },
  network_requests: network.attempts.length,
  network_attempts: network.attempts,
  connection_state_cases: stateCases,
  transport_captures: captures,
  secondary_without_explicit_token_uses_primary_fixture: captures[0].apikey_marker === 'fixture-primary-token',
  secondary_with_explicit_token_uses_secondary_fixture: captures[1].apikey_marker === 'fixture-secondary-token',
};
fs.writeFileSync(new URL('./local-semantic-probes.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
