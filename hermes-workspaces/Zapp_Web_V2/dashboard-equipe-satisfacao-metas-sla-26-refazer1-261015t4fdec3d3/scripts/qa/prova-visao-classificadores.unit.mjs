import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// jssecurity:S5145 (log injection) — cobre as linhas 123 (corpo do Auth de
// credencial recusada), 147 (categoria devolvida pela edge function) e 182
// (resultado final) do provador de visão. Um valor vindo de fora contendo `\n`
// NÃO pode forjar uma linha nova no log. Executa-se o script de verdade (child
// process) com um `fetch` stubbed, e exige-se uma linha só por mensagem.
// Mesmo padrão de scripts/ci/github-settings-guard.unit.mjs.
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'prova-visao-classificadores.mjs');

const BASE_STUB = [
  'const send = (status, raw) => ({',
  '  ok: status >= 200 && status < 300,',
  '  status: status,',
  '  json: async () => { try { return JSON.parse(raw); } catch { return {}; } },',
  '  text: async () => raw,',
  '});',
  'globalThis.fetch = async (url) => {',
  '  const u = String(url);',
  '  if (u.includes("/auth/v1/token")) return send(__LOGIN_STATUS__, __LOGIN_BODY__);',
  '  if (u.includes("/functions/v1/classify-sticker")) return send(200, JSON.stringify({ category: "figurinha\\n::error::forged-sticker" }));',
  '  if (u.includes("/functions/v1/classify-emoji")) return send(200, JSON.stringify({ category: "emoji\\n::error::forged-emoji" }));',
  '  if (u.includes("/rest/v1/ai_usage_logs")) return send(401, "nao-autorizado");',
  '  return send(200, "{}");',
  '};',
  '',
].join('\n');

function buildStub(loginStatus, loginBodyRaw) {
  return BASE_STUB
    .replace('__LOGIN_STATUS__', String(loginStatus))
    .replace('__LOGIN_BODY__', JSON.stringify(loginBodyRaw));
}

function run(loginStatus, loginBodyRaw) {
  const stub = 'data:text/javascript,' + encodeURIComponent(buildStub(loginStatus, loginBodyRaw));
  return spawnSync(process.execPath, ['--import', stub, SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ZAPP_SUPABASE_URL: 'https://stub.invalid',
      ZAPP_ANON_KEY: 'stub-anon',
      ZAPP_QA_EMAIL: 'qa@stub.invalid',
      ZAPP_QA_PASSWORD: 'stub-password',
    },
  });
}

describe('prova-visao-classificadores: log injection (jssecurity:S5145)', () => {
  it('neutraliza quebras de linha no corpo do Auth recusado (linha 123)', () => {
    const res = run(400, '{"msg":"credencial invalida"}\n::error::forged-login');
    const out = `${res.stdout}${res.stderr}`;
    const linhas = out.split('\n');

    const linhaAuth = linhas.find((l) => l.includes('resposta do Auth (sem credencial):'));
    assert.ok(linhaAuth, `linha da resposta do Auth ausente na saída:\n${out}`);
    assert.ok(
      linhaAuth.includes('credencial invalida"} ::error::forged-login'),
      `valor não-confiável vazou cru na linha 123: ${JSON.stringify(linhaAuth)}`,
    );
    assert.ok(
      !linhas.includes('::error::forged-login'),
      `linha de log forjada emitida:\n${out}`,
    );
  });

  it('neutraliza quebras de linha na categoria devolvida (linhas 147 e 182)', () => {
    const res = run(200, '{"access_token":"stub-token"}');
    const out = `${res.stdout}${res.stderr}`;
    const linhas = out.split('\n');

    // Linha 147 — categoria devolvida pela edge function, numa linha só.
    const linhaCategoria = linhas.find((l) => l.includes('categoria retornada:'));
    assert.ok(linhaCategoria, `linha da categoria ausente na saída:\n${out}`);
    assert.ok(
      linhaCategoria.includes('figurinha ::error::forged-sticker'),
      `valor não-confiável vazou cru na linha 147: ${JSON.stringify(linhaCategoria)}`,
    );

    // Linha 182 — resultado final com as duas categorias, numa linha só.
    const linhaResultado = linhas.find((l) => l.startsWith('categorias: figurinha='));
    assert.ok(linhaResultado, `linha do resultado ausente na saída:\n${out}`);
    assert.ok(
      linhaResultado.includes('figurinha=figurinha ::error::forged-sticker')
        && linhaResultado.includes('emoji=emoji ::error::forged-emoji'),
      `valor não-confiável vazou cru na linha 182: ${JSON.stringify(linhaResultado)}`,
    );

    assert.ok(
      !linhas.includes('::error::forged-sticker') && !linhas.includes('::error::forged-emoji'),
      `linha de log forjada emitida:\n${out}`,
    );
  });
});

