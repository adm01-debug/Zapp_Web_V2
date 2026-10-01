import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadEtapas,
  loadElementos,
  extractStepIds,
  detectDoneSteps,
  computeStatus,
  generateMarkdown,
} from './v4-status.mjs';

const IDS = new Set(['X001', 'X002', 'X003']);

test('extractStepIds: título com (X001) vira etapa concluída (inclusive com sufixo de squash)', () => {
  const done = extractStepIds(
    ['docs(talkx): plano V4 vigente (X001) (#1451)'],
    IDS,
  );
  assert.deepEqual([...done], ['X001']);
});

test('extractStepIds: título com (X999) → erro "etapa inexistente"', () => {
  assert.throws(
    () => extractStepIds(['feat: algo (X999)'], IDS),
    /etapa inexistente: X999/,
  );
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

test('computeStatus: elemento citado por duas etapas só fecha com as duas concluídas', () => {
  const etapas = [
    { id: 'X001', fase: 0, fecha: ['T01-001'] },
    { id: 'X002', fase: 0, fecha: ['T01-001'] },
  ];
  const elementos = [{ id: 'T01-001', tela: '01', hoje: 'AUSENTE' }];
  const s1 = computeStatus(etapas, elementos, new Set(['X001']));
  assert.equal(s1.telas.get('01').fechados, 0); // só uma das duas → aberto
  const s2 = computeStatus(etapas, elementos, new Set(['X001', 'X002']));
  assert.equal(s2.telas.get('01').fechados, 1); // as duas → fechado
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

test('generateMarkdown: determinístico e contém as contagens', () => {
  const etapas = [{ id: 'X001', fase: 0, fecha: [] }];
  const s = computeStatus(etapas, [], new Set(['X001']));
  const a = generateMarkdown(s);
  const b = generateMarkdown(s);
  assert.equal(a, b); // determinístico
  assert.match(a, /# STATUS — Talk X · Plano V4/);
  assert.match(a, /\*\*1 de 1\*\* concluídas/);
});

test('dados reais: 200 etapas, 1135 elementos (217 OK) e todo T do fecha existe no inventário', () => {
  const etapas = loadEtapas();
  const elementos = loadElementos();
  assert.equal(etapas.length, 200);
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
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t.co'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'x');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'docs(talkx): um (X001)'], { cwd: dir });
    writeFileSync(join(dir, 'b.txt'), 'y');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'feat(talkx): dois (X002)'], { cwd: dir });
  } catch (e) {
    t.skip(`git indisponível/bloqueado neste ambiente: ${e.message}`);
    return;
  }
  const done = detectDoneSteps('HEAD', new Set(['X001', 'X002']), dir);
  assert.deepEqual([...done].sort(), ['X001', 'X002']);
});
