import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lerContrato, caminhoDoContrato } from '../db-audit/run-runtime-contract.mjs';

const raiz = new URL('../../', import.meta.url);
const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');
const sha256 = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const CONTRATOS = new URL('../../scripts/db-audit/contracts/', import.meta.url);
// Contratos GENERICOS posteriores ao E62 (cópia de generic-migration-runtime.sql, para o pacote autorizado de uma
// versao-alvo). Lista fechada: acrescentar uma versao aqui e' uma decisao revisada no PR, nunca automatica.
const NOVOS_GENERICOS = ['20261004195051.sql'];

test('E62: os 12 contratos sao ARQUIVOS, e o workflow nao tem mais nenhum braco embutido', () => {
  const y = ler('.github/workflows/db-migrate.yml');
  assert.equal(
    /^ {12}\d{14}\)\s*$/m.test(y),
    false,
    'nao pode sobrar braco de versao do case dentro do workflow',
  );
  assert.match(y, /run-runtime-contract\.mjs/, 'o passo tem de chamar o executor generico');
  // o guard continua: a comparacao com o sha confirmado (composicao da E64) sobreviveu
  // (em bash no apply: `if [ "$CONFIRMATION_HASH" != "$CONFIRM_RUNTIME_SHA256" ]`)
  assert.ok(
    y.includes('CONFIRMATION_HASH') && y.includes('CONFIRM_RUNTIME_SHA256'),
    'a comparacao do sha tem de continuar',
  );
  const arquivos = readdirSync(CONTRATOS).filter((f) => f.endsWith('.sql'));
  const historicos = arquivos.filter((f) => !NOVOS_GENERICOS.includes(f));
  assert.equal(historicos.length, 12, `esperava 12 contratos historicos, achei ${historicos.length}`);
  assert.deepEqual(
    arquivos.filter((f) => NOVOS_GENERICOS.includes(f)).sort(),
    [...NOVOS_GENERICOS].sort(),
    'os contratos genericos autorizados tem de existir, e so eles',
  );
  const generico = readFileSync(new URL('../../scripts/db-audit/generic-migration-runtime.sql', import.meta.url), 'utf8');
  for (const f of NOVOS_GENERICOS) {
    assert.equal(readFileSync(new URL(f, CONTRATOS), 'utf8'), generico, `${f} tem de ser identico ao contrato generico`);
  }
});

test('E62: cada contrato e o texto do braco de origem (equivalencia pelo sha do documento)', () => {
  const doc = ler('docs/audits/evidence/db-migrate-contratos-historicos.md');
  const arquivos = readdirSync(CONTRATOS).filter((f) => f.endsWith('.sql') && !NOVOS_GENERICOS.includes(f));
  let comFingerprint = 0;
  for (const f of arquivos) {
    const versao = f.replace('.sql', '');
    const texto = readFileSync(new URL(f, CONTRATOS), 'utf8').replace(/\n$/, '');
    const hash = sha256(texto).slice(0, 16);
    assert.ok(texto.trim().length > 0, `contrato ${versao} nao pode estar vazio`);
    assert.ok(doc.includes(versao), `o documento tem de citar a versao ${versao}`);
    assert.ok(doc.includes(hash), `o documento tem de registrar o sha256 de ${versao} (${hash}...)`);
    if (texto.includes('runtime_sha256')) comFingerprint += 1;
  }
  // Nao todos os alvos extraem o MESMO campo: 7 dos 12 trazem runtime_sha256 e os
  // outros 5 extraem outro fingerprint do mesmo guard. Exigir o campo em todos seria
  // inventar uma simetria que o contrato de origem nao tem.
  assert.ok(comFingerprint >= 7, `esperava ao menos 7 contratos com runtime_sha256, achei ${comFingerprint}`);
});

test('E62: o executor e FAIL-CLOSED — versao sem contrato nao vira "nada a verificar"', () => {
  // versao valida em formato, sem arquivo de contrato
  assert.throws(() => lerContrato('20990101000000'), /contrato de runtime ausente/);
  // versao em formato invalido
  assert.throws(() => lerContrato('abc'), /versao alvo invalida/);
  assert.throws(() => lerContrato(''), /versao alvo invalida/);
  assert.throws(() => caminhoDoContrato('20260830170000x'), /versao alvo invalida/);
  // e o CLI de verdade: exit 2, sem resultado em stdout
  const r = spawnSync(process.execPath, ['scripts/db-audit/run-runtime-contract.mjs', '20990101000000'], {
    cwd: new URL('../../', import.meta.url).pathname,
    encoding: 'utf8',
  });
  assert.equal(r.status, 2, 'versao sem contrato tem de sair com 2');
  assert.equal(r.stdout.trim(), '', 'nao pode imprimir resultado para o workflow');
});

test('E62: o contrato da versao 20260830170000 existe e nao esta vazio', () => {
  const sql = lerContrato('20260830170000');
  assert.ok(sql.trim().length > 100, 'contrato tem de ter conteudo real');
  assert.ok(existsSync(new URL('20260830170000.sql', CONTRATOS)));
});

import { lerContratoComFallback } from '../db-audit/run-runtime-contract.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// W29: sem arquivo dedicado → fallback para o contrato generico; arquivo vazio → fail-closed.
test('W29: lerContratoComFallback usa o generico para versao sem contrato dedicado', () => {
  const r = lerContratoComFallback('20990101000000');
  assert.equal(r.tipo, 'generic', 'tipo deve ser generic');
  assert.ok(r.sql.includes('generic-migration-runtime') || r.sql.includes('structure_sha256'),
    'sql deve ser o contrato generico');
});

