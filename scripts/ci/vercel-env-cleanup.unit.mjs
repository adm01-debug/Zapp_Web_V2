import assert from 'node:assert/strict';
import test from 'node:test';

import { executarCleanup } from './vercel-env-cleanup.mjs';

function resposta(status, body = null) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() { return body == null ? '' : JSON.stringify(body); },
  };
}

function saida() {
  const linhas = [];
  const registrar = (...args) => linhas.push(args.join(' '));
  return {
    output: { log: registrar, warn: registrar, error: registrar },
    texto: () => linhas.join('\n'),
  };
}

test('falha fechado sem token e não acessa a rede', async () => {
  let chamadas = 0;
  const log = saida();
  const code = await executarCleanup({ fetchImpl: async () => { chamadas += 1; }, output: log.output });
  assert.equal(code, 1);
  assert.equal(chamadas, 0);
  assert.match(log.texto(), /VERCEL_TOKEN ausente/);
});

test('403 de leitura falha fechado e nunca tenta DELETE', async () => {
  const metodos = [];
  const log = saida();
  const code = await executarCleanup({
    token: 'segredo',
    fetchImpl: async (_url, opts) => {
      metodos.push(opts.method ?? 'GET');
      return resposta(403, { error: { message: 'negado' } });
    },
    output: log.output,
    dryRun: false,
  });
  assert.equal(code, 1);
  assert.deepEqual(metodos, ['GET']);
  assert.match(log.texto(), /GET envs falhou.*403/);
  assert.doesNotMatch(log.texto(), /segredo|negado/);
});

test('dry-run pagina, codifica cursor, deduplica ID e não expõe valor nem ID', async () => {
  const urls = [];
  const metodos = [];
  const log = saida();
  const fetchImpl = async (url, opts) => {
    urls.push(String(url));
    metodos.push(opts.method ?? 'GET');
    if (urls.length === 1) {
      return resposta(200, {
        envs: [{ id: 'id-secreto', key: 'POSTGRES_PASSWORD', value: 'valor-secreto', target: ['preview'] }],
        pagination: { next: 'a&b = ç' },
      });
    }
    return resposta(200, {
      envs: [
        { id: 'id-secreto', key: 'POSTGRES_PASSWORD', value: 'valor-secreto', target: ['preview'] },
        { id: 'fora', key: 'VAR_SEGURA', value: 'também-secreto', target: ['production'] },
      ],
      pagination: { next: null },
    });
  };
  const code = await executarCleanup({ token: 'token-secreto', fetchImpl, output: log.output });
  assert.equal(code, 0);
  assert.deepEqual(metodos, ['GET', 'GET']);
  assert.equal(new URL(urls[1]).searchParams.get('until'), 'a&b = ç');
  assert.equal(new URL(urls[1]).searchParams.get('teamId'), 'team_QyN41X0q8hrqhW80AwokbFLv');
  assert.match(log.texto(), /Vars a remover: 1/);
  assert.doesNotMatch(log.texto(), /id-secreto|valor-secreto|também-secreto|token-secreto/);
});

test('apply remove somente allowlist, codifica ID e continua após falha parcial', async () => {
  const chamadas = [];
  const log = saida();
  const fetchImpl = async (url, opts) => {
    chamadas.push({ url: String(url), method: opts.method ?? 'GET' });
    if ((opts.method ?? 'GET') === 'GET') {
      return resposta(200, {
        envs: [
          { id: 'id/um', key: 'OPENAI_API_KEY', target: ['production'] },
          { id: 'id dois', key: 'GROQ_API_KEY', target: 'inválido' },
          { id: 'intocada', key: 'VAR_SEGURA', target: ['production'] },
        ],
      });
    }
    return chamadas.filter((item) => item.method === 'DELETE').length === 1
      ? resposta(204)
      : resposta(500, { secret: 'não imprimir' });
  };
  const code = await executarCleanup({ token: 'token', fetchImpl, output: log.output, dryRun: false });
  assert.equal(code, 1);
  const deletes = chamadas.filter((item) => item.method === 'DELETE');
  assert.equal(deletes.length, 2);
  assert.match(deletes[0].url, /id%2Fum/);
  assert.match(deletes[1].url, /id%20dois/);
  assert.match(log.texto(), /Concluído: 1 removidas, 1 erros/);
  assert.doesNotMatch(log.texto(), /intocada|não imprimir/);
});

test('ambiente já limpo encerra verde sem mutação', async () => {
  const log = saida();
  const code = await executarCleanup({
    token: 'token',
    fetchImpl: async () => resposta(200, { envs: [{ id: 'x', key: 'MANTER' }] }),
    output: log.output,
    dryRun: false,
  });
  assert.equal(code, 0);
  assert.match(log.texto(), /Ambiente já limpo/);
});

test('alvo da allowlist sem ID válido falha antes de qualquer DELETE', async () => {
  const metodos = [];
  const log = saida();
  const code = await executarCleanup({
    token: 'token',
    fetchImpl: async (_url, opts) => {
      metodos.push(opts.method ?? 'GET');
      return resposta(200, { envs: [{ id: '', key: 'POSTGRES_URL', target: ['preview'] }] });
    },
    output: log.output,
    dryRun: false,
  });
  assert.equal(code, 1);
  assert.deepEqual(metodos, ['GET']);
  assert.match(log.texto(), /sem identificador seguro/);
});

for (const caso of [
  ['resposta sem envs', async () => resposta(200, { pagination: {} }), /resposta inválida/],
  ['cursor de tipo inválido', async () => resposta(200, { envs: [], pagination: { next: {} } }), /cursor inválido/],
  ['erro HTTP', async () => resposta(502, { value: 'segredo' }), /GET envs falhou: 502/],
  ['erro de rede', async () => { throw new Error('token=segredo'); }, /erro de rede/],
]) {
  test(`${caso[0]} falha fechado e redige a resposta`, async () => {
    const log = saida();
    const code = await executarCleanup({ token: 'token', fetchImpl: caso[1], output: log.output });
    assert.equal(code, 1);
    assert.match(log.texto(), caso[2]);
    assert.doesNotMatch(log.texto(), /segredo/);
  });
}

test('cursor repetido interrompe paginação potencialmente infinita', async () => {
  let chamadas = 0;
  const log = saida();
  const code = await executarCleanup({
    token: 'token',
    fetchImpl: async () => {
      chamadas += 1;
      return resposta(200, { envs: [], pagination: { next: 'mesmo' } });
    },
    output: log.output,
  });
  assert.equal(code, 1);
  assert.equal(chamadas, 2);
  assert.match(log.texto(), /cursor repetido/);
});
