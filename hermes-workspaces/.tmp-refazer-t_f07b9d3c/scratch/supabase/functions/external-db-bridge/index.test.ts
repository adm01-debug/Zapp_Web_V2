/**
 * SEC-EDGE_FUNCTIONS-01 / Y27 P0-01 — `external-db-bridge` lia com `service_role`
 * (bypassa a RLS) para QUALQUER sessão autenticada, sem checar papel: um `agent`
 * chamava `{"action":"select","table":"clientes","limit":1000}` e recebia a base
 * inteira (clientes, evolution_contacts/messages/chats).
 *
 * Este arquivo prova a correção pelo handler REAL (`handleExternalDbBridge`),
 * com os dois clientes Supabase injetados (`userClient` com o JWT do chamador e
 * `adminClient` service_role): sem rede, sem banco, sem chave real. O teste
 * falha sem a checagem de papel (ver `.tmp/relato.md`).
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleExternalDbBridge, type ExternalDbBridgeInjected } from "./index.ts";

const SUPABASE_URL = "https://projeto.supabase.co";
const AGENT_ID = "11111111-2222-3333-4444-555555555555";
const ADMIN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

interface Estado {
  /** id do usuário devolvido pelo `auth.getUser()`; `null` = token inválido. */
  userId: string | null;
  authError?: { message: string } | null;
  /** valor devolvido por `is_admin_or_supervisor`. */
  isAdmin?: boolean | null;
  roleError?: { message: string } | null;
  rows?: Record<string, unknown>[];
  queryError?: { message: string } | null;
}

interface Capturas {
  roleChecks: Array<{ fn: string; args: Record<string, unknown> }>;
  /** cada `adminClient.from(tabela)` — a consulta privilegiada de fato. */
  tables: string[];
}

/** `userClient`: carrega o JWT do chamador — só `auth.getUser()` e o RPC de papel. */
function userClientFalso(estado: Estado, capturas: Capturas): SupabaseClient {
  const fake = {
    auth: {
      getUser: () =>
        Promise.resolve(
          estado.authError
            ? { data: { user: null }, error: estado.authError }
            : estado.userId
            ? { data: { user: { id: estado.userId } }, error: null }
            : { data: { user: null }, error: null },
        ),
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      capturas.roleChecks.push({ fn, args });
      return Promise.resolve({ data: estado.isAdmin ?? null, error: estado.roleError ?? null });
    },
  };
  return fake as unknown as SupabaseClient;
}

