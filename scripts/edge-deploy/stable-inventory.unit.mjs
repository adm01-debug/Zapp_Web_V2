import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectStableAttestation, inventorySnapshot, fetchRemoteInventory, CANONICAL_PROJECT } from './stable-inventory.mjs';

const manifest = JSON.parse(await readFile(new URL('../../supabase/deployment-manifest.json', import.meta.url)));
const rows = manifest.functions.map((fn, i) => ({ slug: fn.name, id: `fn-${i}`, version: 2, status: 'ACTIVE', verify_jwt: fn.verify_jwt, ezbr_sha256: 'a'.repeat(64), updated_at: '2026-09-22T12:00:00.000Z' }));
const before = inventorySnapshot(rows.map(fn => ({ ...fn, version: 1 })), CANONICAL_PROJECT);
function simulate(sequence, options = {}) {
  let tick = Date.parse('2026-09-22T12:01:00Z');
  let calls = 0;
  return collectStableAttestation({ manifest, before, gitSha: 'a'.repeat(40), runId: '123', deploymentScope: 'all',
    now: () => tick, sleep: async ms => { tick += ms; }, intervalMs: 10, minimumObservationMs: 60, consecutiveSamples: 3, maxAttempts: 18,
    fetchInventory: async () => { const value = sequence[Math.min(calls++, sequence.length - 1)]; if (value instanceof Error) throw value; return value; }, ...options });
}

