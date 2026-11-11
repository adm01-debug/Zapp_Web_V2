import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('E87: arquivo ausente nao derruba o CI -- vira aviso', async () => {
  const vazio = join(tmpdir(), 'sem-quarentena-mesmo-99');
  mkdirSync(vazio, { recursive: true });
  const r = await carregarQuarentena(vazio, 'e2e/quarantine.js');
  assert.deepEqual(r.itens, []);
  assert.equal(r.avisos.length, 1);
});

test('E87: o repositorio real esta em conformidade hoje', async () => {
  const { itens, avisos } = await carregarQuarentena();
  assert.deepEqual(avisos, [], 'e2e/quarantine.js tem de existir');
  assert.ok(Array.isArray(itens));
  assert.deepEqual(
    validar(itens, { hoje: hojeISO() }),
    [],
    'se falhar, tem item de quarentena vencido ou malformado no repositorio',
  );
});

test('E87: o modulo quarantine.js exporta a lista quarentena', async () => {
  const mod = await import(new URL('../../e2e/quarantine.js', import.meta.url));
  assert.ok(Array.isArray(mod.quarentena), 'quarantine.js exporta quarentena como array');
});

const temporarios = [];
after(() => {
  for (const raiz of temporarios) rmSync(raiz, { recursive: true, force: true });
});

function fixture() {
  const raiz = mkdtempSync(join(tmpdir(), 'quarentena # '));
  temporarios.push(raiz);
  mkdirSync(join(raiz, 'e2e'));
  writeFileSync(join(raiz, 'e2e', 'auth.spec.ts'), '');
  return raiz;
}

const raizFixture = fixture();
const cenarios = [
  ['item valido', {}, true],
  ['vence hoje', { prazo: HOJE }, true],
  ['vencido', { prazo: '2026-10-02' }, false],
  ['bissexto', { prazo: '2028-02-29' }, true],
  ['fevereiro 30', { prazo: '2027-02-30' }, false],
  ['ano nao bissexto', { prazo: '2027-02-29' }, false],
  ['abril 31', { prazo: '2027-04-31' }, false],
  ['mes 13', { prazo: '2027-13-01' }, false],
  ['mes zero', { prazo: '2027-00-01' }, false],
  ['dia 32', { prazo: '2027-12-32' }, false],
  ['data sem zeros', { prazo: '2027-1-1' }, false],
  ['data numerica', { prazo: 20271201 }, false],
  ['data null', { prazo: null }, false],
  ['motivo ausente', { motivo: undefined }, false],
  ['motivo vazio', { motivo: '' }, false],
  ['motivo espacos', { motivo: '  ' }, false],
  ['motivo null', { motivo: null }, false],
  ['motivo objeto', { motivo: {} }, false],
  ['issue ausente', { issue: undefined }, false],
  ['issue zero', { issue: 0 }, false],
  ['issue negativa', { issue: -4 }, false],
  ['issue decimal', { issue: 1.5 }, false],
  ['issue como string numerica mantem compatibilidade', { issue: '1234' }, true],
  ['issue objeto', { issue: {} }, false],
  ['issue fora do limite inteiro', { issue: Number.MAX_SAFE_INTEGER + 1 }, false],
  ['spec inexistente', { spec: 'e2e/inexistente.spec.ts' }, false],
  ['spec diretorio', { spec: '.' }, false],
  ['spec absoluto', { spec: join(raizFixture, 'e2e/auth.spec.ts') }, false],
  ['spec absoluto Windows', { spec: 'C:\\repo\\e2e\\auth.spec.ts' }, false],
  ['spec fora da raiz', { spec: '../fora.spec.ts' }, false],
  ['spec numerico', { spec: 12 }, false],
  ['spec objeto', { spec: {} }, false],
  ['spec null', { spec: null }, false],
];

for (const [nome, extra, aceita] of cenarios) {
  test(`E87: matriz de validacao recusa gaps -- ${nome}`, () => {
    const problemas = validar([item(extra)], { raiz: raizFixture, hoje: HOJE });
    assert.equal(problemas.length === 0, aceita, problemas.join('\n'));
  });
}

test('E87: symlink para arquivo fora da raiz nao vale como spec do repositorio', () => {
  const raiz = fixture();
  const externo = fixture();
  symlinkSync(join(externo, 'e2e/auth.spec.ts'), join(raiz, 'e2e/externo.spec.ts'));
  const problemas = validar([item({ spec: 'e2e/externo.spec.ts' })], { raiz, hoje: HOJE });
  assert.match(problemas[0], /spec deve ficar dentro do repositorio/u);
});

for (const hoje of ['foo', '2026-02-30', '2026-13-01', '', null]) {
  test(`E87: data de referencia invalida ${JSON.stringify(hoje)} falha mesmo com lista vazia`, () => {
    assert.match(validar([], { hoje })[0], /hoje .* nao e uma data valida/u);
  });
}

