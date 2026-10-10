/**
 * S5145 — Log Injection nos valores vindos da API do GitHub.
 *
 * Os quatro pontos apontados pelo Sonar sao de duas familias, e a segunda e' a mais seria:
 *
 *   1. `::notice::` / `::warning::` — o console.log de um valor que veio da API. No Actions
 *      essas linhas sao COMANDOS de workflow: um `\n` no valor forja um comando novo,
 *      inclusive um `::error::` ou um `::set-output::`.
 *   2. `GITHUB_OUTPUT` — a linha 92 do register-deployment escreve `deployment_id=${dep.id}`.
 *      O Sonar NAO aponta essa linha, e ela e' o vetor mais grave: o protocolo do arquivo e'
 *      `nome=valor` por linha, entao um `\n` no valor abre uma VARIAVEL NOVA no job seguinte.
 *
 * O guard de settings (github-settings-guard.mjs) ja resolve isso com `semQuebra`; os dois
 * scripts desta frente nao tem equivalente. E' o mesmo defeito em outro lugar.
 *
 * Vermelho-antes: com um stub de API devolvendo `\n::error::forged`, a linha forjada
 * aparece e o GITHUB_OUTPUT ganha uma linha extra.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const REGISTER = resolve(AQUI, 'register-deployment.mjs');

const SH = 'a'.repeat(40);

/** Stub de fetch no mesmo estilo do teste do settings-guard: substitui o modulo real. */
function stubFetch({ id = '123\n::error::forged', mensagemErro = null } = {}) {
  const corpos = [];
  const linhas = [
    'const send = (obj, status) => {',
    '  status = status || 200;',
    '  return { ok: status >= 200 && status < 300, status: status,',
    "    headers: { get: () => '1' }, json: async () => obj,",
    '    text: async () => JSON.stringify(obj) };',
    '};',
    'globalThis.fetch = async (url, opts) => {',
    "  const p = String(url).replace('https://api.github.com', '');",
    `  if (p.endsWith('/deployments') && String(opts && opts.method).toUpperCase() === 'POST')`,
    `    return ${mensagemErro ? `send({ message: ${JSON.stringify(mensagemErro)} }, 422)` : `send({ id: ${JSON.stringify(id)}, environment: 'Preview', ref: '${SH}', payload: { run_id: 123 } })`};`,
    `  if (p.indexOf('/statuses') !== -1) return send({ state: 'queued' });`,
    '  return send({});',
    '};',
    '',
  ];
  return linhas.join('\n');
}

function rodarRegister(extra = {}) {
  const pasta = mkdtempSync(join(tmpdir(), 's5145-'));
  const saida = join(pasta, 'output.txt');
  const r = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(stubFetch(extra)), REGISTER], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GITHUB_REPOSITORY: 'dono/repo',
      GITHUB_RUN_ID: '123',
      GITHUB_TOKEN: 'token-falso',
      GITHUB_SERVER_URL: 'https://github.com',
      DEPLOYED_GIT_SHA: SH,
      GITHUB_OUTPUT: saida,
    },
    cwd: AQUI,
    timeout: 15000,
  });
  let conteudo = '';
  try {
    conteudo = readFileSync(saida, 'utf8');
  } catch {
    conteudo = '';
  }
  return { out: r.stdout + r.stderr, output: conteudo };
}

test('S5145: valor da API com quebra de linha NAO forja comando de workflow no log', () => {
  const { out } = rodarRegister({ id: '123\n::error::forged' });
  const forjadas = out.split('\n').filter((l) => l.startsWith('::error::forged'));
  assert.equal(forjadas.length, 0,
    `linha de workflow forjada apareceu no log:\n${out.slice(0, 400)}`);
});

test('S5145: valor da API com quebra de linha NAO cria variavel nova no GITHUB_OUTPUT', () => {
  const { output } = rodarRegister({ id: '123\nINJETADO=sim' });
  const chaves = output.split('\n').filter(Boolean).map((l) => l.split('=')[0]);
  assert.deepEqual(chaves, ['deployment_id'],
    `apenas deployment_id pode existir no output; veio: ${JSON.stringify(chaves)}`);
  assert.ok(!output.includes('\nINJETADO='), `variavel forjada no GITHUB_OUTPUT:\n${output}`);
});

test('S5145: mensagem de erro da API com quebra de linha NAO forja ::error:: no warning', () => {
  const { out } = rodarRegister({ mensagemErro: 'falha\n::error::forged2' });
  const forjadas = out.split('\n').filter((l) => l.startsWith('::error::forged'));
  assert.equal(forjadas.length, 0, `a mensagem de erro forjou comando:\n${out.slice(0, 400)}`);
});

test('S5145: o fluxo legitimo continua escrevendo deployment_id normalmente', () => {
  const { output, out } = rodarRegister({ id: '456' });
  assert.ok(/^deployment_id=456$/m.test(output), `output legitimo ausente:\n${output}`);
  assert.ok(/Deployment registrado/.test(out), `notice ausente:\n${out.slice(0, 300)}`);
});
