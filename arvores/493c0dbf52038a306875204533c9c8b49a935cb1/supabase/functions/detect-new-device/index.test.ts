import {
  decodeJwtClaims,
  extractAuthSessionId,
  decideSessionUpsert,
  buildSessionInsert,
} from "./index.ts";

// R2-AUTH-004 (item 6): contratos executáveis do inventário de sessão.
// Sem rede e sem banco: só os helpers puros. O que é provado aqui:
//   1. mesma sessão Auth → atualiza a linha existente (não duplica);
//   2. sessões Auth distintas → auth_session_id distintos (distinguíveis);
//   4. session_id vem SÓ do claim JWT validado (nunca do corpo) e nunca vaza token.

function fail(msg: string): never {
  throw new Error(msg);
}

const A = "00000000-0000-4000-8000-000000000001";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

function makeToken(sessionId: string | null): string {
  const header = btoa(JSON.stringify({ alg: "HS256" })).replace(/=+$/, "");
  const payload: Record<string, unknown> = { sub: A, role: "authenticated" };
  if (sessionId) payload.session_id = sessionId;
  const b64 = btoa(JSON.stringify(payload)).replace(/=+$/, "");
  return `${header}.${b64}.sig`;
}

// ─── Critério 4: session_id vem SÓ do JWT validado (nunca do corpo) ───

Deno.test("extractAuthSessionId extrai session_id do claim JWT", () => {
  const sid = extractAuthSessionId(makeToken(S1));
  if (sid !== S1) fail(`esperava ${S1}, veio ${sid}`);
});

Deno.test("extractAuthSessionId devolve null sem claim ou com token malformado", () => {
  if (extractAuthSessionId(makeToken(null)) !== null) fail("JWT sem session_id deveria devolver null");
  if (extractAuthSessionId("nao-e-jwt") !== null) fail("token malformado deveria devolver null");
  if (extractAuthSessionId("a.b") !== null) fail("jwt com 2 partes deveria devolver null");
  if (extractAuthSessionId("a.!!!não-base64.c") !== null) fail("payload inválido deveria devolver null");
});

Deno.test("extractAuthSessionId ignora session_id fora do claim (só o token conta)", () => {
  // O corpo da requisição não entra na função: a assinatura só aceita o token.
  // Um payload malformado no claim nunca é elevado a session_id confiável.
  const header = btoa(JSON.stringify({ alg: "HS256" })).replace(/=+$/, "");
  const payload = btoa(JSON.stringify({ sub: A, session_id: 12345 })).replace(/=+$/, "");
  const sid = extractAuthSessionId(`${header}.${payload}.sig`);
  if (sid !== null) fail("session_id não-string deveria ser descartado (fail-closed)");
});

// ─── Critério 1: duas chamadas da mesma sessão → atualiza, não duplica ───

Deno.test("decideSessionUpsert atualiza linha existente da mesma sessão Auth", () => {
  const d = decideSessionUpsert("row-id-1");
  if (d.kind !== "update") fail("linha existente deveria atualizar (não inserir de novo)");
  if (d.sessionId !== "row-id-1") fail(`update deveria apontar para a linha existente, veio ${d.sessionId}`);
});

Deno.test("decideSessionUpsert insere na primeira visita da sessão Auth", () => {
  const d = decideSessionUpsert(null);
  if (d.kind !== "insert") fail("sem linha existente deveria inserir");
});

// ─── Critério 2: sessões distintas distinguíveis por auth_session_id ───

Deno.test("buildSessionInsert carrega auth_session_id distinto por sessão", () => {
  const now = new Date("2026-10-04T15:00:00Z");
  const row1 = buildSessionInsert({ userId: A, deviceId: "d1", authSessionId: S1, ipAddress: "1.1.1.1", userAgent: "ua", now });
  const row2 = buildSessionInsert({ userId: A, deviceId: "d1", authSessionId: S2, ipAddress: "1.1.1.1", userAgent: "ua", now });
  if (row1.auth_session_id !== S1) fail("linha 1 deveria carregar o auth_session_id S1");
  if (row2.auth_session_id !== S2) fail("linha 2 deveria carregar o auth_session_id S2");
  // S1 != S2 (constantes), e cada linha carrega o seu: as sessões são distinguíveis.
});

// ─── Nunca persiste token/secret ───

Deno.test("buildSessionInsert nunca persiste token ou secret", () => {
  const row = buildSessionInsert({
    userId: A, deviceId: "d1", authSessionId: S1,
    ipAddress: "1.1.1.1", userAgent: "ua", now: new Date(),
  });
  const keys = Object.keys(row).map((k) => k.toLowerCase());
  const forbidden = ["token", "access_token", "refresh_token", "jwt", "authorization", "password", "secret", "api_key"];
  for (const f of forbidden) {
    if (keys.some((k) => k.includes(f))) fail(`payload não deveria conter ${f}`);
  }
  if (row.auth_session_id !== S1) fail("payload deveria conter só o UUID auth_session_id");
});

Deno.test("decodeJwtClaims devolve {} para entrada malformada (não lança nem vaza)", () => {
  if (Object.keys(decodeJwtClaims("nao-e-jwt")).length !== 0) fail("token malformado deveria devolver {}");
  if (Object.keys(decodeJwtClaims("a.!!!não-base64.c")).length !== 0) fail("payload inválido deveria devolver {}");
});
