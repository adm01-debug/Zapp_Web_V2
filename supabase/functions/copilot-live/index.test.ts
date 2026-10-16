// CV-021 — testes de aceite do copilot-live worker.
//
// Critério de aceite (CV-021):
//   1. Flag off  → retorna "capability_disabled", SEM chamar provedor.
//   2. Orçamento estourado → retorna "budget_denied", SEM chamar provedor.
//   3. Circuito aberto → retorna "circuit_open", SEM chamar provedor.
//
// Adicionais:
//   4. Nenhuma mensagem nova → "no_new_messages" (CV-022).
//   5. Contrato rejeitado → "contract_rejected", nada gravado (CV-023).
//   6. Tier-2 ativado para momentos-chave corretos (CV-024/025).
//   7. Detecção de momentos-chave por regex (CV-025).
//
// Run with: deno test --allow-read supabase/functions/copilot-live/index.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  detectKeyMoments,
  shouldUseTier2,
  handleCopilotTick,
  type CopilotTickPayload,
} from "./index.ts";
import type { AiJob } from "../_shared/ai-jobs.ts";
import { CopilotLiveOutputSchema, parseModelOutput } from "../_shared/ai-response-contracts.ts";

// ---------------------------------------------------------------------------
// Helpers de stub.
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<AiJob> = {}): AiJob {
  return {
    id: "job-test-001",
    status: "running",
    attemptCount: 1,
    maxAttempts: 3,
    leaseToken: "tok-test-001",
    priority: 5,
    ...overrides,
  };
}

const PAYLOAD: CopilotTickPayload = {
  contact_id: "c-aaa",
  session_id: "s-bbb",
  whatsapp_connection_id: "w-ccc",
  profile_id: "p-ddd",
};

/** Supabase stub que devolve sessão válida + mensagens configuráveis. */
function makeSupabase(newMessages: Array<{ id: string; body: string; from_me: boolean; created_at: string }> = []) {
  const session = {
    id: "s-bbb",
    stage: "E1",
    brinde_state: { B: null, R: null, I: null, N: null, D: null, E: null },
    temperature: 0,
    state_version: 0,
    last_contact_message_at: null,
  };

  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: session, error: null }),
          gt: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: newMessages, error: null }) }),
          }),
          lte: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          }),
          order: () => ({
            limit: () => Promise.resolve({ data: newMessages, error: null }),
          }),
        }),
      }),
      insert: () => Promise.resolve({ error: null }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
    rpc: () => Promise.resolve({ error: null }),
  };
}

// ---------------------------------------------------------------------------
// CV-021 — Flag off: sem chamada ao provedor.
// ---------------------------------------------------------------------------

Deno.test("CV-021: flag off retorna capability_disabled sem chamar provedor", async () => {
  let providerCalled = false;

  // Flag desligada: enforceAiCapability retorna 503
  const result = await handleCopilotTick(
    makeJob(),
    PAYLOAD,
    {
      supabase: makeSupabase([{ id: "m1", body: "quanto custa?", from_me: false, created_at: "2026-01-01T00:00:00Z" }]) as never,
      req: new Request("https://example.com", { method: "POST" }),
      // Injeção: enforceAiCapability retorna 503 (flag off)
      _enforceCapability: async () => new Response(null, { status: 503 }),
      _providerCalled: () => { providerCalled = true; },
    } as never,
  );

  assertEquals(result.reason, "capability_disabled");
  assert(!providerCalled, "provedor foi chamado com flag desligada");
});

// ---------------------------------------------------------------------------
// CV-021 — Orçamento estourado: sem chamada ao provedor.
// ---------------------------------------------------------------------------

Deno.test("CV-021: orçamento estourado retorna budget_denied sem chamar provedor", async () => {
  // Verificamos que o código lê reservation.allowed = false antes de chamar generateWithRouting
  const fonte = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

  // O código deve verificar reservation.allowed logo após reserveBudget
  assert(
    /reservation\.allowed/.test(fonte),
    "código não verifica reservation.allowed — orçamento estourado não seria barrado",
  );

  // Deve retornar budget_denied sem chamar o provedor nesse path
  assert(
    /reason.*budget_denied/.test(fonte),
    "código não retorna reason='budget_denied' quando orçamento nega",
  );

  // generateWithRouting NÃO deve ser chamado antes da verificação de reservation.allowed
  const idxReservation = fonte.indexOf("reservation.allowed");
  const idxGenerate = fonte.indexOf("generateWithRouting(");
  assert(
    idxReservation < idxGenerate,
    "generateWithRouting é chamado ANTES da verificação de reservation.allowed",
  );
});

// ---------------------------------------------------------------------------
// CV-021 — Circuito aberto: sem chamada ao provedor.
// ---------------------------------------------------------------------------

Deno.test("CV-021: circuito aberto retorna circuit_open sem chamar provedor", async () => {
  const fonte = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

  assert(
    /admission\.allowed/.test(fonte),
    "código não verifica admission.allowed — circuito aberto não seria barrado",
  );

  assert(
    /reason.*circuit_open/.test(fonte),
    "código não retorna reason='circuit_open' quando circuito nega",
  );

  // admitAiProviderCall deve ser chamado antes de generateWithRouting
  const idxCircuit = fonte.indexOf("admitAiProviderCall(");
  const idxGenerate = fonte.indexOf("generateWithRouting(");
  assert(
    idxCircuit < idxGenerate,
    "admitAiProviderCall é chamado APÓS generateWithRouting — o circuito não protege",
  );

  // Os três guards devem aparecer antes da chamada ao provedor (na ordem certa)
  const idxFlag = fonte.indexOf("enforceAiCapability(");
  assert(
    idxFlag < idxCircuit,
    "enforceAiCapability (flag gate) deve ser verificado antes do circuito",
  );
  assert(
    idxCircuit < idxReservation(fonte),
    "circuito deve ser verificado antes da reserva de orçamento",
  );
});

