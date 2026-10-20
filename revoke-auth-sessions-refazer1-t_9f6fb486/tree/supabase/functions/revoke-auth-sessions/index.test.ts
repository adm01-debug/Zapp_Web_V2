import {
  planRevocation,
  decodeJwtClaims,
  buildRevocationAudit,
  buildDeniedRevocationAudit,
  maskIpForAudit,
  recordRevocationAudit,
  decideThirdPartyRevocation,
  normalizeRole,
  resolveEffectiveRole,
  handleRevokeAuthSessionsCore,
} from "./index.ts";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

function fail(msg: string): never {
  throw new Error(msg);
}

// ─── Autorização (acceptance 2: usuário comum não revoga terceiro; admin pode) ───

Deno.test("global self: usuário comum pode revogar as próprias sessões sem ser admin", () => {
  const p = planRevocation("global", undefined, undefined, A, S1, false);
  if (!p.ok) fail("esperava plano ok para global self");
  if (p.target !== A) fail(`target deveria ser o próprio caller (${A}), veio ${p.target}`);
  if (p.actor !== null) fail("global não usa actor");
});

Deno.test("global de terceiro por usuário comum é recusado (403)", () => {
  const p = planRevocation("global", B, undefined, A, S1, false);
  if (p.ok) fail("usuário comum não pode revogar sessão de terceiro");
  if (p.status !== 403) fail(`status esperado 403, veio ${p.status}`);
});

Deno.test("global de terceiro por admin é permitido (revoga por user_id)", () => {
  const p = planRevocation("global", B, undefined, A, S1, true);
  if (!p.ok) fail("admin deveria poder revogar por user_id");
  if (p.target !== B) fail(`target deveria ser o terceiro (${B}), veio ${p.target}`);
});

// ─── Escopos (acceptance 1: local só a alvo; others preserva a indicada) ───

Deno.test("local exige target_session_id", () => {
  const p = planRevocation("local", undefined, undefined, A, S1, false);
  if (p.ok) fail("local sem target_session_id deveria ser recusado");
  if (p.status !== 400) fail(`status esperado 400, veio ${p.status}`);
});

Deno.test("local age na sessão alvo do próprio ator", () => {
  const p = planRevocation("local", undefined, S1, A, S1, false);
  if (!p.ok) fail("esperava plano ok para local");
  if (p.actor !== A) fail(`actor deveria ser o caller (${A})`);
  if (p.targetSession !== S1) fail(`targetSession deveria ser ${S1}`);
});

Deno.test("others exige a sessão atual (preservada)", () => {
  const p = planRevocation("others", undefined, undefined, A, null, false);
  if (p.ok) fail("others sem sessão atual deveria ser recusado");
  if (p.status !== 400) fail(`status esperado 400, veio ${p.status}`);
});

Deno.test("others preserva a sessão atual e age nas demais do ator", () => {
  const p = planRevocation("others", undefined, undefined, A, S1, false);
  if (!p.ok) fail("esperava plano ok para others");
  if (p.actor !== A) fail(`actor deveria ser o caller (${A})`);
  if (p.preserve !== S1) fail(`preserve deveria ser a sessão atual ${S1}`);
  if (p.targetSession !== null) fail("others não usa targetSession");
});

// ─── Decodificação do JWT (fail-closed, sem vazar tokens) ───

Deno.test("decodeJwtClaims extrai session_id de um JWT de acesso", () => {
  const header = btoa(JSON.stringify({ alg: "HS256" })).replace(/=+$/, "");
  const payload = btoa(JSON.stringify({ sub: A, session_id: S1, role: "authenticated" })).replace(/=+$/, "");
  const token = `${header}.${payload}.sig`;
  const claims = decodeJwtClaims(token);
  if (claims.session_id !== S1) fail(`session_id deveria ser ${S1}, veio ${claims.session_id}`);
});

Deno.test("decodeJwtClaims devolve {} para entrada malformada (não lança nem vaza)", () => {
  if (Object.keys(decodeJwtClaims("nao-e-jwt")).length !== 0) fail("token malformado deveria devolver {}");
  if (Object.keys(decodeJwtClaims("a.b")).length !== 0) fail("jwt com 2 partes deveria devolver {}");
  // payload base64 inválido
  if (Object.keys(decodeJwtClaims("a.!!!não-base64.c")).length !== 0) fail("payload inválido deveria devolver {}");
});

// ─── Auditoria das revogações (acceptance 3: quem revogou, qual escopo, alvo) ───

