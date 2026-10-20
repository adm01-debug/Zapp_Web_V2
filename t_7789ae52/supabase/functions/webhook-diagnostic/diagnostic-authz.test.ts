import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleWebhookDiagnostic } from "./index.ts";

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
