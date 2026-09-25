import assert from "node:assert/strict";
import test from "node:test";
// ── Guards de regressao dos fixes de 2026-09-23 (incidente WhatsApp fora do ar) ──
// Leem o fonte porque o caminho exercitado depende de Deno.env/fetch: o que
// importa aqui e que a forma do codigo nao volte atras.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const proxySrc = readFileSync(join(root, "supabase/functions/_shared/evolution-api-proxy.ts"), "utf8");
const apiSrc = readFileSync(join(root, "supabase/functions/evolution-api/index.ts"), "utf8");

test("circuit breaker: 4xx nao conta como falha e 5xx nao zera o contador", () => {
  // cbRecord(key, success): inverter esse argumento fazia 5 respostas 404 abrirem o
  // breaker por 60s (derrubando ate o envio de mensagem), enquanto um 500 real
  // zerava o contador e o breaker nunca abria quando deveria.
  assert.equal(
    proxySrc.includes("cbRecord(breakerKey, response.status >= 500)"), false,
    "cbRecord(breakerKey, status >= 500) esta invertido: passa sucesso=true em erro 5xx",
  );
  assert.equal(
    proxySrc.includes("cbRecord(breakerKey, response.status < 500"), true,
    "o ramo de !response.ok precisa registrar 4xx como sucesso do breaker",
  );
  // 408 e timeout reportado pelo servidor: esta em RETRYABLE_STATUSES e tem que
  // continuar abrindo o breaker, senao a Evolution pode pendurar sem protecao.
  assert.match(proxySrc, /cbRecord\(breakerKey, response\.status < 500 && response\.status !== 408\)/);
  assert.match(proxySrc, /RETRYABLE_STATUSES = new Set\(\[408,/);
  // A assinatura que da sentido ao teste acima (E22: chave do breaker por instancia).
  assert.match(proxySrc, /function cbRecord\(key: string, success: boolean\): void/);
  assert.match(proxySrc, /if \(success\) \{ state\.failures = 0; cbState\.set\(key, state\); return; \}/);
});

test("action status nao apaga o qr_code de um pareamento em curso", () => {
  const statusBlock = apiSrc.slice(apiSrc.indexOf("if (action === 'status')"));
  const body = statusBlock.slice(0, statusBlock.indexOf("const resolveGoInstanceId"));

  // O polling do dialogo de QR roda a cada 3s; um update incondicional com
  // qr_code: null apagava o QR recem-gravado pelo connect/webhook e travava o
  // pareamento em spinner infinito.
  const guard = body.indexOf("if (status === 'connected')");
  const clear = body.indexOf('update({ status, qr_code: null })');
  assert.notEqual(guard, -1, "falta a guarda status === 'connected'");
  assert.notEqual(clear, -1, 'o update que zera o qr_code sumiu');
  assert.ok(guard < clear, "o update com qr_code: null tem que estar dentro do if (status === 'connected')");
  assert.equal(
    body.split('update({ status, qr_code: null })').length - 1, 1,
    'so pode existir um update que zera o qr_code, e ele e o do ramo connected',
  );
  assert.match(body, /\.neq\('status', 'qr_pending'\)/);
});

test("rotas de historico sem equivalente na GO tem guarda de flavor", () => {
  for (const action of ["find-messages", "find-status-messages"]) {
    const at = apiSrc.indexOf(`if (action === '${action}')`);
    assert.notEqual(at, -1, `action ${action} sumiu`);
    const block = apiSrc.slice(at, at + 600);
    const guard = block.indexOf(`goHistoryNotSupported('${action}'`);
    const call = block.indexOf("/chat/findMessages/");
    assert.notEqual(guard, -1, `${action} precisa devolver goHistoryNotSupported no flavor GO`);
    assert.ok(guard < call, `a guarda de ${action} tem que vir antes de chamar /chat/findMessages`);
    assert.match(block.slice(0, guard), /if \(isGoFlavor\)/);
  }
  assert.match(apiSrc, /import \{ goHistoryNotSupported \} from "\.\.\/_shared\/evolution-sync-actions\.ts";/);
});