Deno.test("auditoria global self: ator é o próprio chamador e alvo é ele mesmo", () => {
  const p = planRevocation("global", undefined, undefined, A, S1, false);
  if (!p.ok) fail("esperava plano ok");
  const row = buildRevocationAudit(p, A, 3, "203.0.113.9");
  if (row.user_id !== A) fail(`ator da auditoria deveria ser ${A}, veio ${row.user_id}`);
  if (row.details.target_user_id !== A) fail(`alvo deveria ser ${A}, veio ${row.details.target_user_id}`);
  if (row.details.scope !== "global") fail(`escopo deveria ser global, veio ${row.details.scope}`);
  if (row.details.revoked !== 3) fail(`revoked deveria preservar 3, veio ${row.details.revoked}`);
  if (row.ip_address !== "203.0.113.0") fail(`ip deveria sair mascarado (sem o último octeto), veio ${row.ip_address}`);
  if (row.ip_address.includes("113.9")) fail("ip mascarado não pode conter o endereço completo");
  if (row.details.resultado !== "revogado") fail(`resultado do sucesso deveria ser revogado, veio ${row.details.resultado}`);
  if (row.entity_id !== null) fail("global não tem sessão alvo (entity_id deveria ser null)");
  if (row.action !== "auth_sessions_revoke" || row.entity_type !== "auth_session") fail("action/entity_type errados");
});

Deno.test("auditoria global de terceiro por admin: ator é o admin, alvo é o terceiro", () => {
  const p = planRevocation("global", B, undefined, A, S1, true);
  if (!p.ok) fail("esperava plano ok");
  const row = buildRevocationAudit(p, A, 2, "203.0.113.9");
  // O ator NUNCA é o alvo: quem agiu foi A (admin), e B só consta como alvo.
  if (row.user_id !== A) fail(`ator deveria ser o admin ${A}, veio ${row.user_id}`);
  if (row.details.target_user_id !== B) fail(`alvo deveria ser o terceiro ${B}, veio ${row.details.target_user_id}`);
  if (String(row.user_id) === String(row.details.target_user_id)) fail("ator e alvo não podem coincidir numa revogação de terceiro");
});

Deno.test("auditoria local: entity_id é a sessão alvo e o alvo é o próprio ator", () => {
  const p = planRevocation("local", undefined, S1, A, S1, false);
  if (!p.ok) fail("esperava plano ok");
  const row = buildRevocationAudit(p, A, 1, "198.51.100.4");
  if (row.user_id !== A) fail(`ator deveria ser ${A}`);
  if (row.details.target_user_id !== A) fail("local age nas sessões do próprio ator");
  if (row.entity_id !== S1) fail(`entity_id deveria ser a sessão alvo ${S1}, veio ${row.entity_id}`);
  if (row.details.scope !== "local") fail("escopo deveria ser local");
});

Deno.test("auditoria 'others': preserva a sessão atual (não a registra como alvo) e não vaza sessão", () => {
  const p = planRevocation("others", undefined, undefined, A, S1, false);
  if (!p.ok) fail("esperava plano ok");
  const row = buildRevocationAudit(p, A, 5, "198.51.100.4");
  if (row.user_id !== A) fail(`ator deveria ser ${A}`);
  if (row.details.target_user_id !== A) fail("others age nas sessões do próprio ator");
  if (row.entity_id !== null) fail("others não tem uma sessão alvo única (entity_id deveria ser null)");
  const serialized = JSON.stringify(row);
  if (serialized.includes(S1)) fail("a sessão preservada não pode aparecer na auditoria");
});

