/**
 * #2879 — `external-db-bridge` repassava `params.filters`/`params.order` ao
 * PostgREST sem validar: nome de coluna livre (aspas, `->>`, `::`, nomes de
 * controle como `select`/`or`/`limit`), operador livre e `filters` de qualquer
 * forma (objeto/null → TypeError → 500). Estes testes passam pelo handler REAL
 * com um admin válido e registram exatamente o que chegaria ao supabase-js.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.87.1";
import { handleExternalDbBridge, parseFilters, validIdentifier } from "./index.ts";

const ADMIN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

type Chamada = [string, ...unknown[]];

function injetado(chamadas: Chamada[]) {
  const userClient = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: ADMIN_ID } }, error: null }) },
    rpc: () => Promise.resolve({ data: true, error: null }),
  } as unknown as SupabaseClient;
  const adminClient = {
    from: (table: string) => {
      chamadas.push(["from", table]);
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "filter", "order", "limit", "range"]) {
        builder[m] = (...args: unknown[]) => { chamadas.push([m, ...args]); return builder; };
      }
      builder.insert = () => Promise.resolve({ data: null, error: null });
      builder.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
      return builder;
    },
  } as unknown as SupabaseClient;
  return { userClient, adminClient };
}

async function chamar(params: unknown): Promise<{ status: number; chamadas: Chamada[] }> {
  const chamadas: Chamada[] = [];
  const req = new Request("https://projeto.supabase.co/functions/v1/external-db-bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer jwt", Origin: "http://localhost:5173" },
    body: JSON.stringify({ action: "select", table: "clientes", params }),
  });
  const resp = await handleExternalDbBridge(req, injetado(chamadas));
  await resp.body?.cancel();
  return { status: resp.status, chamadas };
}

const RESERVADOS = ["select", "or", "and", "not", "order", "limit", "offset", "on_conflict", "columns", "SELECT", "Or"];

Deno.test("#2879: nome reservado do PostgREST como coluna de filtro → 400 e nenhuma query", async () => {
  for (const column of RESERVADOS) {
    const { status, chamadas } = await chamar({ filters: [{ column, operator: "eq", value: "x" }] });
    assertEquals(status, 400, `filtro em '${column}'`);
    assertEquals(chamadas, [], `'${column}' não pode chegar ao PostgREST`);
  }
});

Deno.test("#2879: nome reservado como coluna de order → 400", async () => {
  for (const column of RESERVADOS) {
    const { status } = await chamar({ order: { column } });
    assertEquals(status, 400, `order em '${column}'`);
  }
});

Deno.test("#2879: coluna com aspas, unicode, json path, cast e operador fora da allowlist → 400", async () => {
  const ruins = [
    { column: '"name"', operator: "eq", value: "x" },
    { column: "na\"me", operator: "eq", value: "x" },
    { column: "Key", operator: "eq", value: "x" },
    { column: "data->>secret", operator: "eq", value: "x" },
    { column: "x::text", operator: "eq", value: "x" },
    { column: "a.b", operator: "eq", value: "x" },
    { column: "name", operator: "EQ", value: "x" },
    { column: "name", operator: "cs", value: "x" },
    { column: "name", operator: "eq.x&select", value: "x" },
  ];
  for (const filtro of ruins) {
    const { status, chamadas } = await chamar({ filters: [filtro] });
    assertEquals(status, 400, JSON.stringify(filtro));
    assertEquals(chamadas, []);
  }
});

Deno.test("#2879: `filters` que não é array de objetos → 400 (antes: TypeError → 500)", async () => {
  for (const filters of [{ column: "name" }, "name=eq.x", 42, [null], [["name", "eq", "x"]], ["x"], [{}]]) {
    const { status } = await chamar({ filters });
    assertEquals(status, 400, JSON.stringify(filters));
  }
});

Deno.test("#2879: valor de filtro não escalar (objeto/array fora do `in`) → 400", async () => {
  for (const value of [{ a: 1 }, ["a"], null]) {
    const { status } = await chamar({ filters: [{ column: "name", operator: "eq", value }] });
    assertEquals(status, 400, JSON.stringify(value));
  }
});

Deno.test("#2879: `in` com array vira lista entre parênteses com strings entre aspas", async () => {
  const { status, chamadas } = await chamar({
    filters: [{ column: "status", operator: "in", value: ["a", "b,c", 'd"e', 3, true] }],
  });
  assertEquals(status, 200);
  const filtro = chamadas.find((c) => c[0] === "filter");
  assertEquals(filtro, ["filter", "status", "in", '("a","b,c","d\\"e",3,true)']);
});

Deno.test("#2879: `in` sem array, vazio ou com item não escalar → 400", async () => {
  for (const value of ["(a,b)", [], [{ x: 1 }], [null]]) {
    const { status } = await chamar({ filters: [{ column: "status", operator: "in", value }] });
    assertEquals(status, 400, JSON.stringify(value));
  }
});

Deno.test("#2879: `is` só aceita null/true/false", async () => {
  assertEquals((await chamar({ filters: [{ column: "deleted_at", operator: "is", value: null }] })).status, 200);
  assertEquals((await chamar({ filters: [{ column: "deleted_at", operator: "is", value: "not.null" }] })).status, 400);
});

Deno.test("#2879: filtros válidos seguem funcionando (eq/ilike/order)", async () => {
  const { status, chamadas } = await chamar({
    filters: [{ column: "name", operator: "ilike", value: "%ana%" }, { column: "uf", operator: "eq", value: "SP" }],
    order: { column: "created_at", ascending: false },
  });
  assertEquals(status, 200);
  assertEquals(chamadas.filter((c) => c[0] === "filter"), [
    ["filter", "name", "ilike", "%ana%"],
    ["filter", "uf", "eq", "SP"],
  ]);
  assertEquals(chamadas.find((c) => c[0] === "order"), ["order", "created_at", { ascending: false }]);
});

Deno.test("#2879: a URL real do supabase-js para o `in` montado é uma lista PostgREST válida", () => {
  const filtros = parseFilters([{ column: "status", operator: "in", value: ["a", "b,c"] }]);
  const externalClient = createClient("https://x.invalid", "k");
  const q = externalClient.from("clientes").select("*").filter(filtros![0].column, filtros![0].operator, filtros![0].value);
  const url = (q as unknown as { url: URL }).url;
  assertEquals(decodeURIComponent(url.search), '?select=*&status=in.("a","b,c")');
});

Deno.test("#2879: validIdentifier", () => {
  assertEquals(validIdentifier("created_at"), true);
  assertEquals(validIdentifier("select"), false);
  assertEquals(validIdentifier("a".repeat(64)), false);
  assertEquals(validIdentifier(["a"]), false);
});