for (const itens of [null, {}, '', 12]) {
  test(`E87: lista malformada ${JSON.stringify(itens)} falha sem excecao`, () => {
    assert.deepEqual(validar(itens, { hoje: HOJE }), ['quarentena deve ser uma lista']);
  });
}

test('E87: URL de import aceita espacos e # no caminho do arquivo', async () => {
  const raiz = fixture();
  writeFileSync(join(raiz, 'e2e', 'quarantine.mjs'), 'export const quarentena = [];');
  assert.deepEqual(await carregarQuarentena(raiz, 'e2e/quarantine.mjs'), { itens: [], avisos: [] });
});

for (const fonte of ['export const quarentena = {};', 'export const outra = [];', 'export const quarentena = null;']) {
  test(`E87: exportacao malformada nao vira lista vazia -- ${fonte}`, async () => {
    const raiz = fixture();
    writeFileSync(join(raiz, 'e2e', 'quarantine.mjs'), fonte);
    await assert.rejects(carregarQuarentena(raiz, 'e2e/quarantine.mjs'), /deve exportar quarentena como lista/u);
  });
}

test('E87: CLI real rejeita --hoje invalido e aceita data valida', () => {
  const script = fileURLToPath(new URL('./check-quarantine.mjs', import.meta.url));
  const invalido = spawnSync(process.execPath, [script, '--hoje=2026-02-30'], { encoding: 'utf8' });
  assert.notEqual(invalido.status, 0, invalido.stderr);
  assert.match(invalido.stderr, /hoje .* nao e uma data valida/u);
  const valido = spawnSync(process.execPath, [script, '--hoje=2026-10-03'], { encoding: 'utf8' });
  assert.equal(valido.status, 0, valido.stderr);
});

const cliCenarios = [
  [[], false],
  [['--hoje=2026-10-03'], false],
  [['--hoje=2028-02-29'], false],
  [['--hoje=2026-02-30'], true],
  [['--hoje=2027-02-29'], true],
  [['--hoje=2026-13-01'], true],
  [['--hoje=foo'], true],
  [['--hoje='], true],
  [['--hoje'], true],
  [['--outro'], true],
  [['valor'], true],
  [['--json=true'], true],
  [['--hoje=2026-10-03', '--hoje=2026-10-04'], true],
];

for (const [args, falha] of cliCenarios) {
  for (const json of [false, true]) {
    test(`E87: CLI valida ${JSON.stringify(args)} em modo ${json ? 'JSON' : 'humano'}`, () => {
      const script = fileURLToPath(new URL('./check-quarantine.mjs', import.meta.url));
      const resultado = spawnSync(process.execPath, [script, ...args, ...(json ? ['--json'] : [])], { encoding: 'utf8' });
      assert.equal(resultado.status !== 0, falha, resultado.stdout + resultado.stderr);
      if (json) {
        const dados = JSON.parse(resultado.stdout);
        assert.equal(dados.ok, !falha);
        assert.equal(Array.isArray(dados.avisos), true);
        assert.equal(dados.problemas.length > 0, falha);
        assert.equal(resultado.stderr, '');
      }
    });
  }
}

test('E87: CLI JSON rejeita flag repetida e aceita flags nas duas ordens', () => {
  const script = fileURLToPath(new URL('./check-quarantine.mjs', import.meta.url));
  for (const args of [['--json', '--hoje=2026-10-03'], ['--hoje=2026-10-03', '--json']]) {
    const resultado = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(resultado.status, 0, resultado.stderr);
    assert.equal(JSON.parse(resultado.stdout).hoje, '2026-10-03');
  }
  const repetido = spawnSync(process.execPath, [script, '--json', '--json'], { encoding: 'utf8' });
  assert.notEqual(repetido.status, 0);
  assert.match(JSON.parse(repetido.stdout).problemas[0], /argumento repetido/u);
});

test('E87: CLI JSON preserva aviso de arquivo ausente e reporta exportacao malformada', () => {
  const raiz = fixture();
  const pasta = join(raiz, 'scripts', 'ci');
  mkdirSync(pasta, { recursive: true });
  const script = join(pasta, 'check-quarantine.mjs');
  copyFileSync(fileURLToPath(new URL('./check-quarantine.mjs', import.meta.url)), script);
  const ausente = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8' });
  const dados = JSON.parse(ausente.stdout);
  assert.equal(ausente.status, 0, ausente.stderr);
  assert.equal(dados.ok, true);
  assert.equal(dados.avisos.length, 1);
  assert.equal(dados.total, 0);
  writeFileSync(join(raiz, 'e2e', 'quarantine.js'), 'export const quarentena = {};');
  const malformado = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8' });
  assert.notEqual(malformado.status, 0);
  assert.equal(malformado.stderr, '');
  assert.match(JSON.parse(malformado.stdout).problemas[0], /deve exportar quarentena como lista/u);
});