Deno.test("recordRevocationAudit grava na tabela audit_logs pela service role", async () => {
  const captured: { table: string; row: unknown }[] = [];
  const sink = {
    from(table: string) {
      return {
        insert(row: unknown) {
          captured.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  const p = planRevocation("global", B, undefined, A, S1, true);
  if (!p.ok) fail("esperava plano ok");
  const row = buildRevocationAudit(p, A, 1, "203.0.113.9");
  const result = await recordRevocationAudit(sink, row);
  if (!result.ok) fail("insert sem erro deveria devolver ok=true");
  if (result.error !== null) fail("ok=true deve ter error=null");
  if (captured.length !== 1) fail(`esperava 1 insert, veio ${captured.length}`);
  if (captured[0].table !== "audit_logs") fail(`tabela deveria ser audit_logs, veio ${captured[0].table}`);
  if (captured[0].row !== row) fail("a linha gravada deveria ser exatamente a montada");
});

Deno.test("recordRevocationAudit devolve a falha em vez de lançar (não engole)", async () => {
  const sink = {
    from() {
      return { insert() { return Promise.resolve({ error: { message: "rls denied" } }); } };
    },
  };
  const p = planRevocation("global", undefined, undefined, A, S1, false);
  if (!p.ok) fail("esperava plano ok");
  const result = await recordRevocationAudit(sink, buildRevocationAudit(p, A, 1, "203.0.113.9"));
  if (result.ok) fail("insert com erro deveria devolver ok=false");
  if (result.error !== "rls denied") fail(`erro deveria ser propagado, veio ${result.error}`);
});

// ---- Ponto 1: máscara de IP (nunca grava o endereço completo) ----

Deno.test("maskIpForAudit zera o último octeto do IPv4", () => {
  if (maskIpForAudit("203.0.113.9") !== "203.0.113.0") fail("IPv4 deveria sair com o último octeto zerado");
  if (maskIpForAudit(" 198.51.100.44 ") !== "198.51.100.0") fail("deveria aparar espaços antes de mascarar");
});

Deno.test("maskIpForAudit trunca IPv6 e nunca devolve o endereço completo", () => {
  const full = "2001:0db8:aaaa:bbbb:cccc:dddd:eeee:ffff";
  const masked = maskIpForAudit(full);
  if (masked === full) fail("IPv6 completo não pode ser gravado");
  if (masked.includes("eeee")) fail(`IPv6 deveria ser truncado, veio ${masked}`);
  // IPv4 mapeado em IPv6: máscara o IPv4 embutido.
  if (maskIpForAudit("::ffff:203.0.113.9") !== "203.0.113.0") fail("IPv4 mapeado deveria sair mascarado");
});

Deno.test("maskIpForAudit falha fechado: vazio, unknown e lixo viram unknown", () => {
  for (const raw of ["", "   ", "unknown", "abc", "999.999"]) {
    if (maskIpForAudit(raw) !== "unknown") fail(`${JSON.stringify(raw)} deveria virar unknown`);
  }
});

// ---- Ponto 2: tentativa negada pela matriz também é auditada ----

Deno.test("buildDeniedRevocationAudit monta a linha do negado", () => {
  const row = buildDeniedRevocationAudit({ scope: "global", callerId: A, targetUserId: B, ip: "203.0.113.9" });
  if (row.user_id !== A) fail("ator deveria ser quem tentou");
  if (row.details.target_user_id !== B) fail("alvo deveria ser o terceiro negado");
  if (row.details.scope !== "global") fail("escopo deveria ser global");
  if (row.details.resultado !== "negado") fail(`resultado deveria ser negado, veio ${row.details.resultado}`);
  if (row.details.revoked !== 0) fail("negado não revoga nada (revoked deveria ser 0)");
  if (row.entity_id !== null) fail("negado não tem sessão alvo (entity_id deveria ser null)");
  if (row.ip_address !== "203.0.113.0") fail(`ip do negado também é mascarado, veio ${row.ip_address}`);
  if (row.action !== "auth_sessions_revoke" || row.entity_type !== "auth_session") fail("action/entity_type errados");
});

// ---- Ponto 3: handler de verdade com clientes falsos (matriz + auditoria) ----

type CapturedRow = Record<string, unknown>;

function makeFakeClients(opts: {
  callerId: string;
  roles: Record<string, string | null>;
  revokeCount?: number;
  auditError?: { message: string } | null;
}): { clients: Parameters<typeof handleRevokeAuthSessionsCore>[1]; captured: CapturedRow[] } {
  const captured: CapturedRow[] = [];
  const clients = {
    userClient: {
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: { id: opts.callerId } }, error: null }),
      },
    },
    adminClient: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        if (fn === "effective_role") {
          const role = (args._user_id != null ? opts.roles[String(args._user_id)] : null) ?? null;
          return Promise.resolve({ data: role, error: null });
        }
        if (fn === "revoke_auth_sessions") {
          return Promise.resolve({ data: opts.revokeCount ?? 1, error: null });
        }
        return Promise.resolve({ data: null, error: { message: `rpc desconhecido: ${fn}` } });
      },
      from: (table: string) => ({
        insert: (row: unknown) => {
          if (table !== "audit_logs") return Promise.resolve({ error: { message: `tabela inesperada: ${table}` } });
          captured.push(row as CapturedRow);
          return Promise.resolve({ error: opts.auditError ?? null });
        },
      }),
    },
  };
  return { clients, captured };
}