// ---------------------------------------------------------------------------
// R2-INF-020 — a prova só pode aprovar com CORRELAÇÃO do consumo.
//
// O defeito original: qualquer resposta do REST de `ai_usage_logs` que não
// fosse 2xx virava apenas um AVISO (falhas continuava 0 → "PROVA OK"), e quando
// a consulta funcionava bastava existir DUAS linhas quaisquer dos dois
// classificadores nos últimos 5 minutos — inclusive de execuções ANTERIORES ou
// duas linhas de UMA só função — para a prova aprovar, sem correlação nenhuma
// com as duas chamadas feitas agora.
//
// Estes testes executam o script de verdade com um `fetch` stubado e provam o
// contrato blindado: um registro NOVO e válido por chamada; leitura recusada
// deixa a prova INCONCLUSIVA; dado anterior e duas linhas da mesma função NÃO
// aprovam. São vermelhos contra a versão defeituosa e verdes depois da correção.
// ---------------------------------------------------------------------------

/** Linha de `ai_usage_logs` como o REST devolve (sucesso + provedor de visão). */
function linhaUso(id, functionName, { status = 'success', model = 'google/gemini-3.8-flash' } = {}) {
  return {
    id,
    function_name: functionName,
    model,
    status,
    error_message: null,
    metadata: { provider_id: 'openrouter' },
    created_at: '2026-10-06T12:00:00.000Z',
  };
}

/**
 * Stub com o REST de consumo ESTATEFUL: `respostas` é a sequência de corpos
 * devolvida às leituras sucessivas (a última se repete). Assim simulamos a
 * linha de base (leitura ANTES das chamadas) e o estado posterior.
 */
function buildConsumoStub({ usoStatus = 200, respostas = [[]] }) {
  return [
    'const send = (status, raw) => ({',
    '  ok: status >= 200 && status < 300,',
    '  status: status,',
    '  json: async () => { try { return JSON.parse(raw); } catch { return {}; } },',
    '  text: async () => raw,',
    '});',
    `const STATUS_CONSUMO = ${usoStatus};`,
    `const RESPOSTAS_CONSUMO = ${JSON.stringify(respostas)};`,
    'let leiturasConsumo = 0;',
    'globalThis.fetch = async (url) => {',
    '  const u = String(url);',
    '  if (u.includes("/auth/v1/token")) return send(200, JSON.stringify({ access_token: "stub-token" }));',
    '  if (u.includes("/functions/v1/classify-sticker")) return send(200, JSON.stringify({ category: "comemoracao" }));',
    '  if (u.includes("/functions/v1/classify-emoji")) return send(200, JSON.stringify({ category: "feliz" }));',
    '  if (u.includes("/rest/v1/ai_usage_logs")) {',
    '    const corpo = RESPOSTAS_CONSUMO[Math.min(leiturasConsumo, RESPOSTAS_CONSUMO.length - 1)] ?? [];',
    '    leiturasConsumo += 1;',
    '    return send(STATUS_CONSUMO, JSON.stringify(corpo));',
    '  }',
    '  return send(200, "{}");',
    '};',
    '',
  ].join('\n');
}

