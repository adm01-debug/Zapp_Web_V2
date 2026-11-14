// E26 (reconexao): prova que o alerta de RECONEXAO no War Room duplicava numa corrida de
// retry, exatamente como o alerta de queda ja tinha sido corrigido. A GO reentrega o evento
// de reconexao (e o retry do proprio webhook reenvia o POST), entao as duas entregas podem
// ler o status ANTERIOR (ainda nao 'connected') ANTES de qualquer uma escrever — sem uma
// chave de idempotencia, as duas inserem o alerta "reconectada".
//
// Este teste simula a corrida com um duble do Supabase que reproduz o indice unico parcial
// real (ux_warroom_alerts_dedupe_key): a 2a tentativa de insert com o MESMO dedupe_key
// nao-nulo falha com 23505, como o Postgres faria. Antes do fix, o insert do alerta de
// reconexao nao tinha dedupe_key algum, entao as duas entregas inseriam sem colidir — 2
// alertas para 1 incidente. Depois do fix, a 2a cai em 23505 e e descartada — 1 alerta.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleConnectionUpdate } from "../evolution-webhook-handlers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

function mockRacingSupabase(connectionId = "conn-reconnect-1") {
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = [];
  // Reproduz o indice unico parcial: chave nao-nula repetida -> 23505 (mesmo comportamento
  // do Postgres real em ux_warroom_alerts_dedupe_key).
  const liveDedupeKeys = new Set<string>();

  const builder = (table: string) => {
    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      update: () => chain,
      in: () => chain,
      eq: () => chain,
      gte: () => chain,
      limit: () => chain,
      insert: (row: Record<string, unknown>) => {
        const key = row.dedupe_key;
        if (typeof key === "string" && liveDedupeKeys.has(key)) {
          return Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          });
        }
        if (typeof key === "string") liveDedupeKeys.add(key);
        inserted.push({ table, row });
        return Promise.resolve({ data: null, error: null });
      },
      single: () =>
        Promise.resolve({
          data: { id: connectionId, status: "disconnected", phone_number: "5511999990000" },
          error: null,
        }),
      maybeSingle: () => Promise.resolve({ data: { id: connectionId }, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    };
    return chain;
  };

  return {
    inserted,
    client: {
      from: (table: string) => builder(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
    } as unknown as EvolutionDbClient,
  };
}

Deno.test("E26 (reconexao): corrida de retry nao duplica o alerta de reconexao no War Room", async () => {
  const m = mockRacingSupabase();

  // Duas entregas do MESMO evento de reconexao, ambas lendo o status anterior
  // 'disconnected' (o duble fixa isso), como aconteceria numa corrida real em que nenhuma
  // das duas viu a escrita da outra antes de decidir inserir o alerta.
  await handleConnectionUpdate(m.client, "inst-1", { state: "open", jid: "5511999990000@s.whatsapp.net" });
  await handleConnectionUpdate(m.client, "inst-1", { state: "open", jid: "5511999990000@s.whatsapp.net" });

  const alertasReconexao = m.inserted.filter(
    (c) => c.table === "warroom_alerts" && (c.row.title as string)?.includes("restaurada"),
  );
  assertEquals(alertasReconexao.length, 1, `esperava 1 alerta de reconexao, vieram ${alertasReconexao.length}`);
  assertEquals(alertasReconexao[0].row.dedupe_key, `conn-up:v1:${"conn-reconnect-1"}`);
});
