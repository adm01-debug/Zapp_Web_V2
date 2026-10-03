// F60 (gatilho, metade do webhook): um motivo TERMINAL de desconexao (ban, falha de
// conexao, logout) nao e soluço de rede — a instancia esta fora e nao volta sozinha.
// Aqui provamos que o webhook reporta esse sinal para `register_multiplix_connection_failure`,
// que e quem pausa todos os dispatches ativos da conexao.
//
// O que este teste protege, em uma frase: se o webhook parar de avisar, a pausa por risco
// deixa de acontecer em producao SEM QUE NADA QUEBRE — o disparo continua martelando uma
// instancia banida. E um teste que nao existe para passar; existe para falhar se o fio soltar.
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleConnectionUpdate } from "../evolution-webhook-handlers.ts";

type RpcCall = { name: string; args: Record<string, unknown> };

/**
 * Mock minimo do client Supabase, suficiente para o caminho do handleConnectionUpdate:
 * le a conexao anterior, grava o novo status, insere alerta e (o que nos interessa) captura
 * a chamada de RPC. Builder encadeavel porque o handler usa .select().eq().single() etc.
 */
function mockSupabase(opts: {
  prevStatus?: string | null;
  connectionId?: string | null;
  rpcError?: Error | null;
} = {}) {
  const rpcCalls: RpcCall[] = [];
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = [];
  const { prevStatus = "connected", connectionId = "conn-0001", rpcError = null } = opts;

  const builder = (table: string) => {
    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      update: () => chain,
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        return Promise.resolve({ data: null, error: null });
      },
      eq: () => chain,
      single: () =>
        Promise.resolve({
          data: prevStatus === null ? null : { status: prevStatus, phone_number: "5511999990000" },
          error: null,
        }),
      maybeSingle: () =>
        Promise.resolve({
          data: connectionId === null ? null : { id: connectionId },
          error: null,
        }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    };
    return chain;
  };

  return {
    rpcCalls,
    inserted,
    client: {
      from: (table: string) => builder(table),
      rpc: (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return Promise.resolve({ data: null, error: rpcError });
      },
    },
  };
}

Deno.test("F60: TempBanned no webhook marca risco com o sinal TemporaryBan (o mapa nao casa por acaso)", async () => {
  const m = mockSupabase({ prevStatus: "connected" });
  await handleConnectionUpdate(m.client, "inst-1", { state: "close", disconnect_reason: "TempBanned" });

  const risco = m.rpcCalls.filter((c) => c.name === "register_multiplix_connection_failure");
  assert(risco.length === 1, `esperava UMA marcacao de risco, veio ${risco.length}`);
  assert(
    risco[0].args.p_signal === "TemporaryBan",
    `sinal do Evolution 'TempBanned' deveria virar 'TemporaryBan' (veio ${String(risco[0].args.p_signal)})`,
  );
  assert(risco[0].args.p_error_class === "permanent", `p_error_class errado: ${String(risco[0].args.p_error_class)}`);
  assert(risco[0].args.p_connection_id === "conn-0001", `conexao errada: ${String(risco[0].args.p_connection_id)}`);
});

Deno.test("F60: Banned e connectFailure tambem sao terminais, cada um com o seu sinal", async () => {
  const banido = mockSupabase({});
  await handleConnectionUpdate(banido.client, "inst-1", { state: "close", disconnect_reason: "Banned" });
  assert(
    banido.rpcCalls[0]?.args.p_signal === "banned",
    `'Banned' deveria virar 'banned' (veio ${String(banido.rpcCalls[0]?.args.p_signal)})`,
  );

  const falha = mockSupabase({});
  await handleConnectionUpdate(falha.client, "inst-1", { state: "close", disconnect_reason: "connectFailure" });
  assert(
    falha.rpcCalls[0]?.args.p_signal === "ConnectFailure",
    `'connectFailure' deveria virar 'ConnectFailure' (veio ${String(falha.rpcCalls[0]?.args.p_signal)})`,
  );
});

Deno.test("F60: queda transitoria NAO marca risco (senao soluço de rede pausaria disparo bom)", async () => {
  // Motivo vazio = o GO emitindo 'close' por instabilidade momentanea, com QR ainda valido.
  const m = mockSupabase({ prevStatus: "connected" });
  await handleConnectionUpdate(m.client, "inst-1", { state: "close", disconnect_reason: "" });

  const risco = m.rpcCalls.filter((c) => c.name === "register_multiplix_connection_failure");
  assert(risco.length === 0, `motivo NAO terminal nao pode marcar risco (marcou ${risco.length}x)`);
});

Deno.test("F60: conexao desconhecida nao derruba o webhook (best effort)", async () => {
  const m = mockSupabase({ connectionId: null });
  await handleConnectionUpdate(m.client, "inst-orfa", { state: "close", disconnect_reason: "TempBanned" });
  const risco = m.rpcCalls.filter((c) => c.name === "register_multiplix_connection_failure");
  assert(risco.length === 0, "sem conexao correspondente, nao ha o que marcar — e o webhook segue vivo");
});

Deno.test("F60: falha ao marcar risco nao propaga (o webhook nao pode cair por causa disso)", async () => {
  const m = mockSupabase({ rpcError: new Error("permission denied for function") });
  // Se isso lancar, o catch do webhook perderia o evento de conexao inteiro.
  await handleConnectionUpdate(m.client, "inst-1", { state: "close", disconnect_reason: "TempBanned" });
  assert(m.rpcCalls.length === 1, "tentou marcar (mesmo tendo falhado) — e nao lancou");
});
