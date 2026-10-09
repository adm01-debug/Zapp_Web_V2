import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleWebhookDiagnostic } from "./index.ts";
import { getCorsHeaders } from "../_shared/validation.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais dos
   clients Supabase (SupabaseClient é genérico e não é importável no teste). */

// R2-API-001 (P1): o diagnóstico lê telefones/status/config de TODAS as
// conexões e pode executar auto-fix (POST de configuração do webhook na GO).
// O reparo NÃO é exceção ao gate — exige admin/supervisor, como as ações de
// controle de evolution-api. Aqui só se prova o gate: agente → 403 sem I/O.

function makeCallerClient(isAdminOrSupervisor: boolean): any {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "agent-1" } }, error: null }) },
    rpc: (fn: string) => {
      if (fn === "is_admin_or_supervisor") return Promise.resolve({ data: isAdminOrSupervisor, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

function makeServiceClient(readConnections: () => void): any {
  return {
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        neq: () => q,
        gte: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      if (table === "whatsapp_connections") readConnections();
      return q;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

Deno.env.set("EVOLUTION_API_URL", "https://evolution.test");
Deno.env.set("EVOLUTION_API_KEY", "test-evolution-key");

Deno.test("R2-API-001: webhook-diagnostic exige admin/supervisor (403, sem ler conexões)", async () => {
  let connectionsRead = 0;
  const res = await handleWebhookDiagnostic(
    new Request("http://localhost/functions/v1/webhook-diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer agent-jwt" },
      body: JSON.stringify({ action: "full-diagnostic" }),
    }),
    {
      callerClient: makeCallerClient(false),
      supabase: makeServiceClient(() => { connectionsRead += 1; }),
    },
  );
  assertEquals(res.status, 403, "agente sem papel deve ser 403");
  assertEquals(connectionsRead, 0, "diagnóstico negado não pode ler whatsapp_connections");
});

Deno.test("R2-API-001: admin passa o gate do diagnóstico", async () => {
  // admin: o gate passa; a leitura de conexões começa (service client devolve []) e o
  // handler responde 200 (diagnóstico vazio), sem depender do provedor.
  const res = await handleWebhookDiagnostic(
    new Request("http://localhost/functions/v1/webhook-diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer admin-jwt" },
      body: JSON.stringify({ action: "full-diagnostic" }),
    }),
    { callerClient: makeCallerClient(true), supabase: makeServiceClient(() => {}) },
  );
  assertEquals(res.status, 200, "admin deve passar o gate");
});

// R2-INF-016: o catch do handler montava o 500 à mão com `err.message` no corpo.
Deno.test("R2-INF-016: falha inesperada vira 500 sanitizado (o detalhe interno não sai no corpo)", async () => {
  const SEGREDO = "detalhe-interno-do-handler-7c1e";
  const linhas: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { linhas.push(args.map((a) => String(a)).join(" ")); };
  try {
    const req = new Request("http://localhost/functions/v1/webhook-diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer agent-jwt" },
      body: JSON.stringify({ action: "full-diagnostic" }),
    });
    const res = await handleWebhookDiagnostic(
      req,
      {
        callerClient: {
          auth: { getUser: () => { throw new Error(SEGREDO); } },
        } as any,
        supabase: makeServiceClient(() => {}),
      },
    );
    assertEquals(res.status, 500, "falha inesperada deve virar 500");
    const texto = await res.text();
    assertEquals(texto.includes(SEGREDO), false, `o corpo não pode trazer o detalhe interno: ${texto}`);
    assertEquals(JSON.parse(texto).error, "Internal server error", `corpo inesperado: ${texto}`);
    assert(
      linhas.some((l) => l.includes(SEGREDO)),
      `o detalhe interno precisa constar no log do servidor; capturado:\n${linhas.join("\n")}`,
    );
    // O 500 sanitizado mantém os mesmos headers de getCorsHeaders(req) — sanitizar
    // o corpo não pode derrubar CORS/content-type da resposta de erro.
    const esperados = getCorsHeaders(req);
    assertEquals(
      res.headers.get("access-control-allow-origin"),
      "https://zapp-web-v2.vercel.app",
      "request sem Origin: o 500 usa a origem padrão",
    );
    assertEquals(
      res.headers.get("access-control-allow-methods"),
      esperados["Access-Control-Allow-Methods"],
      "o 500 mantém o Allow-Methods de getCorsHeaders",
    );
    assertEquals(res.headers.get("content-type"), "application/json", "o 500 continua JSON");
    assertEquals(res.headers.get("vary"), "Origin", "o 500 mantém Vary: Origin");
  } finally {
    console.error = originalError;
  }
});
