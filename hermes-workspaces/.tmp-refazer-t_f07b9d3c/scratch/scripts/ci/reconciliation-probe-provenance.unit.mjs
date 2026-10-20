// #362 (R2-INF-015): os probes transversal, other e volume rotulavam um baseline
// fixo sem validar a fonte executada. Este teste exige que os três atestem HEAD e
// SHA-256 de cada fonte ANTES de ler/importar, recusem divergência sem publicar
// relatório e meçam rede (tentativas observadas) em vez de declarar `0` literal.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPRODUCE = join(ROOT, 'docs', 'reconciliation', 'reproduce');
const LIB = join(REPRODUCE, 'lib', 'source-provenance.mjs');
const BASELINE = '2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6';
const REFUSAL = /provenance refusal/i;

// `outputs` são os arquivos publicados pelo probe: precisam estar ausentes quando ele recusa.
const PROBES = [
  { dir: 'transversal', runner: process.execPath, entry: 'local-semantic-probes.mjs', outputs: ['local-semantic-probes.json'] },
  { dir: 'volume', runner: process.execPath, entry: 'volume_offline_probe.mjs', outputs: ['volume_offline_results.json'] },
  { dir: 'other', runner: 'python3', entry: 'reproduce_findings.py', outputs: ['catalog_export_function.ts', 'reproduce_findings.mjs'] },
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (path) => readFileSync(path, 'utf8');

function pinsOf(dir) {
  return JSON.parse(read(join(REPRODUCE, dir, 'source-pins.json')));
}

test('cada probe carrega source-pins.json com o baseline auditado e as fontes que executa', () => {
  for (const probe of PROBES) {
    const pins = pinsOf(probe.dir);
    const pinned = Object.keys(pins.source_sha256);
    assert.equal(pins.baseline_sha, BASELINE, `${probe.dir}: baseline auditado`);
    assert.ok(pinned.length > 0, `${probe.dir}: pins sem fontes`);
    for (const rel of pinned) {
      assert.match(pins.source_sha256[rel], /^[0-9a-f]{64}$/, `${probe.dir}: hash inválido para ${rel}`);
      assert.ok(existsSync(join(ROOT, rel)), `${probe.dir}: fonte pinada inexistente no repositório: ${rel}`);
    }
    const source = read(join(REPRODUCE, probe.dir, probe.entry));
    // O probe não rotula baseline fixo: o rótulo tem de vir do HEAD observado.
    assert.ok(!source.includes(BASELINE), `${probe.dir}: baseline fixo no próprio probe`);
    for (const rel of pinned) {
      assert.ok(source.includes(rel), `${probe.dir}: pins fora de escopo — o probe não lê ${rel}`);
    }
    // O relato separa esperado, observado e o que o harness adaptou.
    assert.match(source, /baseline_commit[^\n]*provenance\.observed\.head/, `${probe.dir}: baseline_commit deve vir do HEAD observado`);
    assert.match(source, /baseline_sha_expected/, `${probe.dir}: falta o hash esperado no relato`);
    assert.match(source, /network_requests[^\n]*attempts\.length/, `${probe.dir}: network_requests deve ser medido`);
    assert.match(source, /harness_adaptation|adapted_source_sha256/, `${probe.dir}: falta o registro do código adaptado pelo harness`);
  }
});

test('cada probe atesta HEAD e hashes antes de ler/importar e bloqueia a rede antes de carregar código', () => {
  for (const probe of PROBES) {
    const source = read(join(REPRODUCE, probe.dir, probe.entry));
    // O .py tem a sua própria porta (`recusar` + verificação de HEAD antes de ler);
    // o probe gerado (.mjs) repete a atestação e o bloqueio de rede.
    const gate = source.indexOf(probe.dir === 'other' ? "recusar('" : 'attestProvenance({');
    const network = source.indexOf('installNetworkBlock(globalThis)');
    assert.ok(gate > -1, `${probe.dir}: sem porta de proveniência`);
    assert.ok(network > -1, `${probe.dir}: sem bloqueio de rede`);
    // Primeira leitura de fonte pinada: tudo de proveniência vem antes dela.
    const pinned = Object.keys(pinsOf(probe.dir).source_sha256);
    const firstUse = Math.min(...pinned.map((rel) => source.indexOf(rel)));
    assert.ok(firstUse > gate, `${probe.dir}: atesta depois de ler a fonte`);
    if (probe.dir === 'other') {
      assert.ok(source.indexOf('HEAD^{commit}') > -1 && source.indexOf('HEAD^{commit}') < firstUse, 'other: verifica HEAD depois de ler a fonte');
      // O .py não fala com a rede: o bloqueio e a atestação vivem no probe gerado (.mjs).
      const generated = source.slice(source.indexOf("import assert from 'node:assert/strict'"));
      const load = generated.indexOf("await import('./catalog_export_function.ts')");
      assert.ok(load > -1, 'other: probe gerado sem carga do código adaptado');
      assert.ok(generated.indexOf('installNetworkBlock(globalThis)') > -1, 'other: probe gerado sem bloqueio de rede');
      assert.ok(generated.indexOf('installNetworkBlock(globalThis)') < load, 'other: rede bloqueada depois de executar o código');
      assert.ok(generated.indexOf('attestProvenance({') < load, 'other: atesta depois de executar o código');
    } else {
      const load = source.indexOf('await import(');
      const strip = source.indexOf('stripTypeScriptTypes(');
      const firstLoad = load === -1 ? strip : (strip === -1 ? load : Math.min(load, strip));
      assert.ok(firstLoad > network, `${probe.dir}: bloqueia a rede depois de carregar o código`);
    }
  }
});

test('probe recusa checkout divergente e não publica relatório com baseline que não executou', () => {
  for (const probe of PROBES) {
    if (probe.runner === 'python3' && spawnSync('python3', ['-V']).status !== 0) continue;
    const sandbox = mkdtempSync(join(tmpdir(), 'provenance-refusal-'));
    const checkout = join(sandbox, 'checkout');
    try {
      mkdirSync(checkout, { recursive: true });
      for (const rel of Object.keys(pinsOf(probe.dir).source_sha256)) {
        const destination = join(checkout, rel);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(join(ROOT, rel), destination);
      }
      const copy = join(sandbox, probe.dir);
      mkdirSync(copy, { recursive: true });
      for (const name of [probe.entry, 'source-pins.json']) copyFileSync(join(REPRODUCE, probe.dir, name), join(copy, name));
      // O probe gerado é artefato de execução: não pode existir antes da corrida.
      for (const output of probe.outputs) rmSync(join(copy, output), { force: true });
      mkdirSync(join(sandbox, 'lib'), { recursive: true });
      copyFileSync(LIB, join(sandbox, 'lib', 'source-provenance.mjs'));

      const run = spawnSync(probe.runner, [join(copy, probe.entry)], {
        cwd: copy,
        encoding: 'utf8',
        env: { ...process.env, RECONCILIATION_REPO: checkout, RECONCILIATION_OUTPUT: copy, TMPDIR: sandbox },
        timeout: 120_000,
      });
      assert.notEqual(run.status, 0, `${probe.dir}: aceitou checkout divergente\n${run.stdout}${run.stderr}`);
      assert.match(`${run.stdout}${run.stderr}`, REFUSAL, `${probe.dir}: recusou sem dizer por quê (proveniência)`);
      for (const output of probe.outputs) {
        assert.ok(!existsSync(join(copy, output)), `${probe.dir}: publicou ${output} sem atestar a fonte`);
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }
});

test('atestação de proveniência aceita fontes pinadas, recusa divergência e mede a rede', async () => {
  const { attestProvenance, installNetworkBlock, ProvenanceError } = await import(pathToFileURL(LIB).href);
  const sandbox = mkdtempSync(join(tmpdir(), 'provenance-guard-'));
  try {
    const module = 'src/lib/modulo.ts';
    const bytes = Buffer.from('export const volume = 80;\n');
    mkdirSync(join(sandbox, 'src', 'lib'), { recursive: true });
    writeFileSync(join(sandbox, module), bytes);
    const head = 'a'.repeat(40);
    const pins = { baseline_sha: head, source_sha256: { [module]: sha256(bytes) } };

    const proven = attestProvenance({ root: sandbox, pins, head: () => head });
    assert.equal(proven.verified, true);
    assert.equal(proven.observed.head, head);
    assert.deepEqual(proven.observed.source_sha256, pins.source_sha256);
    assert.deepEqual(proven.expected.baseline_sha, head);

    assert.throws(
      () => attestProvenance({ root: sandbox, pins, head: () => 'b'.repeat(40) }),
      (error) => error instanceof ProvenanceError && /HEAD/.test(error.message),
      'HEAD divergente tem de recusar',
    );
    writeFileSync(join(sandbox, module), Buffer.from('export const volume = 20;\n'));
    assert.throws(
      () => attestProvenance({ root: sandbox, pins, head: () => head }),
      (error) => error instanceof ProvenanceError && /source/i.test(error.message),
      'fonte alterada tem de recusar',
    );
    assert.throws(
      () => attestProvenance({ root: sandbox, pins, head: () => { throw new Error('sem git'); } }),
      (error) => error instanceof ProvenanceError,
      'sem git não pode atestar: recusa (fail closed)',
    );
    assert.throws(
      () => attestProvenance({ root: sandbox, pins: { baseline_sha: head } }),
      (error) => error instanceof ProvenanceError,
      'pins sem fontes tem de recusar',
    );

    const target = {};
    const net = installNetworkBlock(target);
    assert.equal(net.attempts.length, 0);
    assert.throws(() => target.fetch('https://example.invalid/x'), /offline|disabled/i);
    assert.throws(() => target.fetch('https://example.invalid/y', { method: 'POST' }), /offline|disabled/i);
    assert.equal(net.attempts.length, 2, 'tentativas de rede têm de ser contadas');
    assert.deepEqual(net.attempts.map((attempt) => attempt.method), ['GET', 'POST']);
    assert.equal(installNetworkBlock({}).attempts.length, 0, 'contador não pode ser literal compartilhado');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
