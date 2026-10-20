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
  assert.match(y, /confirmacao !== process\.env\.CONFIRM_RUNTIME_SHA256/, 'a comparacao do sha tem de continuar');
  assert.match(y, /if \(process\.env\.APPLY === 'true'/, 'e continuar condicionada ao apply');
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
