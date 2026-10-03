/**
 * S8707 — Path Traversal em `redigir-log.mjs`.
 *
 * O script recebe o caminho do log por argumento de CLI e faz `readFileSync` **e
 * `writeFileSync`** nesse caminho. Sem confinamento, um caminho com `..` ou absoluto
 * fora do diretorio de trabalho faz o script SOBRESCREVER ARQUIVO ARBITRARIO com o
 * conteudo "redigido" -- nao e vazamento, e destruicao de arquivo, e o caminho entra
 * por argumento, que e entrada nao confiavel por definicao.
 *
 * O uso legitimo e' exatamente um (deploy-functions.yml:491): caminho absoluto dentro
 * de $RUNNER_TEMP/edge-deployment-evidence/. O confinamento usa REDIGIR_LOG_BASE.
 *
 * Vermelho-antes: os casos de ataque FALHAM enquanto nao houver confinamento, porque
 * hoje o script aceita e escreve em qualquer caminho existente.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(AQUI, 'redigir-log.mjs');

function rodar(arquivo, base) {
  return spawnSync(process.execPath, [SCRIPT, arquivo, '--segredo-env=SUPABASE_ACCESS_TOKEN'], {
    encoding: 'utf8',
    env: { ...process.env, REDIGIR_LOG_BASE: base, SUPABASE_ACCESS_TOKEN: '' },
    cwd: tmpdir(),
  });
}

test('S8707: recusa caminho relativo que escapa da base com ..', () => {
  const base = mkdtempSync(join(tmpdir(), 'redigir-base-'));
  const fora = mkdtempSync(join(tmpdir(), 'redigir-fora-'));
  const alvo = join(fora, 'deploy-output.log');
  writeFileSync(alvo, 'access_token=segredo\n');
  const antes = readFileSync(alvo, 'utf8');

  const escapeRelativo = join('..', '..', fora.split('/').pop(), 'deploy-output.log');
  const r = rodar(escapeRelativo, base);

  assert.notEqual(r.status, 0, 'caminho com .. deve ser recusado (hoje ele e aceito)');
  assert.equal(readFileSync(alvo, 'utf8'), antes, 'o arquivo de fora NAO pode ser tocado');
});

test('S8707: recusa caminho absoluto fora da base', () => {
  const base = mkdtempSync(join(tmpdir(), 'redigir-base-'));
  const fora = mkdtempSync(join(tmpdir(), 'redigir-fora-'));
  const alvo = join(fora, 'deploy-output.log');
  writeFileSync(alvo, 'access_token=segredo\n');
  const antes = readFileSync(alvo, 'utf8');

  const r = rodar(alvo, base);

  assert.notEqual(r.status, 0, 'caminho absoluto fora da base deve ser recusado');
  assert.equal(readFileSync(alvo, 'utf8'), antes, 'o arquivo de fora NAO pode ser tocado');
});

test('S8707: caminho dentro da base continua sendo ACEITO (nao virar sempre-recusa)', () => {
  const base = mkdtempSync(join(tmpdir(), 'redigir-base-'));
  const dentro = join(base, 'deploy-output.log');
  writeFileSync(dentro, 'linha com access_token=LEAK1234567890 no meio\n');

  const r = rodar(dentro, base);

  assert.equal(r.status, 0, `deve aceitar caminho dentro da base; stderr=${r.stderr}`);
  const depois = readFileSync(dentro, 'utf8');
  assert.ok(!depois.includes('LEAK1234567890'), 'deve redigir o valor do que estava no arquivo');
});

test('S8707: recusa caminho que nao existe, sem criar arquivo', () => {
  const base = mkdtempSync(join(tmpdir(), 'redigir-base-'));
  const inexistente = join(base, 'nao-existe.log');

  const r = rodar(inexistente, base);

  assert.notEqual(r.status, 0, 'arquivo ausente e erro, nao criacao silenciosa');
  assert.equal(existsSync(inexistente), false, 'nao pode criar arquivo no caminho do ataque');
});

test('S8707: recusa travessia por symlink que aponta para fora da base', () => {
  const base = mkdtempSync(join(tmpdir(), 'redigir-base-'));
  const fora = mkdtempSync(join(tmpdir(), 'redigir-fora-'));
  const real = join(fora, 'deploy-output.log');
  writeFileSync(real, 'access_token=segredo\n');
  const antes = readFileSync(real, 'utf8');

  let link;
  try {
    link = join(base, 'ataque.log');
    symlinkSync(real, link);
  } catch {
    // ambiente sem permissao de symlink: o caso nao se aplica, mas nao pode passar em silencio
    console.log('# symlink indisponivel neste ambiente -- caso pulado de proposito');
    return;
  }

  const r = rodar(link, base);
  assert.notEqual(r.status, 0, 'symlink para fora da base deve ser recusado');
  assert.equal(readFileSync(real, 'utf8'), antes, 'o alvo real NAO pode ser sobrescrito');
});
