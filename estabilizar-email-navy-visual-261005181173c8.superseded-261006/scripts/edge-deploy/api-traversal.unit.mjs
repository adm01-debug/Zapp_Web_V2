/**
 * S7044 — "API Traversal" em `register-deployment.mjs`.
 *
 * O rotulo do Sonar fala em "unsanitized user input", mas o achado real e' outro: o
 * destino da requisicao vem de `process.env.GITHUB_API_URL`, e a requisicao carrega
 * `Authorization: Bearer ${GITHUB_TOKEN}`. Quem controlar essa variavel de ambiente no
 * runner recebe o TOKEN no header, no host dele. Nao e' travessia de caminho: e'
 * exfiltracao de credencial por redirecionamento de destino.
 *
 * Correcao: allowlist de host (api.github.com ou o host do GitHub Enterprise derivado de
 * GITHUB_SERVER_URL), https obrigatorio, caminho comecando com '/' e sem '..'.
 *
 * Vermelho-antes: o script hoje aceita `GITHUB_API_URL=http://atacante.local` e tenta a
 * requisicao com o token no header. O teste prova que ele nao chega a tentar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolverDestino } from './register-deployment.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(AQUI, 'register-deployment.mjs');

function rodar(env) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GITHUB_REPOSITORY: 'dono/repo',
      GITHUB_RUN_ID: '123',
      GITHUB_TOKEN: 'token-falso-para-teste',
      GITHUB_SERVER_URL: 'https://github.com',
      // sha valido: sem ele o script sai antes, na validacao do sha, e nunca chega ao
      // ponto onde o destino e' montado -- foi assim que este teste falhou na 1a vez
      DEPLOYED_GIT_SHA: 'a'.repeat(40),
      ...env,
    },
    cwd: AQUI,
    timeout: 15000,
  });
}

// ---------------------------------------------------------------- unitario do validador

test('S7044: aceita https://api.github.com', () => {
  assert.equal(resolverDestino('https://api.github.com', '/repos/a/b/deployments'),
    'https://api.github.com/repos/a/b/deployments');
});

test('S7044: RECUSA host do atacante (o caso do enunciado)', () => {
  // recusa por https E por host: as duas razoes sao legitimas, e a ordem entre elas
  // nao importa -- o que importa e' nao montar o destino
  assert.throws(() => resolverDestino('http://atacante.local', '/repos/a/b/deployments'),
    /nao permitido|exige https|host/i);
});

test('S7044: recusa host parecido com github.com mas que nao e', () => {
  for (const malicioso of [
    'https://api.github.com.atacante.local',
    'https://atacante.local/api.github.com',
    'https://api-github.com',
    'https://api.github.com.evil.tld',
  ]) {
    assert.throws(() => resolverDestino(malicioso, '/repos/a/b/deployments'),
      /nao permitido|host/i,
      `deveria recusar: ${malicioso}`);
  }
});

test('S7044: recusa http (sem TLS) mesmo no host correto, porque o token iria em claro', () => {
  assert.throws(() => resolverDestino('http://api.github.com', '/repos/a/b/deployments'),
    /https/i);
});

test('S7044: recusa caminho com travessia ou que nao comeca com /', () => {
  for (const caminho of ['repos/a/b', '/repos/../../etc', '/../repos', '/a/./../b']) {
    assert.throws(() => resolverDestino('https://api.github.com', caminho),
      /caminho/i, `deveria recusar caminho: ${caminho}`);
  }
});

test('S7044: ACEITA GitHub Enterprise derivado de GITHUB_SERVER_URL', () => {
  assert.equal(
    resolverDestino('https://ghe.empresa.com/api/v3', '/repos/a/b/deployments',
      'https://ghe.empresa.com'),
    'https://ghe.empresa.com/api/v3/repos/a/b/deployments');

  assert.throws(
    () => resolverDestino('https://outro.com/api/v3', '/repos/a/b', 'https://ghe.empresa.com'),
    /nao permitido|host/i);
});

// ------------------------------------------------- fim-a-fim: prova de que o token nao sai

test('S7044: o SCRIPT recusa GITHUB_API_URL=http://atacante.local antes de qualquer fetch', () => {
  const r = rodar({ GITHUB_API_URL: 'http://atacante.local' });
  const saida = r.stdout + r.stderr;

  assert.ok(!/ENOTFOUND|ECONNREFUSED|fetch failed|getaddrinfo/i.test(saida),
    `o script TENTOU a requisicao com o token: ${saida.slice(0, 300)}`);
  assert.ok(/atacante\.local/.test(saida), 'a recusa deve nomear o host recusado');
  assert.ok(!saida.includes('token-falso-para-teste'), 'o token nunca pode aparecer na saida');
});

test('S7044: com o host legitimo, o destino montado e o do GitHub', () => {
  assert.equal(
    resolverDestino('https://api.github.com', '/repos/dono/repo/deployments/1/statuses'),
    'https://api.github.com/repos/dono/repo/deployments/1/statuses');
});
