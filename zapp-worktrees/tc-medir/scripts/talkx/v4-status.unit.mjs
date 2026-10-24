import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadEtapas,
  loadElementos,
  loadAvaliacoes,
  parearEtapas,
  verifiedDoneSteps,
  historicoDivergente,
  STATUS_CONCLUIDO,
  extractStepIds,
  detectDoneSteps,
  computeStatus,
  generateMarkdown,
  resolveGit,
} from './v4-status.mjs';

const IDS = new Set(['X001', 'X002', 'X003']);

// `git` resolvido para caminho ABSOLUTO no processo pai (o mesmo binário que o shell
// usaria — no workspace, o shim de guarda). S4036 é atendido pelo caminho absoluto;
// o filho herda o ambiente do pai, sem PATH fixo (que trocaria o binário resolvido).
const GIT = resolveGit();

/** Escreve um P046.json de fixture (lista de tarefas `{id, status}`) e devolve o caminho. */
function fixtureP046(tasks) {
  const dir = mkdtempSync(join(tmpdir(), 'v4-p046-'));
  const p = join(dir, 'P046.json');
  writeFileSync(p, JSON.stringify({ tasks }));
  return p;
}

test('extractStepIds: título com (X001) vira etapa concluída (inclusive com sufixo de squash)', () => {
  const done = extractStepIds(
    ['docs(talkx): plano V4 vigente (X001) (#1451)'],
    IDS,
  );
  assert.deepEqual([...done], ['X001']);
});

test('extractStepIds: título com (X999) → erro "etapa inexistente"', () => {
  assert.throws(
    () => extractStepIds(['feat(talkx): algo (X999)'], IDS),
    /etapa inexistente: X999/,
  );
});

test('extractStepIds: commit sem escopo talkx (ex. fix(ci)) é ignorado, mesmo com (XNNN)', () => {
  // Falso positivo real: `fix(ci): ... (X028)` — commit de CI que cita id de outro
  // plano. X001 está em IDS, mas o escopo `ci` impede que conte como etapa do Talk X.
  const done = extractStepIds(['fix(ci): E28 — algo (X001)'], IDS);
  assert.deepEqual([...done], []);
});

test('loadEtapas: rejeita id de etapa duplicado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'v4-etapas-'));
  const p = join(dir, 'etapas.json');
  writeFileSync(
    p,
    JSON.stringify([
      { id: 'X001', fase: 0, fecha: [] },
      { id: 'X001', fase: 0, fecha: [] },
    ]),
  );
  assert.throws(() => loadEtapas(p), /id de etapa duplicado: X001/);
});

test('loadAvaliacoes: lê os estados de P046.json por ID', () => {
  const av = loadAvaliacoes(
    fixtureP046([
      { id: 'X001', status: 'DONE_VERIFIED' },
      { id: 'X002', status: 'PARTIAL' },
    ]),
  );
  assert.equal(av.size, 2);
  assert.equal(av.get('X001'), 'DONE_VERIFIED');
  assert.equal(av.get('X002'), 'PARTIAL');
});

test('loadAvaliacoes: rejeita avaliação duplicada', () => {
  const p = fixtureP046([
    { id: 'X001', status: 'DONE_VERIFIED' },
    { id: 'X001', status: 'PARTIAL' },
  ]);
  assert.throws(() => loadAvaliacoes(p), /avaliação duplicada: X001/);
});

test('loadAvaliacoes: rejeita id de avaliação inválido', () => {
  const p = fixtureP046([{ id: 'X01', status: 'PARTIAL' }]);
  assert.throws(() => loadAvaliacoes(p), /id de avaliação inválido: X01/);
});

test('loadAvaliacoes: rejeita estado de avaliação desconhecido', () => {
  const p = fixtureP046([{ id: 'X001', status: 'QUASE_LA' }]);
  assert.throws(
    () => loadAvaliacoes(p),
    /estado de avaliação desconhecido em X001: QUASE_LA/,
  );
});

test('parearEtapas: rejeita etapa sem avaliação (ID ausente)', () => {
  const etapas = [
    { id: 'X001', fase: 0, fecha: [] },
    { id: 'X002', fase: 0, fecha: [] },
  ];
  const av = new Map([['X001', 'DONE_VERIFIED']]);
  assert.throws(() => parearEtapas(etapas, av), /avaliação ausente para a etapa: X002/);
});

