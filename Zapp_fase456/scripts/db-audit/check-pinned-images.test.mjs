// GA67: contrato — nenhuma imagem sem @sha256 em scripts/db-audit.
// Ponto cego medido (W57/X034): testes caiam no `postgres:17-alpine` do
// Docker Hub e no PostgREST do ECR por tag, sem reproducibilidade.
// O que e' imagem puxavel: defaults `${VAR:-imagem}` e argumentos de
// `docker run/pull`. Nao contam: comentarios, linhas de printf/echo/fail
// (rotulos de log) e este proprio arquivo (a regex vive aqui).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)));
const PROPRIO = 'check-pinned-images.test.mjs';
// Base sem digest = violacao; com @sha256: = ok.
const SEM_DIGEST = /(postgres:17-alpine|postgrest:v[0-9][\w.]*|postgres-meta:v[0-9][\w.]*)(?!@sha256:)(?![\w.@-])/;
// O segundo lookahead impede o backtracking de casar prefixo de versao pinada
// (ex.: `v14.` dentro de `v14.5@sha256:...`): toda parada no meio da versao ou
// do digest e' seguida de [\w.@-] e falha.

function linhasUteis(nome, texto) {
  const mjs = nome.endsWith('.mjs');
  const fora = [];
  for (const [i, linha] of texto.split('\n').entries()) {
    const t = linha.trim();
    if (t === '') continue;
    if (t.startsWith('#')) continue; // comentario shell
    if (mjs && (t.startsWith('//') || t.startsWith('*'))) continue; // comentario js
    // Rotulo de log, nao pull: 'harness (postgres:17-alpine)', mensagens de fail.
    if (/^\s*(printf|echo)\b/.test(linha)) continue;
    if (/^\s*fail\b/.test(t)) continue;
    fora.push([i + 1, linha]);
  }
  return fora;
}

export function violacoesSemDigest(arquivos) {
  const achados = [];
  for (const [nome, texto] of arquivos) {
    if (nome === PROPRIO) continue;
    for (const [lin, linha] of linhasUteis(nome, texto)) {
      const m = SEM_DIGEST.exec(linha);
      if (m) achados.push(`${nome}:${lin}: ${m[1]} sem @sha256`);
    }
  }
  return achados;
}

test('GA67: nenhuma imagem sem digest em scripts/db-audit', () => {
  const arquivos = readdirSync(DIR)
    .filter((f) => f.endsWith('.sh') || f.endsWith('.mjs'))
    .map((f) => [f, readFileSync(join(DIR, f), 'utf8')]);
  assert.ok(arquivos.length > 50, 'o contrato precisa enxergar a suite');
  assert.deepEqual(violacoesSemDigest(arquivos), []);
});

test('GA67: o detector pega default, docker run e literal — e ignora comentario/log', () => {
  const arquivos = [
    ['a.test.sh', 'img="${X:-postgres:17-alpine}"'],
    ['b.test.sh', 'docker run --rm postgres:17-alpine >/dev/null'],
    ['c.test.mjs', "const i = x ?? 'postgres:17-alpine';"],
    ['d.test.sh', '# harness (postgres:17-alpine)'],
    ['e.test.sh', "printf 'harness (postgres:17-alpine)\\n'"],
    ['f.test.sh', 'img="${X:-postgres:17-alpine@sha256:abc123}"'],
    [PROPRIO, 'postgres:17-alpine'],
  ];
  assert.deepEqual(violacoesSemDigest(arquivos), [
    'a.test.sh:1: postgres:17-alpine sem @sha256',
    'b.test.sh:1: postgres:17-alpine sem @sha256',
    'c.test.mjs:1: postgres:17-alpine sem @sha256',
  ]);
});