test('W29: lerContratoComFallback falha fechado para arquivo dedicado VAZIO', () => {
  const tmp = mkdtempSync(tmpdir() + '/w29-');
  try {
    writeFileSync(tmp + '/20990101000001.sql', '');
    assert.throws(
      () => lerContratoComFallback('20990101000001', tmp),
      /contrato vazio/,
      'arquivo vazio deve lancar erro',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('W29: lerContratoComFallback devolve o contrato dedicado quando o arquivo existe', () => {
  const r = lerContratoComFallback('20260830170000');
  assert.equal(r.tipo, 'dedicado', 'tipo deve ser dedicado');
  assert.ok(r.sql.trim().length > 100, 'sql do contrato dedicado nao pode estar vazio');
});

import { lerExpect, testarCampo, avaliarContraExpect } from '../db-audit/run-runtime-contract.mjs';
import { join } from 'node:path';

// W28: testes do sistema de .expect.json
const VERSOES_EXPECT = [
  '20260830170000','20260831120000','20260831150000','20260908180000','20260908220000',
  '20260909120000','20260909180000','20260909200000','20260909210000','20260909230000',
  '20260910100000','20260922220000',
];

test('W28: os 12 arquivos .expect.json existem e sao JSON valido', () => {
  for (const v of VERSOES_EXPECT) {
    const ex = lerExpect(v);
    assert.ok(ex !== null, `${v}.expect.json deve existir`);
    assert.ok(typeof ex === 'object', `${v}.expect.json deve ser um objeto`);
    // deve ter ao menos uma secao
    assert.ok(ex.always || ex.before || ex.after,
      `${v}.expect.json deve ter ao menos uma secao (always, before, ou after)`);
  }
});

test('W28: lerExpect retorna null para versao sem .expect.json', () => {
  const r = lerExpect('20990101000000');
  assert.equal(r, null, 'versao sem expect.json deve devolver null');
});

test('W28: testarCampo — comparacao literal', () => {
  assert.equal(testarCampo('x', 5, 5), null);
  assert.equal(testarCampo('x', 'ok', 'ok'), null);
  assert.match(testarCampo('x', 4, 5), /esperado/);
  assert.match(testarCampo('x', false, true), /esperado/);
});

test('W28: testarCampo — $regex', () => {
  assert.equal(testarCampo('h', 'abc123', { $regex: '^[a-z0-9]+$' }), null);
  assert.match(testarCampo('h', 'ABC', { $regex: '^[a-z]+$' }), /nao casa com/);
});

test('W28: testarCampo — $min / $max', () => {
  assert.equal(testarCampo('n', 5, { $min: 3 }), null);
  assert.equal(testarCampo('n', 5, { $max: 10 }), null);
  assert.equal(testarCampo('n', 5, { $min: 3, $max: 10 }), null);
  assert.match(testarCampo('n', 2, { $min: 3 }), /minimo/);
  assert.match(testarCampo('n', 11, { $max: 10 }), /maximo/);
});

test('W28: testarCampo — $any', () => {
  assert.equal(testarCampo('v', 2, { $any: [1, 2, 4] }), null);
  assert.match(testarCampo('v', 3, { $any: [1, 2, 4] }), /nao esta em/);
});

test('W28: avaliarContraExpect — always sempre verificado', () => {
  const ex = { always: { count: 3 } };
  assert.deepEqual(avaliarContraExpect({ count: 3 }, ex, true), { ok: true });
  assert.deepEqual(avaliarContraExpect({ count: 3 }, ex, false), { ok: true });
  const fail = avaliarContraExpect({ count: 2 }, ex, false);
  assert.equal(fail.ok, false);
  assert.ok(fail.falhas[0].includes('count'));
});

test('W28: avaliarContraExpect — before/after seleciona pelo needsApply', () => {
  const ex = { before: { x: 0 }, after: { x: 1 } };
  assert.deepEqual(avaliarContraExpect({ x: 0 }, ex, true), { ok: true });
  assert.deepEqual(avaliarContraExpect({ x: 1 }, ex, false), { ok: true });
  assert.equal(avaliarContraExpect({ x: 1 }, ex, true).ok, false);
  assert.equal(avaliarContraExpect({ x: 0 }, ex, false).ok, false);
});

test('W28: avaliarContraExpect — $eq_field compara dois campos do proof', () => {
  const ex = { always: { a: { $eq_field: 'b' } } };
  assert.deepEqual(avaliarContraExpect({ a: 5, b: 5 }, ex, false), { ok: true });
  const fail = avaliarContraExpect({ a: 3, b: 5 }, ex, false);
  assert.equal(fail.ok, false);
  assert.match(fail.falhas[0], /a/);
});

test('W28: o YAML nao tem mais o NODE heredoc inline (W28 pin)', () => {
  const y = ler('.github/workflows/db-migrate.yml');
  // O heredoc de 640 linhas foi removido; so o run-runtime-contract.mjs fica
  assert.doesNotMatch(y, /RUNTIME_JSON=.*node --input-type=module/, 'NODE heredoc inline deve ter sido removido');
  assert.match(y, /node scripts\/db-audit\/run-runtime-contract\.mjs/, 'executor deve ser chamado sem argumentos');
});