function runComConsumo(config) {
  const stub = 'data:text/javascript,' + encodeURIComponent(buildConsumoStub(config));
  return spawnSync(process.execPath, ['--import', stub, SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ZAPP_SUPABASE_URL: 'https://stub.invalid',
      ZAPP_ANON_KEY: 'stub-anon',
      ZAPP_QA_EMAIL: 'qa@stub.invalid',
      ZAPP_QA_PASSWORD: 'stub-password',
    },
  });
}

describe('prova-visao-classificadores: consumo correlacionado (R2-INF-020)', () => {
  it('leitura de consumo recusada (HTTP não-ok) não aprova — fica inconclusiva', () => {
    const res = runComConsumo({ usoStatus: 401, respostas: [[]] });
    const out = `${res.stdout}${res.stderr}`;
    assert.notEqual(res.status, 0, `sem permissão de leitura o exit NÃO pode ser 0:\n${out}`);
    assert.ok(!out.includes('PROVA OK'), `não pode imprimir PROVA OK:\n${out}`);
    assert.ok(out.includes('PROVA INCONCLUSIVA'), `deveria declarar a prova inconclusiva:\n${out}`);
  });

  it('registros ANTERIORES (linha de base) não aprovam a prova', () => {
    const anteriores = [linhaUso('uso-1', 'classify-sticker'), linhaUso('uso-2', 'classify-emoji')];
    const res = runComConsumo({ respostas: [anteriores] });
    const out = `${res.stdout}${res.stderr}`;
    assert.notEqual(res.status, 0, `dado anterior não pode fechar a prova verde:\n${out}`);
    assert.ok(!out.includes('PROVA OK'), `dado anterior aprovou indevidamente:\n${out}`);
  });

  it('duas linhas de UMA só função não aprovam a prova', () => {
    // Linha de base VAZIA e duas linhas NOVAS de `classify-sticker` na leitura
    // posterior: nada é descartado como registro anterior. A única razão
    // possível para a reprovação é a validação POR FUNÇÃO — não há registro
    // novo e válido de `classify-emoji` para correlacionar à segunda chamada.
    const soSticker = [linhaUso('uso-1', 'classify-sticker'), linhaUso('uso-2', 'classify-sticker')];
    const res = runComConsumo({ respostas: [[], soSticker] });
    const out = `${res.stdout}${res.stderr}`;
    assert.notEqual(res.status, 0, `faltando o emoji a prova não pode fechar verde:\n${out}`);
    assert.ok(!out.includes('PROVA OK'), `duas linhas da mesma função aprovaram indevidamente:\n${out}`);

    // Prova de que a linha de base NÃO filtrou nada: as duas linhas contam como NOVAS.
    assert.ok(
      out.includes('registros de consumo NOVOS (não existiam antes das chamadas): 2'),
      `a linha de base deveria estar vazia (as duas linhas são NOVAS):\n${out}`,
    );
    // Prova do MOTIVO: o registro NOVO e válido de `classify-sticker` passa na
    // validação POR FUNÇÃO; quem reprova é a ausência de registro de `classify-emoji`.
    assert.ok(
      out.split('\n').some((l) => /^\s+OK\s+classify-sticker \(figurinha\)/.test(l)),
      `o registro NOVO e válido de classify-sticker deveria ser aceito:\n${out}`,
    );
    assert.ok(
      out.split('\n').some((l) => /^\s+FALHA\s+classify-emoji \(emoji\)/.test(l)),
      `a reprovação tem de vir da ausência de registro de classify-emoji:\n${out}`,
    );
  });

  it('um registro NOVO e válido por chamada aprova (controle verde)', () => {
    const novas = [linhaUso('uso-1', 'classify-sticker'), linhaUso('uso-2', 'classify-emoji')];
    const res = runComConsumo({ respostas: [[], novas] });
    const out = `${res.stdout}${res.stderr}`;
    assert.equal(res.status, 0, `com as duas linhas correlacionadas o exit deve ser 0:\n${out}`);
    assert.ok(out.includes('PROVA OK'), `deveria aprovar com as duas linhas correlacionadas:\n${out}`);
  });
});
