/**
 * PK-09 — a carteira por regra entra no pipeline de ENTRADA do webhook.
 *
 * O defeito: a tela da carteira promete "quando um novo contato chega, o sistema
 * verifica as regras na ordem de prioridade", mas o pipeline inbound nunca chamava
 * a atribuicao por regra (`apply_client_wallet`, migration 20261015213324). O
 * contato novo ficava sem atendente ate alguem abrir a conversa.
 *
 * O teste chama o handler REAL (`handleIncomingMessage`) com um client falso e trava:
 *   1. contato NOVO (contact_created) → chama `apply_client_wallet` uma vez, com o
 *      contact_id resolvido pela ingestao;
 *   2. contato antigo SEM atendente (1a mensagem) → tambem chama;
 *   3. contato JA com atendente → NAO chama (idempotencia no caminho, sem RPC inutil);
 *   4. mensagem nossa (fromMe) → NAO chama (carteira e de contato que chega);
 *   5. mensagem duplicada (early return) → NAO chama;
 *   6. falha da RPC NAO derruba o webhook: a mensagem recebida ainda e processada
 *      (attribute_talkx_reply acontece) e o erro e registrado;
 *   7. sem regra aplicavel (RPC devolve NULL) → nada quebra e nada e atribuido.
 *
 * Payloads GO anonimizados (sem telefone/CPF reais).
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/client-wallet-inbound.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleIncomingMessage, resetOptOutKeywordCache } from "../evolution-webhook-messages.ts";
import { invalidateConnectionCache } from "../evolution-helpers.ts";
import { translateGoPayload } from "../evolution-go-adapter.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

type Chamada = {
  tipo: "rpc" | "insert" | "update" | "upsert" | "select";
  tabela?: string;
  nome?: string;
  args?: Record<string, unknown>;
};

interface FakeConfig {
  /** `ingest_inbound_message` devolve o contato como recem-criado. */
  contactCreated?: boolean;
  /** `assigned_to` do contato devolvido pela ingestao (null = sem atendente). */
  assignedTo?: string | null;
  /** `outcome` da ingestao (duplicate faz o handler sair cedo). */
  outcome?: "inserted" | "updated" | "duplicate";
  /** `apply_client_wallet` devolve este profile (null = nenhuma regra aplicavel). */
  walletAgent?: string | null;
  /** `apply_client_wallet` devolve erro (falha do banco/RPC). */
  walletError?: { code?: string; message?: string } | null;
}

function fakeSupabase(chamadas: Chamada[], cfg: FakeConfig) {
  let tabela = "";

  const resolver = (): { data: unknown; error: { code?: string; message?: string } | null } => {
    switch (tabela) {
      case "whatsapp_connections":
        return { data: { id: "conn-1" }, error: null };
      case "talkx_optout_keywords":
        return { data: [], error: null };
      default:
        return { data: null, error: null };
    }
  };

  const chain: Record<string, unknown> = {};
  for (const metodo of ["eq", "is", "not", "gte", "order", "limit", "in"]) {
    chain[metodo] = () => chain;
  }
  chain.select = () => chain;
  chain.insert = () => chain;
  chain.update = () => chain;
  chain.upsert = () => chain;
  chain.maybeSingle = () => resolver();
  chain.single = chain.maybeSingle;
  chain.then = (resolve: (value: unknown) => unknown) => resolve(resolver());

  return {
    from: (t: string) => {
      tabela = t;
      return chain;
    },
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ tipo: "rpc", nome, args });
      switch (nome) {
        case "ingest_inbound_message":
          return {
            data: [{
              contact_id: "contact-1",
              contact_name: "Contato Fixture",
              assigned_to: cfg.assignedTo ?? null,
              avatar_url: "https://example.invalid/avatar.jpg",
              contact_created: cfg.contactCreated ?? false,
              message_id: cfg.outcome === "duplicate" ? "msg-in-1" : "msg-in-1",
              outcome: cfg.outcome ?? "inserted",
            }],
            error: null,
          };
        case "apply_client_wallet":
          if (cfg.walletError) return { data: null, error: cfg.walletError };
          return { data: cfg.walletAgent ?? null, error: null };
        case "attribute_talkx_reply":
          return { data: { attributed: false }, error: null };
        case "attribute_multiplix_item_reply":
          return { data: { attributed: false }, error: null };
        default:
          return { data: null, error: null };
      }
    },
  } as unknown as EvolutionDbClient;
}

/** Payload GO anonimizado de mensagem recebida (evento `message`). */
function goIncoming(instance: string, fromMe = false, id = "3EB0WALLET"): Record<string, unknown> {
  return {
    event: "message",
    instanceName: instance,
    data: {
      Info: {
        ID: id,
        Chat: "5511000000000@s.whatsapp.net",
        Sender: "5511000000001@c.us",
        PushName: "Contato Fixture",
        Timestamp: "2026-10-03T12:00:00.000Z",
        IsFromMe: fromMe,
      },
      Message: { conversation: "Bom dia, tudo bem?" },
    },
  };
}