/** `adminClient`: service_role. Registra TODA tabela tocada — a prova do vazamento. */
function adminClientFalso(estado: Estado, capturas: Capturas): SupabaseClient {
  const from = (table: string) => {
    capturas.tables.push(table);
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.filter = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.range = chain;
    builder.insert = () => Promise.resolve({ data: null, error: null });
    builder.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(
        estado.queryError
          ? { data: null, error: estado.queryError, count: null }
          : { data: estado.rows ?? [], error: null, count: (estado.rows ?? []).length },
      ).then(onFulfilled);
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

function clientes(
  estado: Estado,
): { injetado: ExternalDbBridgeInjected; capturas: Capturas } {
  const capturas: Capturas = { roleChecks: [], tables: [] };
  return {
    injetado: {
      userClient: userClientFalso(estado, capturas),
      adminClient: adminClientFalso(estado, capturas),
    },
    capturas,
  };
}

function pedido(
  body: Record<string, unknown>,
  opts: { bearer?: string | null } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: "http://localhost:5173",
  };
  const bearer = opts.bearer === undefined ? "jwt-de-teste" : opts.bearer;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return new Request(`${SUPABASE_URL}/functions/v1/external-db-bridge`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const SELECT_CLIENTES = { action: "select", table: "clientes", limit: 1000 };

async function corpo(resp: Response): Promise<Record<string, unknown>> {
  return await resp.json() as Record<string, unknown>;
}

// ─── O defeito: sem papel de gestão, a leitura privilegiada tem de ser NEGADA ──

Deno.test("Y27 P0-01: usuário autenticado SEM papel (agent) recebe 403 sem tocar no banco", async () => {
  const estado: Estado = { userId: AGENT_ID, isAdmin: false, rows: [{ id: "vazaria" }] };
  const { injetado, capturas } = clientes(estado);

  const resp = await handleExternalDbBridge(pedido(SELECT_CLIENTES), injetado);

  assertEquals(resp.status, 403);
  assertEquals((await corpo(resp)).error, "Forbidden");
  // O RPC de papel foi consultado com a identidade do chamador...
  assertEquals(capturas.roleChecks, [{ fn: "is_admin_or_supervisor", args: { _user_id: AGENT_ID } }]);
  // ...e NENHUMA tabela da allowlist foi consultada com service_role.
  assertEquals(capturas.tables, [], "nenhuma query privilegiada pode rodar sem papel");
});

Deno.test("Y27 P0-01: admin/supervisor CONTINUA funcionando (select com service_role)", async () => {
  const estado: Estado = { userId: ADMIN_ID, isAdmin: true, rows: [{ id: "c1" }, { id: "c2" }] };
  const { injetado, capturas } = clientes(estado);

  const resp = await handleExternalDbBridge(pedido(SELECT_CLIENTES), injetado);

  assertEquals(resp.status, 200);
  const body = await corpo(resp);
  assertEquals(body.data, [{ id: "c1" }, { id: "c2" }]);
  assertEquals((body.meta as Record<string, unknown>).record_count, 2);
  assertEquals(capturas.roleChecks.length, 1);
  assertEquals(capturas.tables, ["clientes"]);
});

Deno.test("Y27 P0-01: papel que não é `true` (RPC devolve null) → 403 sem consultar", async () => {
  const estado: Estado = { userId: AGENT_ID, isAdmin: null };
  const { injetado, capturas } = clientes(estado);

  const resp = await handleExternalDbBridge(pedido(SELECT_CLIENTES), injetado);

  assertEquals(resp.status, 403);
  assertEquals(capturas.tables, []);
});

Deno.test("Y27 P0-01: erro ao resolver o papel NEGA (falha fechada), sem consultar", async () => {
  const estado: Estado = { userId: AGENT_ID, roleError: { message: "rpc indisponivel" } };
  const { injetado, capturas } = clientes(estado);

  const resp = await handleExternalDbBridge(pedido(SELECT_CLIENTES), injetado);

  assertEquals(resp.status, 403);
  assertEquals(capturas.tables, []);
});

Deno.test("Y27 P0-01: sem Bearer recebe 401 e nem consulta o papel", async () => {
  const estado: Estado = { userId: ADMIN_ID, isAdmin: true };
  const { injetado, capturas } = clientes(estado);

  const resp = await handleExternalDbBridge(pedido(SELECT_CLIENTES, { bearer: null }), injetado);

  assertEquals(resp.status, 401);
  assertEquals(capturas.roleChecks, []);
  assertEquals(capturas.tables, []);
});

Deno.test("Y27 P0-01: token inválido recebe 401 e nem consulta o papel", async () => {
  const estado: Estado = { userId: null, authError: { message: "invalid token" } };
  const { injetado, capturas } = clientes(estado);

  const resp = await handleExternalDbBridge(pedido(SELECT_CLIENTES), injetado);

  assertEquals(resp.status, 401);
  assertEquals(capturas.roleChecks, []);
  assertEquals(capturas.tables, []);
});

Deno.test("Y27 P0-01: admin com tabela FORA da allowlist continua sendo negado (403)", async () => {
  const estado: Estado = { userId: ADMIN_ID, isAdmin: true, rows: [] };
  const { injetado, capturas } = clientes(estado);

  const resp = await handleExternalDbBridge(
    pedido({ action: "select", table: "profiles" }),
    injetado,
  );

  assertEquals(resp.status, 403);
  assert((await corpo(resp)).error !== undefined);
  assertEquals(capturas.tables, [], "a allowlist barra antes de consultar");
});
