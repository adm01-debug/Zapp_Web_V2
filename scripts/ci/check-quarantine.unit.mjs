import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  carregarQuarentena,
  hojeISO,
  specsEmQuarentena,
  validar,
} from './check-quarantine.mjs';

const HOJE = '2026-10-03';
const item = (extra = {}) => ({
  spec: 'e2e/auth.spec.ts', // existe de verdade no repositorio
  motivo: 'flaky conhecido na fila de mensagens',
  issue: 1234,
  prazo: '2026-12-01',
  ...extra,
});

test('E87: hojeISO devolve data sem fuso do ambiente', () => {
  assert.equal(hojeISO(new Date('2026-10-03T23:59:00Z')), '2026-10-03');
  assert.match(hojeISO(), /^\d{4}-\d{2}-\d{2}$/u);
});

test('E87: item valido e futuro passa', () => {
  assert.deepEqual(validar([item()], { hoje: HOJE }), []);
});

test('E87: prazo vencido FALHA -- e a razao de existir do verificador', () => {
  const problemas = validar([item({ prazo: '2026-10-02' })], { hoje: HOJE });
  assert.equal(problemas.length, 1);
  assert.match(problemas[0], /prazo vencido em 2026-10-02/);
  assert.match(problemas[0], /#1234/, 'a mensagem tem de dizer qual issue acompanha');
});

test('E87: item no proprio dia ainda vale (vencido e o dia seguinte)', () => {
  assert.deepEqual(validar([item({ prazo: HOJE })], { hoje: HOJE }), []);
});

test('E87: sem motivo ou sem issue o item e recusado -- senao e skip disfarcado', () => {
  assert.match(validar([item({ motivo: '' })], { hoje: HOJE })[0], /sem motivo/);
  assert.match(validar([item({ issue: undefined })], { hoje: HOJE })[0], /sem issue/);
  assert.match(validar([{}], { hoje: HOJE })[0], /sem spec, motivo, issue, prazo/);
});

test('E87: spec inexistente e prazo malformado tambem falham', () => {
  assert.match(validar([item({ spec: 'e2e/nao-existe.spec.ts' })], { hoje: HOJE })[0], /nao existe no repositorio/);
  assert.match(validar([item({ prazo: '01/12/2026' })], { hoje: HOJE })[0], /nao esta em AAAA-MM-DD/);
});

test('E87: specsEmQuarentena devolve os caminhos, ordenados', () => {
  const lista = specsEmQuarentena([item({ spec: 'e2e/z.spec.ts' }), item({ spec: 'e2e/a.spec.ts' }), {}]);
  assert.deepEqual(lista, ['e2e/a.spec.ts', 'e2e/z.spec.ts']);
});

test('E87: arquivo ausente nao derruba o CI -- vira aviso', () => {
  const vazio = join(tmpdir(), 'sem-quarentena-mesmo-99');
  mkdirSync(vazio, { recursive: true });
  const r = carregarQuarentena(vazio, 'e2e/quarantine.json');
  assert.deepEqual(r.itens, []);
  assert.equal(r.avisos.length, 1);
});

test('E87: o repositorio real esta em conformidade hoje', () => {
  const { itens, avisos } = carregarQuarentena();
  assert.deepEqual(avisos, [], 'e2e/quarantine.json tem de existir');
  assert.ok(Array.isArray(itens));
  assert.deepEqual(
    validar(itens, { hoje: hojeISO() }),
    [],
    'se falhar, tem item de quarentena vencido ou malformado no repositorio',
  );
});

test('E87: o schema do arquivo real documenta os quatro campos', () => {
  const cru = JSON.parse(readFileSync(new URL('../../e2e/quarantine.json', import.meta.url), 'utf8'));
  for (const campo of ['spec', 'motivo', 'issue', 'prazo']) {
    assert.ok(cru._campos?.[campo], `o arquivo tem de documentar o campo ${campo}`);
  }
  assert.deepEqual(cru.quarentena, []);
});
