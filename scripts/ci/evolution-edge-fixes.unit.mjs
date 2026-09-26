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
  // Isso vale tanto pro branch de sucesso quanto pro de erro (createData?.error) —
  // a GO pode ecoar o token submetido mesmo numa resposta de erro (ex.: nome duplicado).
  assert.doesNotMatch(
    createConnBlock, /evolution:\s*createData\b/,
    "create-connection nao pode devolver createData crua (contem o token ecoado pela GO) — usar stripInstanceToken(createData)",
  );
  assert.doesNotMatch(
    createConnBlock, /JSON\.stringify\(createData\)/,
    "o branch de erro (createData?.error) tambem precisa passar por stripInstanceToken antes de responder",
  );
  const stripCalls = createConnBlock.match(/stripInstanceToken\(createData\)/g) ?? [];
  assert.equal(stripCalls.length, 2, "stripInstanceToken(createData) precisa ser chamado nos dois branches (erro e sucesso)");
  // stripInstanceToken precisa continuar cobrindo token/Token/apikey/apiKey em
  // mais de um nome de contêiner (nao só "data" — forks do Evolution API
  // costumam aninhar sob "hash"/"instance", padrão do Node.js v1/v2 original).
  assert.match(createConnBlock, /TOKEN_KEYS = \[.*'token'.*'Token'.*'apikey'.*'apiKey'.*\]/);
  assert.match(createConnBlock, /TOKEN_CONTAINER_KEYS = \[.*'data'.*'hash'.*'instance'.*\]/);
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

test("create-connection: reserva o instance_id (INSERT) antes de tocar a GO — trava a corrida de nomes iguais", () => {
  const cConnAt = apiSrc.indexOf("if (action === 'create-connection')");
  const listAt = apiSrc.indexOf("if (action === 'list-instances')");
  const block = apiSrc.slice(cConnAt, listAt);

  // Bug original: SELECT (check) + INSERT (act) depois da GO já ter sido
  // chamada é check-then-act — duas requisições com o mesmo nome passavam as
  // duas para a GO, e quem perdesse o INSERT resolvia a instância da outra
  // só pelo nome e apagava. A trava real é o UNIQUE em instance_id: o INSERT
  // tem que ser a PRIMEIRA coisa que a action faz depois de validar o body,
  // e tem que vir antes de qualquer chamada a /instance/create.
  const insertAt = block.indexOf(".from('whatsapp_connections').insert({");
  const createCallAt = block.indexOf("proxy('/instance/create'");
  assert.notEqual(insertAt, -1, "o INSERT de reserva sumiu");
  assert.notEqual(createCallAt, -1, "a chamada de criação na GO sumiu");
  assert.ok(insertAt < createCallAt, "o INSERT em whatsapp_connections precisa vir ANTES da chamada a /instance/create na GO");

  // Só pode existir UM insert nesta action (o antigo tinha dois: reserva
  // nenhuma reserva de fato, e um insert pós-GO) — dois inserts de volta é
  // sinal de que a reserva atômica foi desfeita.
  const insertCount = block.split(".from('whatsapp_connections').insert({").length - 1;
  assert.equal(insertCount, 1, "create-connection só pode inserir a linha uma vez (antes da GO)");

  // O SELECT+maybeSingle antigo (check-then-act) não pode voltar.
  assert.doesNotMatch(
    block, /\.select\('id'\)\.eq\('instance_id', instance\)\.maybeSingle\(\)/,
    "o check-then-act antigo (SELECT antes do INSERT) não fecha a corrida — não pode voltar",
  );

  // Falha no INSERT por corrida (unique_violation, 23505) precisa de mensagem
  // amigável e não pode acionar compensação na GO (nada foi criado lá ainda).
  assert.match(block, /insertError\?\.code === '23505'/, "precisa distinguir unique_violation (corrida) de outras falhas de insert");
});