test('parearEtapas: rejeita avaliação sem etapa (ID desconhecido)', () => {
  const etapas = [{ id: 'X001', fase: 0, fecha: [] }];
  const av = new Map([
    ['X001', 'DONE_VERIFIED'],
    ['X002', 'PARTIAL'],
  ]);
  assert.throws(() => parearEtapas(etapas, av), /avaliação desconhecida \(sem etapa\): X002/);
});

test('verifiedDoneSteps: só DONE_VERIFIED conta como concluída', () => {
  const av = new Map([
    ['X001', 'DONE_VERIFIED'],
    ['X002', 'PARTIAL'],
    ['X003', 'IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE'],
    ['X004', 'VALIDATED_FAIL'],
    ['X005', 'DONE_VERIFIED'],
  ]);
  assert.equal(STATUS_CONCLUIDO, 'DONE_VERIFIED');
  assert.deepEqual([...verifiedDoneSteps(av)].sort(), ['X001', 'X005']);
});

test('verifiedDoneSteps: PARTIAL/IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE/VALIDATED_FAIL seguem abertas mesmo com marcador histórico', () => {
  const etapas = [
    { id: 'X001', fase: 0, fecha: [] },
    { id: 'X002', fase: 0, fecha: [] },
    { id: 'X003', fase: 0, fecha: [] },
  ];
  const avaliacoes = new Map([
    ['X001', 'PARTIAL'],
    ['X002', 'IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE'],
    ['X003', 'VALIDATED_FAIL'],
  ]);
  // Marcador histórico: as três etapas têm commit entregue `(XNNN)` em origin/main —
  // era esse o sinal que o placar antigo tratava como conclusão.
  const marcadores = extractStepIds(
    [
      'feat(talkx): entrega um (X001)',
      'feat(talkx): entrega dois (X002)',
      'feat(talkx): entrega três (X003)',
    ],
    new Set(etapas.map((e) => e.id)),
  );
  assert.equal(marcadores.size, 3);

  const done = verifiedDoneSteps(avaliacoes);
  assert.equal(done.size, 0); // só DONE_VERIFIED conclui — nenhuma das três está
  assert.equal(computeStatus(etapas, [], done).doneCount, 0);
  // O sinal antigo (marcador de entrega) contava as três: era a inflação do placar.
  assert.equal(computeStatus(etapas, [], marcadores).doneCount, 3);
});

test('historicoDivergente: marcador histórico sem DONE_VERIFIED não é conclusão', () => {
  assert.deepEqual(historicoDivergente(new Set(['X002', 'X001']), new Set(['X001'])), ['X002']);
});

test('computeStatus: etapa sem commit fica aberta', () => {
  const etapas = [
    { id: 'X001', fase: 0, fecha: [] },
    { id: 'X002', fase: 0, fecha: [] },
  ];
  const done = new Set(['X001']); // só X001 concluída
  const s = computeStatus(etapas, [], done);
  assert.equal(s.doneCount, 1);
  assert.equal(s.etapas.length, 2);
  assert.equal(s.fases.get(0).concluidas, 1);
  assert.equal(s.fases.get(0).total, 2);
});

test('computeStatus: elemento citado por duas etapas só fecha com as duas em DONE_VERIFIED', () => {
  const etapas = [
    { id: 'X001', fase: 0, fecha: ['T01-001'] },
    { id: 'X002', fase: 0, fecha: ['T01-001'] },
  ];
  const elementos = [{ id: 'T01-001', tela: '01', hoje: 'AUSENTE' }];
  // X002 é PARTIAL: a etapa foi entregue (tem marcador histórico) mas não é verificada.
  const avaliacoes = new Map([
    ['X001', 'DONE_VERIFIED'],
    ['X002', 'PARTIAL'],
  ]);
  const s1 = computeStatus(etapas, elementos, verifiedDoneSteps(avaliacoes));
  assert.equal(s1.telas.get('01').fechados, 0); // parcial citando → aberto
  // O sinal antigo — os dois marcadores de entrega — fecharia o elemento indevidamente.
  const sAntigo = computeStatus(etapas, elementos, new Set(['X001', 'X002']));
  assert.equal(sAntigo.telas.get('01').fechados, 1);
  const s2 = computeStatus(
    etapas,
    elementos,
    verifiedDoneSteps(new Map([['X001', 'DONE_VERIFIED'], ['X002', 'DONE_VERIFIED']])),
  );
  assert.equal(s2.telas.get('01').fechados, 1); // as duas verificadas → fechado
});

