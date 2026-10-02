/**
 * IA-048 — identidade de requisição e REVALIDAÇÃO de contexto antes do efeito.
 *
 * O que estes testes protegem, em uma frase: uma resposta ATRASADA de um
 * contexto já superado não pode causar efeito no servidor nem se passar pela
 * resposta vigente.
 *
 * O defeito medido: a trava de recência do banco compara
 * `ai_projection_updated_at <= p_analyzed_at`, mas `p_analyzed_at` era o
 * `new Date()` do SERVIDOR — então a resposta atrasada de um período antigo
 * chegava com timestamp MAIS NOVO e sobrescrevia a projeção. A correção aqui é
 * revalidar a versão do contato imediatamente antes de persistir e devolver
 * `status:'cancelled'` (vocabulário canônico) sem gravar nada.
 */
import {
  assert,
  assertEquals,
  assertFalse,
  assertObjectMatch,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  AiConversationAnalysisSchema,
  AiConversationSummarySchema,
  AiEnhanceMessageSchema,
  AiSuggestReplySchema,
  CONTACT_NOT_VISIBLE_REASON,
  CONTEXT_SUPERSEDED_REASON,
  contextCancelledEnvelope,
  evaluateContextVersionSupersession,
  revalidateContextBeforeEffect,
} from "../schemas.ts";

const UUID = "a3bb189e-8bf9-4888-9912-ace4e6543002";
const CONTATO = "33333333-3333-4333-8333-333333333333";
const INSTANTE_ANTIGO = "2026-10-01T10:00:00.000Z";
const INSTANTE_NOVO = "2026-10-01T10:05:00.000Z";

const cincoMensagens = [{}, {}, {}, {}, {}];

// ─── 1. Schema aceita/rejeita requestId (contrato aditivo) ───

Deno.test("requestId válido é aceito nos quatro schemas", () => {
  for (const schema of [AiConversationAnalysisSchema, AiConversationSummarySchema]) {
    const r = schema.safeParse({ messages: cincoMensagens, requestId: UUID, contextVersion: "7d" });
    assert(r.success, `análise/resumo deveriam aceitar requestId válido: ${!r.success ? JSON.stringify(r.error.issues) : ""}`);
    assertEquals(r.data.requestId, UUID);
    assertEquals(r.data.contextVersion, "7d");
  }
  assertEquals(AiSuggestReplySchema.safeParse({ requestId: UUID }).success, true);
  assertEquals(AiEnhanceMessageSchema.safeParse({ message: "oi", requestId: UUID }).success, true);
});

Deno.test("requestId malformado é rejeitado (não é ecoado como lixo)", () => {
  assertFalse(AiConversationAnalysisSchema.safeParse({ messages: cincoMensagens, requestId: "x" }).success);
  assertFalse(AiConversationSummarySchema.safeParse({ messages: cincoMensagens, requestId: "x" }).success);
  assertFalse(AiSuggestReplySchema.safeParse({ requestId: "x" }).success);
  assertFalse(AiEnhanceMessageSchema.safeParse({ message: "oi", requestId: "x" }).success);
});

Deno.test("cliente ANTIGO (sem requestId/contextVersion) continua aceito — compatibilidade", () => {
  for (const schema of [AiConversationAnalysisSchema, AiConversationSummarySchema]) {
    const r = schema.safeParse({ messages: cincoMensagens });
    assert(r.success, "o campo novo é opcional; o cliente antigo não pode quebrar");
    assertFalse("requestId" in r.data, "requestId ausente não pode virar chave");
    assertFalse("contextVersion" in r.data, "contextVersion ausente não pode virar chave");
  }
});

Deno.test("periodKey (nome canônico do frontend) é aceito como apelido da versão de contexto", () => {
  for (const schema of [AiConversationAnalysisSchema, AiConversationSummarySchema]) {
    const r = schema.safeParse({ messages: cincoMensagens, periodKey: "custom:2026-01-01:2026-01-31" });
    assert(r.success, "o frontend nomeia a versão de contexto de `periodKey`");
    assertEquals(r.data.periodKey, "custom:2026-01-01:2026-01-31");
  }
});

// ─── 2. Decisão pura: a versão corrente avançou além da base? ───

Deno.test("sem versão corrente (contato sem projeção) nada é sobrescrito", () => {
  const r = evaluateContextVersionSupersession({ versionAtRequestStart: INSTANTE_ANTIGO, currentVersion: null });
  assertFalse(r.superseded);
});

Deno.test("base nula + versão corrente presente = projeção apareceu DURANTE a requisição", () => {
  const r = evaluateContextVersionSupersession({ versionAtRequestStart: null, currentVersion: INSTANTE_NOVO });
  assert(r.superseded, "uma projeção surgida no meio do caminho torna a requisição superada");
});

Deno.test("versão corrente mais NOVA que a base → superada", () => {
  assert(
    evaluateContextVersionSupersession({ versionAtRequestStart: INSTANTE_ANTIGO, currentVersion: INSTANTE_NOVO }).superseded,
  );
});

Deno.test("versão corrente igual ou mais ANTIGA que a base → vigente", () => {
  assertFalse(
    evaluateContextVersionSupersession({ versionAtRequestStart: INSTANTE_NOVO, currentVersion: INSTANTE_NOVO }).superseded,
  );
  assertFalse(
    evaluateContextVersionSupersession({ versionAtRequestStart: INSTANTE_NOVO, currentVersion: INSTANTE_ANTIGO }).superseded,
  );
});