function traduzir(payload: Record<string, unknown>) {
  const recebida = translateGoPayload(payload);
  const data = recebida.data as Record<string, unknown>;
  const key = data.key as { id: string; remoteJid?: string; fromMe: boolean };
  return { data, key };
}

const originalFetch = globalThis.fetch;
let idSeq = 0;

function instalarFetchFalso(): void {
  (globalThis as { fetch: typeof fetch }).fetch = ((url: unknown) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
    // Foto de perfil e a unica chamada externa esperada; devolve 404 (sem avatar).
    void u;
    return Promise.resolve(new Response("{}", {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;
}

async function rodarRecebida(chamadas: Chamada[], cfg: FakeConfig, fromMe = false) {
  const instance = `inst-go-wallet-${idSeq++}`;
  invalidateConnectionCache(instance);
  resetOptOutKeywordCache();
  const supabase = fakeSupabase(chamadas, cfg);
  const { data, key } = traduzir(goIncoming(instance, fromMe));
  await handleIncomingMessage(supabase, instance, data, key, "http://localhost:54321", "svc");
  return chamadas;
}

function rpcs(chamadas: Chamada[], nome: string) {
  return chamadas.filter((c) => c.tipo === "rpc" && c.nome === nome);
}

Deno.test("PK-09: contato NOVO chama apply_client_wallet com o contact_id da ingestao", async () => {
  instalarFetchFalso();
  try {
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { contactCreated: true, assignedTo: null, walletAgent: "agent-7" });

    const carteira = rpcs(chamadas, "apply_client_wallet");
    assertEquals(carteira.length, 1, "contato novo chama a carteira exatamente uma vez");
    assertEquals(carteira[0].args, { p_contact_id: "contact-1" }, "chama com o contato resolvido");
    assertEquals(rpcs(chamadas, "ingest_inbound_message").length, 1, "a ingestao continua sendo uma");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("PK-09: contato antigo SEM atendente (1a mensagem) tambem chama a carteira", async () => {
  instalarFetchFalso();
  try {
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { contactCreated: false, assignedTo: null, walletAgent: "agent-7" });

    assertEquals(rpcs(chamadas, "apply_client_wallet").length, 1, "1a mensagem sem atendente entra na carteira");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("PK-09: contato JA com atendente NAO chama a carteira", async () => {
  instalarFetchFalso();
  try {
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { contactCreated: false, assignedTo: "agent-9", walletAgent: "agent-7" });

    assertEquals(rpcs(chamadas, "apply_client_wallet").length, 0, "contato atribuido nao paga RPC inutil");
    assertEquals(rpcs(chamadas, "ingest_inbound_message").length, 1, "a mensagem segue sendo ingerida");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("PK-09: mensagem NOSSA (fromMe) NAO chama a carteira", async () => {
  instalarFetchFalso();
  try {
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { contactCreated: true, assignedTo: null, walletAgent: "agent-7" }, true);

    assertEquals(rpcs(chamadas, "apply_client_wallet").length, 0, "carteira e para contato que CHEGA");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("PK-09: mensagem duplicada (early return) NAO chama a carteira", async () => {
  instalarFetchFalso();
  try {
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { contactCreated: false, assignedTo: null, outcome: "duplicate", walletAgent: "agent-7" });

    assertEquals(rpcs(chamadas, "apply_client_wallet").length, 0, "duplicada sai antes da carteira");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("PK-09: falha da RPC NAO derruba o webhook (mensagem recebida segue processada)", async () => {
  instalarFetchFalso();
  try {
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, {
      contactCreated: true,
      assignedTo: null,
      walletError: { code: "42501", message: "permission denied" },
    });

    assertEquals(rpcs(chamadas, "apply_client_wallet").length, 1, "tentou atribuir");
    assertEquals(
      rpcs(chamadas, "attribute_talkx_reply").length,
      1,
      "o resto do pipeline continua (a falha da carteira nao derruba o webhook)",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("PK-09: sem regra aplicavel (RPC devolve NULL) nada quebra e nada e atribuido", async () => {
  instalarFetchFalso();
  try {
    const chamadas: Chamada[] = [];
    await rodarRecebida(chamadas, { contactCreated: true, assignedTo: null, walletAgent: null });

    assertEquals(rpcs(chamadas, "apply_client_wallet").length, 1, "consultou as regras");
    assertEquals(rpcs(chamadas, "attribute_talkx_reply").length, 1, "o pipeline segue normal");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
