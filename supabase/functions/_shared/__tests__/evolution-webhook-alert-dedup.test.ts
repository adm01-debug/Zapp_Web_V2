// E26 do plano multi-conexao: `warroom_alerts` recebeu 2 alertas IDENTICOS para a mesma
// queda (a GO entrega o evento em dobro, ou o retry do webhook reenvia o POST). O guard
// de transicao (`prevConn?.status === 'connected'`) nao segura a corrida em que as duas
// entregas leem o status ANTES de qualquer uma gravar o 'disconnected'.
//
// O que este teste protege, em uma frase: se a deduplicacao sair, a queda de um numero
// volta a gerar um par de alertas identicos no War Room — e nada quebra para avisar.
// Ele nao existe para passar; existe para falhar se o fio soltar.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleConnectionUpdate } from "../evolution-webhook-handlers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

type AlertRow = { id: string; source: string; title: string; created_at: string };

/**
 * Mock minimo do client Supabase para o caminho do alerta de queda. Guarda as linhas
 * gravadas em `warroom_alerts` e RESPONDE a consulta de deduplicacao filtrando por
 * source/title/created_at — como o PostgREST faria. `seedAlerts` injeta alertas que ja
 * existiam antes do handler rodar (com idade controlada, para provar a janela).
 */
function mockSupabase(opts: {
  prevStatus?: string | null;
  seedAlerts?: Array<{ source: string; title: string; ageMs: number }>;
} = {}) {
  const { prevStatus = "connected", seedAlerts = [] } = opts;
  const now = Date.now();
  const alerts: AlertRow[] = seedAlerts.map((a, i) => ({
    id: `seed-${i}`,
    source: a.source,
    title: a.title,
    created_at: new Date(now - a.ageMs).toISOString(),
  }));
  const inserted: AlertRow[] = [];
  let seq = 0;

  const table = (name: string) => {
    const conds: Array<[string, unknown]> = [];
    // O duble e um objeto sem tipagem: quem fala com ele e o handler, tipado por
    // EvolutionDbClient. Sem `any` de proposito — o ratchet de lint conta ocorrencia nova.
    const rowValue = (row: AlertRow, column: string): unknown =>
      (row as unknown as Record<string, unknown>)[column];
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: () => chain,
      eq: (column: string, value: unknown) => { conds.push([column, value]); return chain; },
      gte: (column: string, value: unknown) => { conds.push([column, value]); return chain; },
      limit: () => chain,
      insert: (row: Record<string, unknown>) => {
        if (name === "warroom_alerts") {
          const saved: AlertRow = {
            id: `alert-${++seq}`,
            source: String(row.source),
            title: String(row.title),
            created_at: new Date(Date.now()).toISOString(),
          };
          alerts.push(saved);
          inserted.push(saved);
        }
        return Promise.resolve({ data: null, error: null });
      },
      single: () => Promise.resolve({
        data: prevStatus === null ? null : { status: prevStatus, phone_number: "5511999990000" },
        error: null,
      }),
      maybeSingle: () => Promise.resolve({ data: { id: "conn-0001" }, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        const rows = name === "warroom_alerts"
          ? alerts.filter((a) => conds.every(([column, value]) =>
            column === "created_at"
              ? a.created_at >= String(value)
              : rowValue(a, column) === value))
          : [];
        return resolve({ data: rows, error: null });
      },
    };
    return chain;
  };

  return {
    inserted,
    client: {
      from: (name: string) => table(name),
      rpc: () => Promise.resolve({ data: null, error: null }),
    } as unknown as EvolutionDbClient,
  };
}

const TITLE = (instance: string) => `🔴 Conexão ${instance} desconectou`;

Deno.test("E26: a GO entrega o mesmo 'close' duas vezes e o War Room recebe UM alerta", async () => {
  // As duas entregas leem prevConn='connected' (a corrida real: nenhuma gravou ainda),
  // entao o guard de transicao deixa as duas passarem. So o dedup segura a segunda.
  const m = mockSupabase({ prevStatus: "connected" });
  await handleConnectionUpdate(m.client, "PRINCIPAL", { state: "close" });
  await handleConnectionUpdate(m.client, "PRINCIPAL", { state: "close" });

  assertEquals(
    m.inserted.length,
    1,
    `duas entregas do MESMO evento devem gravar 1 alerta (gravou ${m.inserted.length})`,
  );
  assertEquals(m.inserted[0].title, TITLE("PRINCIPAL"));
  assertEquals(m.inserted[0].source, "evolution-webhook");
});

Deno.test("E26: queda de OUTRA instancia nao e engolida pelo dedup (title diferente)", async () => {
  const m = mockSupabase({ prevStatus: "connected" });
  await handleConnectionUpdate(m.client, "PRINCIPAL", { state: "close" });
  await handleConnectionUpdate(m.client, "SECUNDARIA", { state: "close" });

  assertEquals(
    m.inserted.length,
    2,
    `instancias diferentes sao quedas diferentes (gravou ${m.inserted.length})`,
  );
  assertEquals(m.inserted.map((a) => a.title), [TITLE("PRINCIPAL"), TITLE("SECUNDARIA")]);
});

Deno.test("E26: alerta igual mas FORA da janela de 60s nao bloqueia a queda nova", async () => {
  const m = mockSupabase({
    prevStatus: "connected",
    seedAlerts: [{ source: "evolution-webhook", title: TITLE("PRINCIPAL"), ageMs: 61_000 }],
  });
  await handleConnectionUpdate(m.client, "PRINCIPAL", { state: "close" });

  assertEquals(
    m.inserted.length,
    1,
    `alerta de 61s atras e outra queda, nao uma duplicata (gravou ${m.inserted.length})`,
  );
});

Deno.test("E26: alerta identico DENTRO da janela de 60s deduplica", async () => {
  const m = mockSupabase({
    prevStatus: "connected",
    seedAlerts: [{ source: "evolution-webhook", title: TITLE("PRINCIPAL"), ageMs: 30_000 }],
  });
  await handleConnectionUpdate(m.client, "PRINCIPAL", { state: "close" });

  assertEquals(
    m.inserted.length,
    0,
    `alerta identico ha 30s e a duplicata do E26 — nao pode gravar outro (gravou ${m.inserted.length})`,
  );
});

Deno.test("E26: alerta de OUTRO source (health-check) nao deduplica o alerta do webhook", async () => {
  // O health-check grava o proprio alerta (source 'connection-health-check'); ele nao pode
  // barrar o aviso do webhook nem vice-versa — sao origens independentes de propósito.
  const m = mockSupabase({
    prevStatus: "connected",
    seedAlerts: [{ source: "connection-health-check", title: TITLE("PRINCIPAL"), ageMs: 5_000 }],
  });
  await handleConnectionUpdate(m.client, "PRINCIPAL", { state: "close" });

  assertEquals(
    m.inserted.length,
    1,
    `source diferente nao e o mesmo alerta (gravou ${m.inserted.length})`,
  );
});

Deno.test("E26: handleConnectionUpdate segue sem alertar quando nao houve transicao de queda", async () => {
  // Protege o comportamento anterior: 'close' com a conexao JA 'disconnected' nao e uma
  // queda nova (senao o dedup mascararia um alerta que nunca deveria existir).
  const m = mockSupabase({ prevStatus: "disconnected" });
  await handleConnectionUpdate(m.client, "PRINCIPAL", { state: "close" });

  assertEquals(m.inserted.length, 0, `sem transicao nao ha alerta (gravou ${m.inserted.length})`);
});
