/**
 * R2-INF-023 — a versão do contexto medida na revalidação atravessa até a RPC
 * `persist_conversation_analysis`, que decide ATOMICAMENTE (sob lock da linha
 * do contato) se a análise ainda é vigente.
 *
 * O defeito da auditoria: a revalidação lia a versão corrente mas a DESCARTAVA
 * (`currentVersion: null` no caminho de sucesso) e a RPC recebia só
 * `p_analyzed_at = new Date()` do handler. O predicado `<= p_analyzed_at`
 * aceitava qualquer timestamp posterior — então uma leitura de revalidação
 * ATRASADA (snapshot velho que ainda não chegou ao handler) deixava a análise
 * antiga gravar por cima de uma projeção concorrente que já tinha commitado.
 *
 * A correção (D1–D9 do cartão):
 *   - `revalidateContextBeforeEffect` devolve a versão medida no sucesso
 *     (`undefined` = não medida, nunca confundida com `null` medido);
 *   - `projectionGuardArgs` traduz a versão para a trava da RPC
 *     (`p_expected_projection_updated_at` + `p_should_project`, ambos
 *     OBRIGATÓRIOS na assinatura nova — a proteção não é opcional);
 *   - `persistConversationAnalysisGuarded` é o caminho ÚNICO dos dois handlers:
 *     monta nada, chama a `rpc` injetada e traduz `superseded` em cancelamento.
 *
 * Os clientes Supabase aqui são falsos injetados nos thunks — o código sob
 * teste é sempre o de produção.
 */
import {
  assert,
  assertEquals,
  assertFalse,
  assertObjectMatch,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  CONTEXT_SUPERSEDED_REASON,
  contextCancelledEnvelope,
  revalidateContextBeforeEffect,
} from "../schemas.ts";
import {
  type PersistConversationAnalysisArgs,
  persistConversationAnalysisGuarded,
  projectionGuardArgs,
} from "../ai-conversation-pipeline.ts";

const CONTATO = "33333333-3333-4333-8333-333333333333";
/** V: versão que a análise A leu na revalidação (snapshot já velho). */
const V = "2026-10-06T10:00:00.000Z";
/** V2: versão para a qual a análise B avançou a projeção DEPOIS da leitura de A. */
const V2 = "2026-10-06T10:00:03.500Z";

const ANALISE = { summary: "resumo de A", sentiment: "negativo" };

/** Cliente falso mínimo: registra o payload recebido e devolve `data` fixo. */
function fakeRpc(data: unknown) {
  const sent: PersistConversationAnalysisArgs[] = [];
  const rpc = (args: PersistConversationAnalysisArgs) => {
    sent.push(args);
    return Promise.resolve({ data, error: null });
  };
  return { sent, rpc };
}

// ─── 1. O interleaving da auditoria ──────────────────────────
// leitura A -> commit B -> retorno da leitura A -> tentativa de persistir A.
// A revalidação devolve o SNAPSHOT V (vigente quando lido); a RPC é quem
// descobre, sob lock, que a projeção já está em V2 — e responde superseded.

Deno.test("interleaving: a versão medida na revalidação é a que chega à RPC como esperada", async () => {
  const revalidation = await revalidateContextBeforeEffect({
    expectedContactId: CONTATO,
    versionAtRequestStart: V,
    reloadVisibleContactId: () => Promise.resolve(CONTATO),
    // Snapshot V: a resposta desta leitura ainda está "em trânsito" quando B grava.
    loadCurrentVersion: () => Promise.resolve(V),
  });
  assertEquals(revalidation.current, true, "o snapshot V era vigente quando lido — a revalidação não cancela");
  assertEquals(
    revalidation.currentVersion,
    V,
    "a versão medida TEM de sair da revalidação (antes era descartada como null)",
  );

  // A RPC (banco) já enxerga V2, commitado por B: responde superseded.
  const { sent, rpc } = fakeRpc({ superseded: true, projected: false, current_version: V2 });
  const outcome = await persistConversationAnalysisGuarded({
    rpc,
    args: {
      p_contact_id: CONTATO,
      p_analysis: ANALISE,
      p_analyzed_at: new Date().toISOString(),
      ...projectionGuardArgs(revalidation.currentVersion),
    },
  });

  assertEquals(sent.length, 1);
  assertEquals(
    sent[0].p_expected_projection_updated_at,
    V,
    "a RPC recebe a versão ESPERADA (a medida na revalidação), não só um timestamp",
  );
  assertEquals(sent[0].p_should_project, true);
  assertEquals(outcome, { kind: "superseded", currentVersion: V2 });
});

Deno.test("interleaving: o retorno superseded vira o envelope cancelled canônico, nada é gravado", async () => {
  // Espelha o handler: outcome superseded -> contextCancelledEnvelope(200).
  const { rpc } = fakeRpc({ superseded: true, projected: false, current_version: V2 });
  const outcome = await persistConversationAnalysisGuarded({
    rpc,
    args: {
      p_contact_id: CONTATO,
      p_analysis: ANALISE,
      p_analyzed_at: new Date().toISOString(),
      ...projectionGuardArgs(V),
    },
  });
  assertEquals(outcome.kind, "superseded");
  if (outcome.kind !== "superseded") return;

  const envelope = contextCancelledEnvelope({
    capability: "ai-conversation-analysis",
    reason: CONTEXT_SUPERSEDED_REASON,
    currentVersion: outcome.currentVersion,
  });
  assertEquals(envelope.status, "cancelled");
  assertObjectMatch(envelope, {
    evidence: { reason: CONTEXT_SUPERSEDED_REASON, currentVersion: V2 },
  });
});

