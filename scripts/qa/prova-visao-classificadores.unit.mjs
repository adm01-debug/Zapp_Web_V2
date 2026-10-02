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