test("create-connection: compensa a GO ANTES de liberar a reserva (nunca depois)", () => {
  const cConnAt = apiSrc.indexOf("if (action === 'create-connection')");
  const listAt = apiSrc.indexOf("if (action === 'list-instances')");
  const block = apiSrc.slice(cConnAt, listAt);

  // Enquanto a linha reservada existir, nenhum concorrente com o mesmo nome
  // passa do INSERT — então resolveGoInstanceId(instance) só pode achar a
  // instância desta própria requisição. Se rollbackRow() rodasse antes de
  // compensateGoCreate(), um concorrente poderia reservar o nome e criar sua
  // própria instância na GO nesse intervalo, e a compensação apagaria a
  // instância DELE — o mesmo bug que a reserva existe para fechar.
  const tokenErrAt = block.indexOf('if (tokenError)');
  assert.notEqual(tokenErrAt, -1, "branch de tokenError sumiu");
  const tokenErrBlock = block.slice(tokenErrAt, tokenErrAt + 1000);
  const compensateAt = tokenErrBlock.indexOf('await compensateGoCreate();');
  const rollbackAt = tokenErrBlock.indexOf('await rollbackRow();');
  assert.notEqual(compensateAt, -1, "compensateGoCreate() precisa ser chamado no branch de tokenError");
  assert.notEqual(rollbackAt, -1, "rollbackRow() precisa ser chamado no branch de tokenError");
  assert.ok(compensateAt < rollbackAt, "compensateGoCreate() tem que rodar ANTES de rollbackRow() — a linha reservada é o que garante que a instância resolvida é a nossa");
});

test("create-connection: branch de createData?.error também compensa a GO antes do rollback", () => {
  const cConnAt = apiSrc.indexOf("if (action === 'create-connection')");
  const listAt = apiSrc.indexOf("if (action === 'list-instances')");
  const block = apiSrc.slice(cConnAt, listAt);

  // proxyToEvolution devolve error:true tanto pra erro de negocio da GO
  // (nada criado) quanto pra timeout/erro de rede depois que a requisicao
  // JA pode ter chegado la (/instance/create e POST, nunca e retried) — sem
  // compensar aqui tambem, uma instancia criada na GO com esse timing fica
  // orfa SEM NENHUM rastro local (nem linha, nem token), pior que uma linha
  // fantasma.
  const errAt = block.indexOf('if (createData?.error)');
  assert.notEqual(errAt, -1, "branch de createData?.error sumiu");
  const errBlock = block.slice(errAt, errAt + 700);
  const compensateAt = errBlock.indexOf('await compensateGoCreate();');
  const rollbackAt = errBlock.indexOf('await rollbackRow();');
  assert.notEqual(compensateAt, -1, "compensateGoCreate() precisa ser chamado no branch de createData?.error — a GO pode ter criado a instancia mesmo com error:true (timeout apos criar)");
  assert.notEqual(rollbackAt, -1, "rollbackRow() precisa ser chamado no branch de createData?.error");
  assert.ok(compensateAt < rollbackAt, "compensateGoCreate() tem que rodar ANTES de rollbackRow() tambem neste branch, pelo mesmo motivo do branch de tokenError");
});

test("create-connection: mensagem de 23505 distingue instance_id de is_default (whatsapp_connections_one_default)", () => {
  const cConnAt = apiSrc.indexOf("if (action === 'create-connection')");
  const listAt = apiSrc.indexOf("if (action === 'list-instances')");
  const block = apiSrc.slice(cConnAt, listAt);

  // A tabela tem 2 unique index que geram 23505 (instance_id e o parcial
  // is_default WHERE true) — duas criações concorrentes com is_default:true
  // colidem no segundo, e afirmar que foi o instance_id nesse caso é
  // diagnóstico incorreto (achado real de auditoria, sem precisar de nomes
  // iguais nem de corrida com a GO).
  assert.match(block, /whatsapp_connections_one_default/, "precisa checar a constraint do índice parcial de is_default, não só assumir instance_id");
  assert.match(block, /isDefaultCollision/, "precisa de um branch de mensagem dedicado à colisão de is_default");
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