test('requires a minimum observation window, consecutive samples and advanced versions', async () => {
  const result = await simulate([rows]);
  assert.equal(result.verification.samples.length, 7);
  assert.equal(result.verification.observation_ms, 60);
  assert.equal(result.verification.source_to_bundle_equivalence_proven, false);
  assert.equal(result.function_count, manifest.functions.length);
});
test('late bundle changes reset stable streak even without changed source', async () => {
  const changed = rows.map((fn, i) => i === 0 ? { ...fn, version: 3, ezbr_sha256: 'b'.repeat(64) } : fn);
  const result = await simulate([rows, rows, rows, rows, rows, rows, changed]);
  assert.equal(result.verification.samples.length, 9);
  assert.equal(result.functions[0].remote_version, 3);
});
test('inventario identico ao baseline atesta pelo digest (deploy sem mudanca de bundle)', async () => {
  // Mudanca de contrato (01/10/2026, run 36852598923): o CLI pula o deploy de uma
  // funcao cujo bundle bate byte a byte com o publicado e NAO bumpa version. Antes
  // exigiamos o sinal do log do CLI (knownUnchanged); quando o CLI passou a escrever
  // "No change found" no stderr, o arquivo de unchanged vinha vazio, a lista nao
  // chegava e a atestacao queimava 144 amostras (~24 min) para falhar. Agora o
  // digest remoto identico ao baseline e o proprio sinal de "nada a publicar".
  const result = await simulate([before.functions]);
  assert.equal(result.function_count, manifest.functions.length);
  assert.deepEqual(
    [...result.verification.accepted_without_version_bump].sort((a, b) => a.localeCompare(b)),
    before.functions.map(fn => fn.slug).sort((a, b) => a.localeCompare(b)),
  );
});
test('funcao sinalizada pelo deploy como "No change found" nao exige bump de versao', async () => {
  // rows[0] fica na MESMA versao/digest do baseline (o CLI pulou por bundle
  // identico); as demais seguem bumpadas como em "rows". O sinal do log
  // (knownUnchanged) continua valido e agora e redundante com a aceitacao por
  // digest -- ver o teste da contradicao logo abaixo.
  const skipped = rows.map((fn, i) => (i === 0 ? { ...fn, version: 1 } : fn));
  const result = await simulate([skipped], { knownUnchanged: [rows[0].slug] });
  assert.equal(result.functions.find((fn) => fn.name === rows[0].slug).remote_version, 1);
  assert.equal(result.function_count, manifest.functions.length);
});
test('sem sinalizacao do CLI, o digest remoto igual ao baseline atesta (o log nao e mais a unica fonte)', async () => {
  // Cenario real do run 36852598923: o CLI escreveu "No change found" no stderr,
  // o arquivo de unchanged saiu vazio e a funcao ficou na mesma versao/digest.
  // O digest identico ao baseline e o sinal suficiente para atestar.
  const skipped = rows.map((fn, i) => (i === 0 ? { ...fn, version: 1 } : fn));
  const result = await simulate([skipped]);
  assert.equal(result.functions.find((fn) => fn.name === rows[0].slug).remote_version, 1);
  assert.deepEqual(result.verification.accepted_without_version_bump, [rows[0].slug]);
});
test('contradicao: CLI reportou sem mudanca e o digest remoto mudou desde o baseline falha na primeira amostra com a causa real', async () => {
  // O CLI disse que pulou a funcao, mas o bundle remoto mudou desde o baseline:
  // ou houve deploy concorrente, ou o sinal do CLI esta errado. Nao existe espera
  // que resolva isso -- antes queimava 144 amostras e entregava a mensagem generica.
  const drifted = rows.map((fn, i) => (i === 0 ? { ...fn, version: 1, ezbr_sha256: 'c'.repeat(64) } : fn));
  let calls = 0;
  await assert.rejects(
    simulate([drifted], { knownUnchanged: [rows[0].slug], fetchInventory: async () => { calls += 1; return drifted; } }),
    /reportou "No change found" e o bundle remoto mudou desde o baseline/,
  );
  assert.equal(calls, 1, 'a contradicao e determinista: nao ha o que esperar');
});
test('knownUnchanged invalido e rejeitado antes de qualquer chamada de rede', async () => {
  await assert.rejects(simulate([rows], { knownUnchanged: 'not-an-array' }), /policy/);
  await assert.rejects(simulate([rows], { knownUnchanged: [123] }), /policy/);
});
// `digest` e `jwt` sairam deste laco: sao erros deterministicos (configuracao e
// bundle publicado), nao propagacao lenta. Ver o teste especifico logo abaixo.
for (const [name, patch] of Object.entries({ failed: { status: 'FAILED' }, version: { version: null }, timestamp: { updated_at: 'invalid' }, identity: { id: null } })) {
  test(`rejects ${name} drift`, async () => {
    await assert.rejects(simulate([rows.map((fn, i) => i === 0 ? { ...fn, ...patch } : fn)]), /NOT attested/);
  });
}
test('drift deterministico falha na primeira amostra com a causa real, sem gastar as 144 tentativas', async () => {
  // Cada caso abaixo so pode ser resolvido por acao humana (corrigir o
  // config/manifesto ou republicar a funcao). Tratar como transitorio custava
  // 144 amostras x 10 s (~24 min) e entregava ao operador a mensagem generica
  // "Remote inventory did not stabilize" em vez da causa.
  const cases = [
    ['digest ausente', rows.map((fn, i) => (i === 0 ? { ...fn, ezbr_sha256: 'invalid-hash-16-chars' } : fn)), /remote bundle digest is missing/],
    ['verify_jwt divergente', rows.map((fn, i) => (i === 0 ? { ...fn, verify_jwt: !fn.verify_jwt } : fn)), /verify_jwt mismatch/],
    ['funcao remota nao declarada', [...rows, { slug: 'intruder', id: 'fn-intruder', version: 1, status: 'ACTIVE', verify_jwt: true, ezbr_sha256: 'd'.repeat(64), updated_at: '2026-09-22T12:00:00.000Z' }], /Remote function set mismatch/],
  ];
  for (const [label, sequence, expected] of cases) {
    let calls = 0;
    await assert.rejects(
      simulate([sequence], {
        fetchInventory: async () => { calls += 1; return sequence; },
      }),
      expected,
      `${label}: mensagem precisa ser a causa real`,
    );
    assert.equal(calls, 1, `${label}: a primeira amostra ja prova o problema, nao ha o que esperar`);
  }
});
test('funcao gerenciada ausente na lista remota continua transitoria (pode ser propagacao de deploy novo)', async () => {
  // Diferente do excedente: a lista remota pode ainda estar propagando a
  // criacao de uma funcao recem-publicada, entao aqui a espera tem valor.
  await assert.rejects(simulate([rows.slice(1)]), /NOT attested/);
});
test('transient errors reset stability but never emit response contents', async () => {
  const result = await simulate([rows, rows, new Error('fixture-private-response'), rows]);
  assert.equal(result.verification.samples[2].valid, false);
  assert.doesNotMatch(JSON.stringify(result), /fixture-private-response/);
});
test('inventory row order does not produce false drift', async () => {
  const result = await simulate([rows, [...rows].reverse(), rows]);
  assert.equal(result.verification.consecutive_samples, 7);
});
test('partial deployment reports unrelated changes separately', async () => {
  const result = await simulate([rows], { deploymentScope: rows[0].slug });
  assert.equal(result.verification.selected_functions.length, 1);
  assert.equal(result.verification.changed_outside_scope.length, rows.length - 1);
});
test('wrong project rejected before any request', async () => {
  let called = false;
  await assert.rejects(fetchRemoteInventory({ projectRef: 'wrong', token: 'fixture', fetchImpl: () => { called = true; } }), /Canonical/);
  assert.equal(called, false);
  await assert.rejects(simulate([rows], { before: { ...before, project_ref: 'wrong' } }), /project mismatch/);
});
test('unknown scope and invalid polling configuration rejected', async () => {
  await assert.rejects(simulate([rows], { deploymentScope: 'absent' }), /Unknown/);
  await assert.rejects(simulate([rows], { consecutiveSamples: 1 }), /policy/);
});
test('API failures omit response payload, transport error and authorization token', async () => {
  await assert.rejects(fetchRemoteInventory({ projectRef: CANONICAL_PROJECT, token: 'fixture-private', fetchImpl: async () => { throw new Error('fixture-private'); } }), /transport failure/);
  await assert.rejects(fetchRemoteInventory({ projectRef: CANONICAL_PROJECT, token: 'fixture-private', fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'fixture-private' }) }), /^Error: Management API HTTP 401$/);
});
test('snapshot whitelists metadata and rejects duplicates', () => {
  assert.doesNotMatch(JSON.stringify(inventorySnapshot(rows.map(fn => ({ ...fn, secret: 'fixture-private' })), CANONICAL_PROJECT)), /fixture-private/);
  assert.throws(() => inventorySnapshot([...rows, rows[0]], CANONICAL_PROJECT), /duplicate/);
});