test('computeStatus: elemento OK conta como fechado sem citar etapa', () => {
  const elementos = [{ id: 'T01-001', tela: '01', hoje: 'OK' }];
  const s = computeStatus([], elementos, new Set());
  assert.equal(s.telas.get('01').fechados, 1);
});

test('computeStatus: elemento excluído (sem etapa citante, Hoje≠OK) não conta como fechado', () => {
  const elementos = [{ id: 'T01-002', tela: '01', hoje: 'AUSENTE' }];
  const s = computeStatus([], elementos, new Set());
  assert.equal(s.telas.get('01').fechados, 0); // não fecha por vacuidade
  assert.equal(s.telas.get('01').total, 1); // mas segue no total
});

test('computeStatus: IDs CAP-* e dados:* em fecha não afetam o placar por tela', () => {
  const etapas = [{ id: 'X001', fase: 2, fecha: ['CAP-003', 'dados:cidade'] }];
  const s = computeStatus(etapas, [], new Set(['X001']));
  assert.equal(s.doneCount, 1);
  assert.equal(s.elementosTotal, 0);
});

test('generateMarkdown: determinístico, declara P046.json como fonte e não trata marcador histórico como conclusão', () => {
  const etapas = [{ id: 'X001', fase: 0, fecha: [] }];
  const s = computeStatus(etapas, [], new Set(['X001']));
  const a = generateMarkdown(s);
  const b = generateMarkdown(s);
  assert.equal(a, b); // determinístico
  assert.match(a, /# STATUS — Talk X · Plano V4/);
  assert.match(a, /\*\*1 de 1\*\* concluídas/);
  assert.match(a, /docs\/reconciliation\/tasks\/P046\.json/);
  assert.match(a, /DONE_VERIFIED/);
  assert.doesNotMatch(a, /Etapas concluídas = commits/);
});

test('dados reais: P046.json casa 1:1 com etapas.json e o placar conta só DONE_VERIFIED', () => {
  const etapas = loadEtapas();
  const elementos = loadElementos();
  const avaliacoes = loadAvaliacoes();

  assert.equal(etapas.length, 200);
  assert.equal(avaliacoes.size, 200);
  assert.equal(parearEtapas(etapas, avaliacoes).size, 200);

  const done = verifiedDoneSteps(avaliacoes);
  for (const [id, status] of avaliacoes) {
    assert.equal(done.has(id), status === 'DONE_VERIFIED', `etapa ${id} (${status}) contada errado`);
  }

  const s = computeStatus(etapas, elementos, done);
  assert.equal(s.doneCount, done.size);
  assert.deepEqual([...done].sort(), ['X001', 'X005']);

  assert.equal(elementos.length, 1135);
  assert.equal(elementos.filter((e) => e.hoje === 'OK').length, 217);

  const byId = new Set(elementos.map((e) => e.id));
  for (const e of etapas) {
    for (const fid of e.fecha || []) {
      if (/^T\d{2}-\d{3}$/.test(fid)) {
        assert.ok(byId.has(fid), `fecha cita elemento fora do inventário: ${fid} (${e.id})`);
      }
    }
  }
});

test('detectDoneSteps: lê commits de um repositório de fixture', (t) => {
  let dir;
  try {
    dir = mkdtempSync(join(tmpdir(), 'v4-status-'));
    execFileSync(GIT, ['init', '-q'], { cwd: dir });
    execFileSync(GIT, ['config', 'user.email', 't@t.co'], { cwd: dir });
    execFileSync(GIT, ['config', 'user.name', 't'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'x');
    execFileSync(GIT, ['add', '.'], { cwd: dir });
    execFileSync(GIT, ['commit', '-q', '-m', 'docs(talkx): um (X001)'], { cwd: dir });
    writeFileSync(join(dir, 'b.txt'), 'y');
    execFileSync(GIT, ['add', '.'], { cwd: dir });
    execFileSync(GIT, ['commit', '-q', '-m', 'feat(talkx): dois (X002)'], { cwd: dir });
  } catch (e) {
    t.skip(`git indisponível/bloqueado neste ambiente: ${e.message}`);
    return;
  }
  const done = detectDoneSteps('HEAD', new Set(['X001', 'X002']), dir);
  assert.deepEqual([...done].sort((a, b) => a.localeCompare(b)), ['X001', 'X002']);
});