// ─── 2. Controle: sem concorrência, a projeção acontece ──────

Deno.test("controle: versão esperada bate com a corrente — análise grava e projeta", async () => {
  const revalidation = await revalidateContextBeforeEffect({
    expectedContactId: CONTATO,
    versionAtRequestStart: V,
    reloadVisibleContactId: () => Promise.resolve(CONTATO),
    loadCurrentVersion: () => Promise.resolve(V),
  });
  assertEquals(revalidation.current, true);

  const { sent, rpc } = fakeRpc({ analysis_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479", projected: true, superseded: false });
  const outcome = await persistConversationAnalysisGuarded({
    rpc,
    args: {
      p_contact_id: CONTATO,
      p_analysis: ANALISE,
      p_analyzed_at: new Date().toISOString(),
      ...projectionGuardArgs(revalidation.currentVersion),
    },
  });
  assertEquals(sent[0].p_should_project, true);
  assertEquals(sent[0].p_expected_projection_updated_at, V);
  assertEquals(outcome, {
    kind: "persisted",
    analysisId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    projected: true,
  });
});

// ─── 3. Guarda negativa: o payload NUNCA sai sem a trava ─────

Deno.test("guarda negativa: toda chamada leva p_expected_projection_updated_at e p_should_project", async () => {
  const { sent, rpc } = fakeRpc({ analysis_id: null, projected: false, superseded: false });
  await persistConversationAnalysisGuarded({
    rpc,
    args: {
      p_contact_id: CONTATO,
      p_analysis: ANALISE,
      p_analyzed_at: new Date().toISOString(),
      ...projectionGuardArgs(V),
    },
  });
  const args = sent[0] as unknown as Record<string, unknown>;
  // Se alguém voltar a mandar só p_contact_id/p_analysis/p_analyzed_at (a
  // assinatura antiga de 3 argumentos), estas chaves somem e o teste quebra.
  assert("p_expected_projection_updated_at" in args, "falta a versão esperada no payload da RPC");
  assert("p_should_project" in args, "falta o flag explícito de projetar no payload da RPC");
  assertEquals(args.p_should_project, true);
});

Deno.test("guarda: 'null' medido (contato sem projeção) é versão esperada legítima, não 'não medido'", () => {
  const args = projectionGuardArgs(null);
  assertEquals(args.p_should_project, true, "projeção medida como ausente continua protegida pela trava");
  assert("p_expected_projection_updated_at" in args);
  assertEquals(args.p_expected_projection_updated_at, null);
});

// ─── 4. Versão não medida: grava a análise, nunca projeta ────

Deno.test("leitura da versão falhou → análise grava mas projeção é desligada (p_should_project=false)", async () => {
  const revalidation = await revalidateContextBeforeEffect({
    expectedContactId: CONTATO,
    versionAtRequestStart: V,
    reloadVisibleContactId: () => Promise.resolve(CONTATO),
    loadCurrentVersion: () => Promise.reject(new Error("timeout")),
  });
  assertEquals(revalidation.current, true, "falha de leitura não cancela no escuro");
  assertEquals(
    revalidation.currentVersion,
    undefined,
    "não medido é `undefined` — distinguível do `null` medido",
  );

  // A RPC grava a análise mas (fiel ao SQL novo) não toca em contacts.
  const { sent, rpc } = fakeRpc({ analysis_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479", projected: false, superseded: false });
  const outcome = await persistConversationAnalysisGuarded({
    rpc,
    args: {
      p_contact_id: CONTATO,
      p_analysis: ANALISE,
      p_analyzed_at: new Date().toISOString(),
      ...projectionGuardArgs(revalidation.currentVersion),
    },
  });
  assertEquals(sent[0].p_should_project, false, "sem versão medida, a projeção NÃO é tentada");
  assertEquals(outcome, {
    kind: "persisted",
    analysisId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    projected: false,
  });
});

// ─── 5. Erro da RPC e caminho cancelado na revalidação ───────

Deno.test("erro da RPC é propagado como 'error', nunca como sucesso", async () => {
  const rpc = () => Promise.resolve({ data: null, error: { message: "relation contacts does not exist" } });
  const outcome = await persistConversationAnalysisGuarded({
    rpc,
    args: {
      p_contact_id: CONTATO,
      p_analysis: ANALISE,
      p_analyzed_at: new Date().toISOString(),
      ...projectionGuardArgs(V),
    },
  });
  assertEquals(outcome.kind, "error");
});

Deno.test("revalidação que cancela por contexto superado não chega a chamar a RPC", async () => {
  const revalidation = await revalidateContextBeforeEffect({
    expectedContactId: CONTATO,
    versionAtRequestStart: V,
    reloadVisibleContactId: () => Promise.resolve(CONTATO),
    // O banco já está em V2 no momento da leitura: cancela antes da RPC.
    loadCurrentVersion: () => Promise.resolve(V2),
  });
  assertFalse(revalidation.current);
  assertEquals(revalidation.reason, CONTEXT_SUPERSEDED_REASON);
  // Espelha o handler: com `current === false` a RPC não é chamada — nada a
  // provar aqui além de a decisão continuar intacta.
});
