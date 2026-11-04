// Executa os run bodies reais com gh/git locais: nenhuma API ou poda real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { jobOf, stepsOf, valueOf, runOf, shellCode, onlyStep, conditionOf, conditionAllows, assertBlocking } from './workflow-test-support.mjs';

const source = readFileSync(new URL('../../.github/workflows/branch-hygiene-audit.yml', import.meta.url), 'utf8');
const job = jobOf(source, 'audit');
const steps = stepsOf(job);
const reportStep = onlyStep(steps, (s) => valueOf(s, 'id') === 'relatorio', 'coleta de branches');
const pruneStep = onlyStep(steps, (s) => shellCode(s).includes('node scripts/ci/branch-podaveis.mjs'), 'W98');
const slaStep = onlyStep(steps, (s) => shellCode(s).includes('node scripts/ci/sla-code-scanning.mjs'), 'W83');
const publishStep = onlyStep(steps, (s) => shellCode(s).includes('gh issue edit'), 'publicacao');
const day = 86_400_000;
const oldEpoch = Math.floor((Date.now() - 45 * day) / 1000);
const recentEpoch = Math.floor((Date.now() - day) / 1000);
const oldBranch = 'claude/patch-antigo';
const oldTsv = oldBranch + '\t' + oldEpoch + '\n';

// Implementa somente a superficie usada pelos corpos atuais. Sem delegar a gh/git.
async function fakeCli() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const cfg = JSON.parse(fs.readFileSync(process.env.FIXTURE_CONFIG, 'utf8'));
  const args = process.argv.slice(2);
  const tool = path.basename(process.argv[1]);
  fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({ tool, args }) + '\n');
  const emit = (text) => process.stdout.write(text);
  const reject = (text, code = 97) => { process.stderr.write(text + '\n'); process.exit(code); };
  const option = (name) => args[args.indexOf(name) + 1];
  if (tool === 'git') {
    if (args[0] === 'fetch') return;
    if (args[0] === 'branch' && args[1] === '-r') return emit('origin/HEAD -> origin/main\norigin/main\n' + cfg.branches.map((b) => 'origin/' + b.name).join('\n') + '\n');
    const b = cfg.branches.find((item) => 'origin/' + item.name === args.at(-1));
    if (args[0] === 'cherry' && b) return emit(b.cherry ?? '');
    if (args[0] === 'log' && b) return emit(String(b.epoch) + '\n');
    return reject('git nao permitido no fixture: ' + JSON.stringify(args));
  }
  if (tool !== 'gh') return reject('subprocesso inesperado: ' + tool);
  if (args[0] === 'pr' && args[1] === 'list') {
    if (cfg.prError) { emit('[]'); return reject('API de PR indisponivel', 1); }
    if (option('--json') === 'headRefName') return emit(cfg.prRaw ?? JSON.stringify((cfg.prs ?? []).slice(0, Number(option('--limit')))));
    if (option('--json') === 'number,title,updatedAt,url') return emit('#7 PR parada — fixture\n');
    return reject('campos de PR inesperados');
  }
  if (args[0] === 'api') {
    // gh real recusa esta combinacao antes de fazer a requisicao.
    if (args.includes('--slurp') && args.includes('--jq')) return reject('cannot combine --slurp with --jq', 2);
    const endpoint = args.find((arg) => arg.startsWith('repos/'));
    if (endpoint?.includes('/branches?')) {
      if (cfg.protectedError) { emit('main\n'); return reject('API de protecao indisponivel', 1); }
      const pages = cfg.protectedPages ?? [[{ name: 'main' }]];
      const selected = args.includes('--paginate') ? pages : pages.slice(0, 1);
      if (option('--jq') === '.[].name') return emit(selected.flat().map((b) => b.name).join('\n') + '\n');
      return emit(selected.map((p) => JSON.stringify(p)).join('\n'));
    }
    if (endpoint?.includes('/code-scanning/alerts?')) {
      if (cfg.alertError) { emit('[[]]'); return reject('API de code scanning indisponivel', 1); }
      if (cfg.alertRaw !== undefined) return emit(cfg.alertRaw);
      const pages = cfg.alertPages ?? [[]];
      const selected = args.includes('--paginate') ? pages : pages.slice(0, 1);
      return emit(args.includes('--slurp') ? JSON.stringify(selected) : selected.map((p) => JSON.stringify(p)).join('\n'));
    }
    return reject('endpoint inesperado: ' + endpoint);
  }
  if (args[0] === 'issue' && args[1] === 'list') return emit(cfg.existingIssue ? String(cfg.existingIssue) + '\n' : '');
  if (args[0] === 'issue' && ['create', 'edit'].includes(args[1])) {
    const body = fs.readFileSync(option('--body-file'), 'utf8');
    fs.writeFileSync(process.env.FIXTURE_PUBLISHED, JSON.stringify({ action: args[1], body }));
    return emit('https://example.invalid/fixture/issue\n');
  }
  return reject('gh nao permitido no fixture: ' + JSON.stringify(args));
}