function makePostRequest(body: unknown, ip: string): Request {
  return new Request("http://localhost/revoke-auth-sessions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer xx.yy.zz",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

// Supervisor -> admin (global, terceiro): a matriz nega (403) E a tentativa é auditada como "negado".
Deno.test("handler: supervisor revogando admin recebe 403 e audita o negado", async () => {
  const SUP = "00000000-0000-4000-8000-000000000011";
  const ADM = "00000000-0000-4000-8000-000000000022";
  const { clients, captured } = makeFakeClients({ callerId: SUP, roles: { [SUP]: "supervisor", [ADM]: "admin" } });
  const res = await handleRevokeAuthSessionsCore(
    makePostRequest({ scope: "global", target_user_id: ADM }, "10.20.30.41"),
    clients,
  );
  if (res.status !== 403) fail(`deveria ser 403, veio ${res.status}`);
  if (captured.length !== 1) fail(`negado deveria gerar 1 linha de auditoria, gerou ${captured.length}`);
  const row = captured[0];
  const details = row.details as Record<string, unknown>;
  if (row.user_id !== SUP) fail("auditoria do negado deveria registrar o ator");
  if (details.target_user_id !== ADM) fail("auditoria do negado deveria registrar o alvo");
  if (details.resultado !== "negado") fail(`resultado deveria ser negado, veio ${String(details.resultado)}`);
  if (row.ip_address !== "10.20.30.0") fail(`ip do negado deveria sair mascarado, veio ${String(row.ip_address)}`);
});

// Supervisor -> agente (global, terceiro): a matriz autoriza (200) e audita como "revogado".
Deno.test("handler: supervisor revogando agente recebe 200 e audita o revogado", async () => {
  const SUP = "00000000-0000-4000-8000-000000000033";
  const AGE = "00000000-0000-4000-8000-000000000044";
  const { clients, captured } = makeFakeClients({ callerId: SUP, roles: { [SUP]: "supervisor", [AGE]: "agent" }, revokeCount: 2 });
  const res = await handleRevokeAuthSessionsCore(
    makePostRequest({ scope: "global", target_user_id: AGE }, "10.20.30.42"),
    clients,
  );
  if (res.status !== 200) fail(`deveria ser 200, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  if (body.revoked !== 2 || body.scope !== "global" || body.audited !== true) {
    fail(`corpo inesperado: ${JSON.stringify(body)}`);
  }
  if (captured.length !== 1) fail(`sucesso deveria gerar 1 linha de auditoria, gerou ${captured.length}`);
  const details = captured[0].details as Record<string, unknown>;
  if (details.resultado !== "revogado") fail(`resultado deveria ser revogado, veio ${String(details.resultado)}`);
  if (captured[0].ip_address !== "10.20.30.0") fail("ip do sucesso deveria sair mascarado");
});

// Admin -> qualquer papel (global, terceiro): autoriza (200) e audita.
Deno.test("handler: admin revogando supervisor recebe 200 e audita", async () => {
  const ADM = "00000000-0000-4000-8000-000000000055";
  const SUP = "00000000-0000-4000-8000-000000000066";
  const { clients, captured } = makeFakeClients({ callerId: ADM, roles: { [ADM]: "admin", [SUP]: "supervisor" } });
  const res = await handleRevokeAuthSessionsCore(
    makePostRequest({ scope: "global", target_user_id: SUP }, "10.20.30.43"),
    clients,
  );
  if (res.status !== 200) fail(`deveria ser 200, veio ${res.status}`);
  if (captured.length !== 1) fail(`sucesso deveria gerar 1 linha de auditoria, gerou ${captured.length}`);
  if (captured[0].user_id !== ADM) fail("auditoria deveria registrar o admin como ator");
});

// ---- Ponto 4: falha na auditoria não desfaz a revogação ----

Deno.test("handler: auditoria falhou no sucesso mantém 200 com audited:false", async () => {
  const ADM = "00000000-0000-4000-8000-000000000077";
  const AGE = "00000000-0000-4000-8000-000000000088";
  const { clients } = makeFakeClients({
    callerId: ADM,
    roles: { [ADM]: "admin", [AGE]: "agent" },
    auditError: { message: "audit_logs fora do ar" },
  });
  const res = await handleRevokeAuthSessionsCore(
    makePostRequest({ scope: "global", target_user_id: AGE }, "10.20.30.44"),
    clients,
  );
  if (res.status !== 200) fail(`revogação feita deve continuar 200 mesmo sem auditoria, veio ${res.status}`);
  const body = await res.json() as Record<string, unknown>;
  if (body.audited !== false) fail(`audited deveria ser false, veio ${JSON.stringify(body)}`);
  if (body.revoked !== 1) fail("revoked deveria continuar refletindo a primitiva");
});

Deno.test("handler: auditoria falhou no negado mantém o 403", async () => {
  const SUP = "00000000-0000-4000-8000-000000000099";
  const ADM = "00000000-0000-4000-8000-0000000000aa";
  const { clients } = makeFakeClients({
    callerId: SUP,
    roles: { [SUP]: "supervisor", [ADM]: "admin" },
    auditError: { message: "audit_logs fora do ar" },
  });
  const res = await handleRevokeAuthSessionsCore(
    makePostRequest({ scope: "global", target_user_id: ADM }, "10.20.30.45"),
    clients,
  );
  if (res.status !== 403) fail(`negado continua 403 mesmo sem auditoria, veio ${res.status}`);
});

// ─── Matriz de papéis da revogação de terceiro (critério 1) ───────────────────
// A regra pura é o que o handler usa para decidir; provo cada célula da matriz.

function decision(callerRole: string | null, targetRole: string | null, isSelf = false) {
  return decideThirdPartyRevocation({
    isSelf,
    callerRole: normalizeRole(callerRole),
    targetRole: normalizeRole(targetRole),
  });
}

Deno.test("matriz: supervisor → admin é 403", () => {
  const d = decision("supervisor", "admin");
  if (d.allowed) fail("supervisor não pode derrubar admin");
  if (d.status !== 403) fail(`esperava 403, veio ${d.status}`);
});

Deno.test("matriz: supervisor → supervisor é 403", () => {
  const d = decision("supervisor", "supervisor");
  if (d.allowed) fail("supervisor não pode derrubar outro supervisor");
});

Deno.test("matriz: supervisor → agente é permitido", () => {
  const d = decision("supervisor", "agent");
  if (!d.allowed) fail("supervisor deve poder revogar a sessão de um agente");
});

Deno.test("matriz: supervisor → special_agent é permitido", () => {
  const d = decision("supervisor", "special_agent");
  if (!d.allowed) fail("special_agent é tier de agente: supervisor pode revogar");
});

Deno.test("matriz: admin → qualquer é permitido (admin/supervisor/agent)", () => {
  for (const alvo of ["admin", "supervisor", "special_agent", "agent"]) {
    const d = decision("admin", alvo);
    if (!d.allowed) fail(`admin deve poder revogar a sessão de ${alvo}`);
  }
});

Deno.test("matriz: agente → outro agente é 403 (só a própria)", () => {
  const d = decision("agent", "agent");
  if (d.allowed) fail("agente não pode derrubar a sessão de outro");
  if (d.status !== 403) fail(`esperava 403, veio ${d.status}`);
});

Deno.test("matriz: a própria sessão nunca é barrada, de qualquer papel", () => {
  for (const caller of ["admin", "supervisor", "special_agent", "agent", null]) {
    if (!decision(caller, "admin", true).allowed) fail(`self de ${caller} deveria ser permitido`);
  }
});

Deno.test("matriz: papel desconhecido nega (fail-closed) nos dois lados", () => {
  if (decision(null, "agent").allowed) fail("chamador sem papel não pode revogar terceiro");
  if (decision("supervisor", null).allowed) fail("alvo sem papel não pode ser alvo de supervisor");
  if (decision("supervisor", "papel-novo").allowed) fail("papel não reconhecido não pode ser alvo de supervisor");
});

Deno.test("normalizeRole aceita só os papéis canônicos", () => {
  if (normalizeRole("admin") !== "admin") fail("admin deveria normalizar");
  if (normalizeRole("special_agent") !== "special_agent") fail("special_agent deveria normalizar");
  if (normalizeRole("superuser") !== null) fail("papel desconhecido deveria virar null");
  if (normalizeRole(undefined) !== null) fail("undefined deveria virar null");
});

Deno.test("resolveEffectiveRole lê effective_role e nega em erro", async () => {
  const okClient = {
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn !== "effective_role" || args._user_id !== A) fail("deve chamar effective_role com o _user_id do alvo");
      return Promise.resolve({ data: "supervisor", error: null });
    },
  };
  if (await resolveEffectiveRole(okClient, A) !== "supervisor") fail("deveria resolver supervisor");

  const errClient = {
    rpc() { return Promise.resolve({ data: null, error: { message: "boom" } }); },
  };
  if (await resolveEffectiveRole(errClient, A) !== null) fail("erro no RPC deveria negar (null)");
});