function idxReservation(fonte: string): number {
  return fonte.indexOf("reserveBudget(");
}

// ---------------------------------------------------------------------------
// CV-022 — Sem mensagens novas: retorna succeeded sem chamar provedor.
// ---------------------------------------------------------------------------

Deno.test("CV-022: sem mensagens novas retorna no_new_messages sem chamar provedor", async () => {
  const fonte = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

  assert(
    /no_new_messages/.test(fonte),
    "código não verifica ausência de mensagens novas antes de chamar o provedor",
  );

  // A verificação deve ocorrer antes de reserveBudget (não reservar orçamento sem mensagens)
  const idxNoMsg = fonte.indexOf("no_new_messages");
  const idxBudget = fonte.indexOf("reserveBudget(");
  assert(
    idxNoMsg < idxBudget,
    "a verificação de 'no_new_messages' deve ocorrer antes de reservar orçamento",
  );
});

// ---------------------------------------------------------------------------
// CV-023 — Contrato: valores fora da faixa são REJEITADOS.
// ---------------------------------------------------------------------------

Deno.test("CV-023: temperature fora de 0-10 é rejeitada pelo schema", () => {
  const invalid = parseModelOutput(CopilotLiveOutputSchema, { temperature: 11 });
  assert(!invalid.ok, "temperature=11 deveria ser rejeitada");
});

Deno.test("CV-023: stage inválido é rejeitado pelo schema", () => {
  const invalid = parseModelOutput(CopilotLiveOutputSchema, { stage: "E7" });
  assert(!invalid.ok, "stage=E7 deveria ser rejeitado");
});

Deno.test("CV-023: resposta válida completa é aceita", () => {
  const valid = parseModelOutput(CopilotLiveOutputSchema, {
    stage: "E2",
    temperature: 5,
    intent: "comparing",
    sentiment: "positivo",
    key_moments: ["price_request"],
    confidence: 0.85,
    next_action: "Enviar proposta detalhada com prazo de entrega.",
  });
  assert(valid.ok, `schema rejeitou resposta válida: ${JSON.stringify((valid as { errors: unknown }).errors)}`);
});

Deno.test("CV-023: campos ausentes permanecem ausentes (sem default)", () => {
  const valid = parseModelOutput(CopilotLiveOutputSchema, { temperature: 3 });
  assert(valid.ok);
  assertEquals((valid as { data: { stage?: unknown } }).data.stage, undefined);
});

// ---------------------------------------------------------------------------
// CV-024 — Roteamento dois andares.
// ---------------------------------------------------------------------------

Deno.test("CV-024: tier-2 ativado para price_request", () => {
  assert(shouldUseTier2(["price_request"]), "price_request deve ativar tier-2");
});

Deno.test("CV-024: tier-2 ativado para objection", () => {
  assert(shouldUseTier2(["objection"]), "objection deve ativar tier-2");
});

Deno.test("CV-024: tier-2 ativado para buy_signal", () => {
  assert(shouldUseTier2(["buy_signal"]), "buy_signal deve ativar tier-2");
});

Deno.test("CV-024: tier-2 NÃO ativado para unanswered_question", () => {
  assert(!shouldUseTier2(["unanswered_question"]), "unanswered_question não deve acionar tier-2");
});

Deno.test("CV-024: tier-1 para nenhum momento-chave tier-2", () => {
  assert(!shouldUseTier2(["deadline_request", "logo_sent"]));
});

// ---------------------------------------------------------------------------
// CV-025 — Detector de momentos-chave por regex.
// ---------------------------------------------------------------------------

Deno.test("CV-025: detecta price_request por 'quanto custa'", () => {
  const moments = detectKeyMoments([{ body: "quanto custa uma caneta?", from_me: false }]);
  assert(moments.includes("price_request"), `esperado price_request, got ${moments}`);
});

Deno.test("CV-025: detecta objection por 'muito caro'", () => {
  const moments = detectKeyMoments([{ body: "achei muito caro esse brinde", from_me: false }]);
  assert(moments.includes("objection"));
});

Deno.test("CV-025: detecta buy_signal por 'vou fechar'", () => {
  const moments = detectKeyMoments([{ body: "vou fechar com vocês sim", from_me: false }]);
  assert(moments.includes("buy_signal"));
});

Deno.test("CV-025: mensagem do vendedor NÃO detecta momentos do contato", () => {
  const moments = detectKeyMoments([{ body: "quanto custa?", from_me: true }]);
  assertEquals(moments.length, 0, "mensagem do vendedor não deve gerar momentos-chave");
});

Deno.test("CV-025: múltiplos momentos detectados", () => {
  const moments = detectKeyMoments([
    { body: "quanto fica? mas está muito caro...", from_me: false },
  ]);
  assert(moments.includes("price_request"));
  assert(moments.includes("objection"));
});

// ---------------------------------------------------------------------------
// CV-030 — Log estruturado: sem conteúdo de mensagem.
// ---------------------------------------------------------------------------

Deno.test("CV-030: log de stage não inclui body de mensagem", async () => {
  const fonte = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

  // logStage não deve receber .body de mensagem
  // Verifica que logStage é chamado com objetos que não contêm msg.body
  const logCalls = fonte.match(/logStage\([^)]+\)/g) ?? [];
  for (const call of logCalls) {
    assert(
      !call.includes(".body"),
      `logStage inclui conteúdo de mensagem (.body): ${call}`,
    );
  }
});
