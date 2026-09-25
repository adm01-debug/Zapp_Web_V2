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

test("create-connection: resolveGoInstanceId/requireAdmin declarados antes do uso (TDZ)", () => {
  // create-connection usa resolveGoInstanceId dentro de compensateGoCreate();
  // como e' const, declarar depois do primeiro uso e' ReferenceError em runtime,
  // nao em build — so aparece quando o caminho de compensacao roda de verdade.
  const declResolve = apiSrc.indexOf("const resolveGoInstanceId = async");
  const declAdmin = apiSrc.indexOf("const requireAdmin = async");
  const useResolve = apiSrc.indexOf("resolveGoInstanceId(instance)");
  const createConnAt = apiSrc.indexOf("if (action === 'create-connection')");
  assert.notEqual(declResolve, -1);
  assert.notEqual(declAdmin, -1);
  assert.notEqual(useResolve, -1);
  assert.notEqual(createConnAt, -1);
  assert.ok(declResolve < createConnAt, "resolveGoInstanceId precisa ser declarado antes de create-connection");
  assert.ok(declAdmin < createConnAt, "requireAdmin precisa ser declarado antes de create-connection");
  assert.ok(declResolve < useResolve, "resolveGoInstanceId precisa ser declarado antes do uso em compensateGoCreate");
});

test("bootstrap-instance-token e create-connection nunca logam ou ecoam o token", () => {
  const bAt = apiSrc.indexOf("if (action === 'bootstrap-instance-token')");
  const cAt = apiSrc.indexOf("if (action === 'create-instance')");
  const cConnAt = apiSrc.indexOf("if (action === 'create-connection')");
  const listAt = apiSrc.indexOf("if (action === 'list-instances')");
  assert.ok(bAt !== -1 && cAt !== -1 && cConnAt !== -1 && listAt !== -1);
  const bootstrapBlock = apiSrc.slice(bAt, cAt);
  const createConnBlock = apiSrc.slice(cConnAt, listAt);
  for (const [name, block] of [["bootstrap-instance-token", bootstrapBlock], ["create-connection", createConnBlock]]) {
    assert.doesNotMatch(
      block, /\.(error|warn|info|debug)\([^)]*(legacyToken|instanceToken)\b/,
      `${name}: token nao pode ir para log`,
    );
  }
  // A GO ecoa o token gerado no corpo de /instance/create (docs/migration/GO_GAPS.md) —
  // devolver createData sem redigir reabre o vazamento que o Vault existe para fechar.
  assert.doesNotMatch(
    createConnBlock, /evolution:\s*createData\b/,
    "create-connection nao pode devolver createData crua (contem o token ecoado pela GO) — usar stripInstanceToken(createData)",
  );
  assert.match(createConnBlock, /stripInstanceToken\(createData\)/);
  assert.match(createConnBlock, /delete clone\.token; delete clone\.Token;/);
});

test("create-connection: compensacao e rollback nunca afirmam sucesso sem confirmar", () => {
  const cConnAt = apiSrc.indexOf("if (action === 'create-connection')");
  const listAt = apiSrc.indexOf("if (action === 'list-instances')");
  const block = apiSrc.slice(cConnAt, listAt);
  // proxyToEvolution nunca lanca — o antigo catch-only tratava exceção como
  // o único jeito de falhar, mas o caminho real de falha (goId nao resolvido,
  // ou delete respondendo error:true no corpo) passava batido e o log dizia
  // "compensado"/"revertido" mesmo sem ter confirmado nada.
  assert.match(block, /if \(!goId\) \{/, "compensacao precisa tratar explicitamente o caso goId nao resolvido");
  assert.match(block, /deleteData\?\.error/, "compensacao precisa inspecionar o corpo da resposta do delete, nao só a exceção");
  assert.doesNotMatch(
    block, /'create-connection: insert falhou, inst[aâ]ncia compensada na GO'/,
    "nao pode afirmar que a GO foi compensada antes de confirmar",
  );
  // Rollback da linha após set_instance_token falhar precisa checar o proprio erro do delete.
  assert.match(block, /if \(deleteRowError\)/, "delete da linha apos tokenError precisa checar o proprio erro");
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