Deno.test("versão declarada pelo cliente tem precedência sobre a lida no início", () => {
  // O cliente declara que analisou a versão NOVA; o servidor começou com a antiga.
  // Comparar com a corrente (nova) não pode cancelar.
  const r = evaluateContextVersionSupersession({
    declaredVersion: INSTANTE_NOVO,
    versionAtRequestStart: INSTANTE_ANTIGO,
    currentVersion: INSTANTE_NOVO,
  });
  assertFalse(r.superseded, "a base efetiva é a versão declarada pelo cliente");
});

Deno.test("token OPACO (ex.: periodKey) não é tratado como data e não cancela", () => {
  // Cliente que manda '7d'/'custom:...' não pode ver TODA análise cancelada.
  const semBaseMedida = evaluateContextVersionSupersession({ declaredVersion: "7d", currentVersion: INSTANTE_NOVO });
  assertFalse(semBaseMedida.superseded, "token não-temporal não é base de comparação");

  const comBaseMedida = evaluateContextVersionSupersession({
    declaredVersion: "custom:2026-01-01:2026-01-31",
    versionAtRequestStart: INSTANTE_ANTIGO,
    currentVersion: INSTANTE_NOVO,
  });
  assert(comBaseMedida.superseded, "com base medida, a comparação por instante vale");
});

Deno.test("versão NÃO medida no início + sem versão declarada → não cancela no escuro", () => {
  const r = evaluateContextVersionSupersession({
    versionAtRequestStart: undefined,
    currentVersion: INSTANTE_NOVO,
  });
  assertFalse(r.superseded, "leitura que falhou não pode derrubar análise legítima");
});

// ─── 3. Porta única: revalidar ANTES do efeito ───

Deno.test("contato que deixou de ser visível cancela SEM persistar", async () => {
  let persistiu = false;
  let leuVersao = false;
  const result = await revalidateContextBeforeEffect({
    expectedContactId: CONTATO,
    versionAtRequestStart: null,
    reloadVisibleContactId: () => Promise.resolve(null),
    loadCurrentVersion: () => {
      leuVersao = true;
      return Promise.resolve(null);
    },
  });
  if (result.current) persistiu = true;
  assertFalse(persistiu, "nada pode ser persistido");
  assertFalse(leuVersao, "nem se lê a versão quando o contato já não é visível");
  assertEquals(result.current, false);
  assertEquals(result.reason, CONTACT_NOT_VISIBLE_REASON);
});

Deno.test("contexto superado → NÃO persiste e devolve o motivo canônico", async () => {
  let persistiu = false;
  const result = await revalidateContextBeforeEffect({
    expectedContactId: CONTATO,
    declaredVersion: INSTANTE_ANTIGO,
    versionAtRequestStart: null,
    reloadVisibleContactId: () => Promise.resolve(CONTATO),
    loadCurrentVersion: () => Promise.resolve(INSTANTE_NOVO),
  });
  // Espelha o handler: o RPC só roda quando `result.current` é verdadeiro.
  if (result.current) persistiu = true;
  assertFalse(persistiu, "a persistência NÃO pode acontecer quando o contexto foi superado");
  assertEquals(result.current, false);
  assertEquals(result.reason, CONTEXT_SUPERSEDED_REASON);
  assertEquals(result.currentVersion, INSTANTE_NOVO);
});

Deno.test("contexto vigente → a persistência acontece", async () => {
  let persistiu = false;
  const result = await revalidateContextBeforeEffect({
    expectedContactId: CONTATO,
    versionAtRequestStart: INSTANTE_ANTIGO,
    reloadVisibleContactId: () => Promise.resolve(CONTATO),
    loadCurrentVersion: () => Promise.resolve(INSTANTE_ANTIGO),
  });
  if (result.current) persistiu = true;
  assert(persistiu, "sem supersessão, o efeito é permitido");
  assertEquals(result.current, true);
});

Deno.test("leitura da versão que lança não cancela (tratada como não medida)", async () => {
  const result = await revalidateContextBeforeEffect({
    expectedContactId: CONTATO,
    versionAtRequestStart: INSTANTE_ANTIGO,
    reloadVisibleContactId: () => Promise.resolve(CONTATO),
    loadCurrentVersion: () => Promise.reject(new Error("timeout")),
  });
  assertEquals(result.current, true);
});

// ─── 4. Envelope cancelado ───

Deno.test("envelope cancelled ecoa o requestId e traz o motivo", () => {
  const envelope = contextCancelledEnvelope({
    capability: "ai-conversation-analysis",
    requestId: UUID,
    context: { version: 2 },
    reason: CONTEXT_SUPERSEDED_REASON,
    currentVersion: INSTANTE_NOVO,
  });
  assertEquals(envelope.status, "cancelled");
  assertEquals(envelope.capability, "ai-conversation-analysis");
  assertEquals(envelope.requestId, UUID);
  assertObjectMatch(envelope, { evidence: { reason: CONTEXT_SUPERSEDED_REASON, currentVersion: INSTANTE_NOVO } });
  assertEquals(envelope.context, { version: 2 });
});

Deno.test("envelope cancelled sem requestId do cliente ecoa null e omite context ausente", () => {
  const envelope = contextCancelledEnvelope({
    capability: "ai-conversation-summary",
    reason: CONTACT_NOT_VISIBLE_REASON,
  });
  assertEquals(envelope.requestId, null);
  assertFalse("context" in envelope, "context ausente não pode virar chave");
  assertEquals(envelope.evidence.currentVersion, null);
});
