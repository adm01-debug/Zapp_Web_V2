/**
 * R2-API-016 — contrato executável do STATUS do envelope em `messages.update`.
 *
 * O que fica travado:
 *   1. status NÃO string (número/objeto — ex.: `state=3` serializado pelo pb.go
 *      ou por uma versão do provedor) numa entrada do lote NÃO lança TypeError
 *      e NÃO interrompe as demais. Antes, `status.toLowerCase()` estourava, o
 *      webhook devolvia 500 e os recibos VÁLIDOS do mesmo payload eram perdidos
 *      / reentregues pelo provedor;
 *   2. a entrada malformada tem saída EXPLÍCITA (log) e é descartada sem tocar
 *      o banco;
 *   3. o recibo válido que vem DEPOIS dela é processado normalmente;
 *   4. status string continua intacto (DELIVERY_ACK → delivered, READ → read e
 *      desconhecido → minúsculo), inclusive no shape de objeto único.
 *
 * O teste chama o handler REAL (handleMessagesUpdate) com um Request-equivalente
 * de payload — não uma cópia da lógica.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleMessagesUpdate } from "../evolution-webhook-msg-handlers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

type UpdateRegistrado = {
  tabela: string;
  filtros: Record<string, unknown>;
  payload: Record<string, unknown>;
};

type SupabaseFake = EvolutionDbClient & { updates: UpdateRegistrado[] };

/**
 * Mock chainable: `whatsapp_connections` devolve conn-1; `messages` casa pelas
 * linhas configuradas (cada `.eq` vira filtro conferido); o `update()` é
 * registrado no `await` do encadeamento (builder PostgREST é thenable).
 */
function fakeSupabase(mensagens: Record<string, unknown>[] = []): SupabaseFake {
  const updates: UpdateRegistrado[] = [];
  function novaQuery(tabela: string) {
    const filtros: Record<string, unknown> = {};
    let pendente: Record<string, unknown> | null = null;
    const chain: Record<string, unknown> = {};
    const mesmo = () => chain;
    chain.select = mesmo;
    chain.in = mesmo;
    chain.not = mesmo;
    chain.gte = mesmo;
    chain.order = mesmo;
    chain.limit = mesmo;
    chain.insert = mesmo;
    chain.upsert = mesmo;
    chain.is = (campo: string, valor: unknown) => {
      filtros[campo] = valor;
      return chain;
    };
    chain.eq = (campo: string, valor: unknown) => {
      filtros[campo] = valor;
      return chain;
    };
    chain.update = (payload: Record<string, unknown>) => {
      pendente = payload;
      return chain;
    };
    chain.maybeSingle = async () => {
      if (tabela === "whatsapp_connections") return { data: { id: "conn-1" }, error: null };
      if (tabela === "messages") {
        const linha = mensagens.find((m) =>
          Object.entries(filtros).every(([campo, valor]) => m[campo] === valor)
        );
        return { data: linha ?? null, error: null };
      }
      return { data: null, error: null };
    };
    chain.single = chain.maybeSingle;
    chain.then = (resolve: (v: unknown) => void) => {
      if (pendente) updates.push({ tabela, filtros: { ...filtros }, payload: pendente });
      resolve({ data: null, error: null });
    };
    return chain;
  }

  const client = {
    from: (t: string) => novaQuery(t),
    rpc: async () => ({ data: false, error: null }),
    updates,
  };
  return client as unknown as SupabaseFake;
}

/** Captura os avisos explícitos do handler sem poluir a saída do teste. */
async function comAvisos<T>(fn: () => Promise<T>): Promise<{ resultado: T; avisos: string[] }> {
  const avisos: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    avisos.push(args.map(String).join(" "));
  };
  try {
    return { resultado: await fn(), avisos };
  } finally {
    console.warn = original;
  }
}

const LINHA_VALIDA = (externalId: string, id: string) => ({
  id, status: null, sender: "agent", external_id: externalId, whatsapp_connection_id: "conn-1",
});

Deno.test("R2-API-016: status numérico/objeto não derruba o lote e os recibos válidos seguintes são processados", async () => {
  const supabase = fakeSupabase([
    LINHA_VALIDA("3EB0VALIDO-A", "msg-valida-a"),
    LINHA_VALIDA("3EB0VALIDO-B", "msg-valida-b"),
  ]);

  let erro: unknown = null;
  const { avisos } = await comAvisos(async () => {
    try {
      await handleMessagesUpdate(
        supabase,
        "inst-r2-api-016",
        {
          updates: [
            { key: { id: "3EB0NUMERO", fromMe: true }, status: 3 },
            { key: { id: "3EB0VALIDO-A", fromMe: true }, status: "DELIVERY_ACK" },
            { key: { id: "3EB0OBJETO", fromMe: true }, status: { code: 3, state: "DELIVERED" } },
            { key: { id: "3EB0VALIDO-B", fromMe: true }, status: "READ" },
          ],
        },
        {},
      );
    } catch (e) {
      erro = e;
    }
  });

  assertEquals(erro, null, "entrada malformada NÃO pode lançar (era o TypeError de toLowerCase)");
  assertEquals(
    supabase.updates.filter((u) => u.filtros.id === "msg-valida-a")[0]?.payload.status,
    "delivered",
    "o recibo válido imediatamente após a entrada numérica precisa ser processado",
  );
  assertEquals(
    supabase.updates.filter((u) => u.filtros.id === "msg-valida-b")[0]?.payload.status,
    "read",
    "o recibo válido após a entrada objeto precisa ser processado",
  );
  assertEquals(supabase.updates.length, 2, "só os recibos válidos tocam o banco");
  assertEquals(
    avisos.some((a) => a.includes("3EB0NUMERO")),
    true,
    "a entrada numérica precisa de saída explícita (log), não de silêncio",
  );
  assertEquals(
    avisos.some((a) => a.includes("3EB0OBJETO")),
    true,
    "a entrada objeto precisa de saída explícita (log), não de silêncio",
  );
});

Deno.test("R2-API-016: status objeto no shape de objeto único também é descartado sem lançar", async () => {
  const supabase = fakeSupabase();
  const payload = { key: { id: "3EB0UNICO" }, status: { code: 3, state: "DELIVERED" } };

  let erro: unknown = null;
  await comAvisos(async () => {
    try {
      await handleMessagesUpdate(supabase, "inst-r2-api-016", payload, payload);
    } catch (e) {
      erro = e;
    }
  });

  assertEquals(erro, null);
  assertEquals(supabase.updates.length, 0, "entrada malformada não pode tocar o banco");
});

Deno.test("R2-API-016: status string continua funcionando (regressão)", async () => {
  const supabase = fakeSupabase([
    LINHA_VALIDA("3EB0READ", "m-read"),
    LINHA_VALIDA("3EB0DESCONHECIDO", "m-desconhecido"),
  ]);

  await handleMessagesUpdate(
    supabase,
    "inst-r2-api-016",
    {
      updates: [
        { key: { id: "3EB0READ", fromMe: true }, status: "READ" },
        { key: { id: "3EB0DESCONHECIDO", fromMe: true }, status: "SOME_NEW_STATE" },
      ],
    },
    {},
  );

  assertEquals(supabase.updates.filter((u) => u.filtros.id === "m-read")[0]?.payload.status, "read");
  assertEquals(
    supabase.updates.filter((u) => u.filtros.id === "m-desconhecido")[0]?.payload.status,
    "some_new_state",
    "status string desconhecido segue o caminho antigo (minúsculo)",
  );
});