function fixture(t, config = {}) {
  const root = mkdtempSync(join(tmpdir(), 'branch hygiene offline '));
  const bin = join(root, 'bin');
  const temp = join(root, 'runner');
  const modules = join(root, 'scripts', 'ci');
  for (const dir of [bin, temp, modules]) mkdirSync(dir, { recursive: true });
  for (const name of ['branch-podaveis.mjs', 'sla-code-scanning.mjs']) copyFileSync(fileURLToPath(new URL(name, import.meta.url)), join(modules, name));
  for (const tool of ['gh', 'git']) writeFileSync(join(bin, tool), '#!' + process.execPath + '\n(' + fakeCli.toString() + ')();\n', { mode: 0o755 });
  symlinkSync(process.execPath, join(bin, 'node'));
  const guard = join(root, 'offline.mjs');
  writeFileSync(guard, [
    "import fs from 'node:fs'; import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls'; import { syncBuiltinESMExports } from 'node:module';",
    "const deny = () => { fs.appendFileSync(process.env.FIXTURE_NETWORK, 'attempt\\n'); throw new Error('network disabled in fixture'); };",
    'globalThis.fetch = deny; http.request = http.get = https.request = https.get = net.connect = net.createConnection = tls.connect = deny; syncBuiltinESMExports();',
  ].join('\n'));
  const configPath = join(root, 'config.json');
  const callsPath = join(root, 'calls.jsonl');
  const publishedPath = join(root, 'published.json');
  const networkPath = join(root, 'network.txt');
  writeFileSync(configPath, JSON.stringify(config));
  const report = join(temp, 'branch-hygiene.md');
  const summary = join(root, 'summary.md');
  writeFileSync(report, 'RELATORIO ANTERIOR\n');
  writeFileSync(summary, 'SUMMARY ANTERIOR\n');
  if (config.tsv !== null) writeFileSync(join(temp, 'branch-equivalentes.tsv'), config.tsv ?? oldTsv);
  const env = {
    PATH: bin + ':/usr/bin:/bin',
    GH_TOKEN: 'offline-fixture-only',
    REPO: 'fixture/repo',
    RUNNER_TEMP: temp,
    GITHUB_STEP_SUMMARY: summary,
    LIMITE_PRS: '500',
    FIXTURE_CONFIG: configPath,
    FIXTURE_CALLS: callsPath,
    FIXTURE_PUBLISHED: publishedPath,
    FIXTURE_NETWORK: networkPath,
    NODE_OPTIONS: '--import=' + pathToFileURL(guard).href,
    LANG: 'C.UTF-8',
  };
  const calls = () => existsSync(callsPath) ? readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  const run = (step) => {
    const script = join(root, 'step.sh');
    writeFileSync(script, runOf(step));
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-euo', 'pipefail', script], { cwd: root, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 });
    assert.equal(result.error, undefined, 'subprocesso deve concluir: ' + result.error);
    assert.equal(result.signal, null, 'subprocesso nao deve ser terminado por sinal');
    assert.ok(!result.stderr.includes('nao permitido no fixture'), result.stderr);
    return result;
  };
  t.after(() => {
    try {
      assert.ok(!existsSync(networkPath), 'nenhuma tentativa de rede e permitida');
      assert.equal(calls().filter((c) => c.tool === 'git' && !['fetch', 'branch', 'cherry', 'log'].includes(c.args[0])).length, 0, 'nenhum subprocesso de poda');
      assert.equal(calls().filter((c) => c.tool === 'git' && c.args[0] === 'branch' && c.args[1] !== '-r').length, 0, 'nenhuma exclusao de branch');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  return { root, temp, report, summary, run, calls, published: () => existsSync(publishedPath) ? JSON.parse(readFileSync(publishedPath, 'utf8')) : undefined };
}

test('W83/W98: shells estritos e SLA bloqueante permanecem no workflow real', () => {
  assert.match(source, /shell:\s*bash --noprofile --norc -euo pipefail \{0\}/);
  assertBlocking(job, 4);
  for (const step of [reportStep, pruneStep, slaStep, publishStep]) {
    assert.match(runOf(step), /^set -euo pipefail$/m);
    assertBlocking(step);
  }
  assert.ok(steps.indexOf(reportStep) < steps.indexOf(pruneStep));
  assert.ok(steps.indexOf(pruneStep) < steps.indexOf(slaStep));
  assert.ok(steps.indexOf(slaStep) < steps.indexOf(publishStep));
});

const pruningCases = [
  { name: 'branch antiga e livre', config: {}, eligible: true },
  { name: 'nenhuma branch protegida e uma resposta valida', config: { protectedPages: [[]] }, eligible: true },
  { name: 'branch protegida somente na segunda pagina', config: { protectedPages: [[{ name: 'main' }], [{ name: oldBranch }]] }, eligible: false },
  { name: 'branch com PR aberta', config: { prs: [{ headRefName: oldBranch }] }, eligible: false },
  { name: 'branch recente', config: { tsv: oldBranch + '\t' + recentEpoch + '\n' }, eligible: false },
  { name: 'idade desconhecida', config: { tsv: oldBranch + '\t\n' }, eligible: false },
  { name: 'arquivo de equivalentes ausente', config: { tsv: null }, eligible: false, warning: true },
  { name: 'lista de equivalentes vazia', config: { tsv: '' }, eligible: false },
  { name: 'lista de PRs cheia no limite', config: { prs: Array.from({ length: 500 }, (_, i) => ({ headRefName: 'other/' + i })) }, eligible: false, warning: true },
  { name: 'lista de PRs abaixo do limite', config: { prs: Array.from({ length: 499 }, (_, i) => ({ headRefName: 'other/' + i })) }, eligible: true },
  { name: 'API de PR falha depois de escrever stdout', config: { prError: true }, eligible: false, warning: true },
  { name: 'API de protecao falha depois de escrever stdout', config: { protectedError: true }, eligible: false, warning: true },
  { name: 'ambas as APIs falham', config: { prError: true, protectedError: true }, eligible: false, warning: true },
  { name: 'JSON de PR malformado', config: { prRaw: '{broken' }, eligible: false, warning: true },
  { name: 'nome inseguro nao vira shell', config: { tsv: 'branch;touch NAO_EXECUTAR\t' + oldEpoch + '\n' }, eligible: false },
];
for (const item of pruningCases) test('W98 runtime: ' + item.name, (t) => {
  const f = fixture(t, item.config);
  const result = f.run(pruneStep);
  assert.equal(result.status, 0, result.stderr);
  const commands = result.stdout.split('\n').filter((line) => line.startsWith('git push origin --delete '));
  assert.deepEqual(commands, item.eligible ? ['git push origin --delete ' + oldBranch] : []);
  if (item.warning) assert.match(result.stderr, /::warning::W98:/);
  assert.equal(readFileSync(f.report, 'utf8'), 'RELATORIO ANTERIOR\n' + result.stdout);
  assert.equal(readFileSync(f.summary, 'utf8'), 'SUMMARY ANTERIOR\n' + result.stdout);
  assert.equal(f.calls().filter((c) => c.tool === 'git').length, 0, 'W98 imprime comandos sem executa-los');
  assert.ok(!existsSync(join(f.root, 'NAO_EXECUTAR')));
});

const alert = (number, severity, days) => ({ number, created_at: new Date(Date.now() - days * day).toISOString(), rule: { id: 'fixture-rule', security_severity_level: severity }, most_recent_instance: { location: { path: 'fixture.ts' } } });
const slaCases = [
  { name: 'nenhum alerta', config: { alertPages: [[]] }, status: 0, total: 0 },
  { name: 'high dentro do prazo', config: { alertPages: [[alert(1, 'high', 13)]] }, status: 0, total: 1 },
  { name: 'high vencido', config: { alertPages: [[alert(1, 'high', 16)]] }, status: 1, total: 1 },
  { name: 'critical vencido', config: { alertPages: [[alert(1, 'critical', 16)]] }, status: 1, total: 1 },
  { name: 'low dentro do prazo', config: { alertPages: [[alert(1, 'low', 29)]] }, status: 0, total: 1 },
  { name: 'medium vencido', config: { alertPages: [[alert(1, 'medium', 32)]] }, status: 1, total: 1 },
  { name: 'violacao apenas na segunda pagina', config: { alertPages: [Array.from({ length: 100 }, (_, i) => alert(i + 1, 'high', 1)), [alert(101, 'high', 16)]] }, status: 1, total: 101 },
  { name: 'segunda pagina tambem saudavel', config: { alertPages: [[alert(1, 'high', 1)], [alert(2, 'low', 1)]] }, status: 0, total: 2 },
  { name: 'API indisponivel nao finge lista vazia', config: { alertError: true }, status: 0, warning: true },
  { name: 'JSON de API malformado', config: { alertRaw: '{broken' }, status: 0, warning: true },
  { name: 'API devolve objeto em vez de lista', config: { alertRaw: '[{"message":"permission denied"}]' }, status: 0, warning: true },
];
for (const item of slaCases) test('W83 runtime: ' + item.name, (t) => {
  const f = fixture(t, item.config);
  const result = f.run(slaStep);
  assert.equal(result.status, item.status, result.stderr);
  if (item.warning) {
    assert.match(result.stderr, /::warning::W83:/);
    assert.match(result.stdout, /Não foi possível consultar os alertas/);
    assert.doesNotMatch(result.stdout, /Nenhuma violação/);
  } else assert.ok(result.stdout.includes('Alertas abertos: ' + item.total + '\n'), result.stdout);
  if (item.status === 1) assert.match(result.stderr, /::error::W83: SLA vencido/);
  assert.equal(readFileSync(f.report, 'utf8'), 'RELATORIO ANTERIOR\n' + result.stdout);
  assert.equal(readFileSync(f.summary, 'utf8'), 'SUMMARY ANTERIOR\n' + result.stdout);
});

const publicationCases = [
  { name: 'sucesso atualiza issue existente', outcome: 'success', cancelled: false, slaFailure: false, existingIssue: 42, publish: true },
  { name: 'SLA vencido publica e preserva a falha', outcome: 'success', cancelled: false, slaFailure: true, publish: true },
  { name: 'relatorio falhou', outcome: 'failure', cancelled: false, publish: false },
  { name: 'relatorio foi ignorado', outcome: 'skipped', cancelled: false, publish: false },
  { name: 'relatorio cancelado', outcome: 'cancelled', cancelled: false, publish: false },
  { name: 'workflow cancelado depois de gerar relatorio', outcome: 'success', cancelled: true, publish: false },
];
for (const item of publicationCases) test('W83 publicacao: ' + item.name, (t) => {
  const f = fixture(t, { existingIssue: item.existingIssue, alertPages: [[alert(1, 'high', item.slaFailure ? 16 : 1)]] });
  let priorStatus = 0;
  if (item.outcome === 'success') priorStatus = f.run(slaStep).status;
  const permitted = conditionAllows(conditionOf(publishStep), {
    'cancelled()': item.cancelled,
    'success()': priorStatus === 0 && item.outcome === 'success',
    'failure()': priorStatus !== 0 || item.outcome === 'failure',
    'steps.relatorio.outcome': item.outcome,
  });
  assert.equal(permitted, item.publish);
  const before = readFileSync(f.report, 'utf8');
  if (permitted) {
    assert.equal(f.run(publishStep).status, 0);
    assert.deepEqual(f.published(), { action: item.existingIssue ? 'edit' : 'create', body: before });
    assert.equal(f.calls().filter((c) => c.tool === 'gh' && c.args[0] === 'issue' && ['edit', 'create'].includes(c.args[1])).length, 1);
    if (item.slaFailure) { assert.equal(priorStatus, 1); assert.match(before, /Violações de SLA/); }
  } else {
    assert.equal(f.published(), undefined);
    assert.equal(f.calls().filter((c) => c.tool === 'gh' && c.args[0] === 'issue').length, 0);
    assert.equal(readFileSync(f.report, 'utf8'), before);
  }
});

test('W98: coleta real fornece TSV somente de patch-equivalentes e o relatorio chega a publicacao', (t) => {
  const f = fixture(t, { branches: [
    { name: oldBranch, epoch: oldEpoch, cherry: '- abc patch-ja-integrado\n' },
    { name: 'feature/novo', epoch: oldEpoch, cherry: '+ def trabalho-inedito\n' },
  ], existingIssue: 42 });
  assert.equal(f.run(reportStep).status, 0);
  assert.equal(readFileSync(join(f.temp, 'branch-equivalentes.tsv'), 'utf8'), oldTsv);
  assert.equal(f.run(pruneStep).status, 0);
  assert.equal(f.run(slaStep).status, 0);
  const before = readFileSync(f.report, 'utf8');
  assert.match(before, /PR parada/);
  assert.ok(before.includes('git push origin --delete ' + oldBranch));
  assert.equal(f.run(publishStep).status, 0);
  assert.equal(f.published().body, before);
  assert.ok(f.calls().some((c) => c.tool === 'git' && c.args[0] === 'cherry'));
});
