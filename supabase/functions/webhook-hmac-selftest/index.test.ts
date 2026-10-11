// Autoteste da assinatura HMAC do evolution-webhook (webhook-hmac-selftest).
//
// Prova, sem rede real:
//   1. admin: a sonda ASSINADA chega ao webhook e é ACEITA (200); a sonda SEM
//      assinatura é RECUSADA (401) no modo 'token' — e a auditoria é gravada SEM
//      o segredo;
//   2. o gate de acesso é DENY BY DEFAULT: agente sem papel → 403 e NENHUMA
//      sonda é disparada; sem sessão → 401;
//   3. sem segredo configurado o autoteste reporta honestamente (configurado
//      false, assinado_aceito false) em vez de fingir sucesso;
//   4. o evento reservado `selftest` no próprio webhook: assinado → 200 com o
//      marcador `selftest`, sem assinatura → 401 (o gate roda ANTES do ack).
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleWebhookHmacSelftest, HMAC_SELFTEST_EVENT } from "./index.ts";
import { handleEvolutionWebhook } from "../evolution-webhook/index.ts";
import { WebhookSecurityService } from "../_shared/hmac-validation.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais dos
   clients Supabase (SupabaseClient é genérico e não é importável no teste). */

const SEGREDO = "segredo-hmac-de-teste-3f9c";
const SELFTEST_URL = "http://localhost/functions/v1/webhook-hmac-selftest";
const WEBHOOK_URL = "http://localhost/functions/v1/evolution-webhook";

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
  }
  const restaurar = () => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
    }
  };
  const resultado = fn();
  if (resultado instanceof Promise) return resultado.finally(restaurar);
  restaurar();
}

function makeCallerClient(isAdminOrSupervisor: boolean, user: { id: string } | null = { id: "admin-1" }): any {
  return {
    auth: {
      getUser: () => Promise.resolve({
        data: { user },
        error: user ? null : new Error("sem sessão"),
      }),
    },
    rpc: (fn: string) => fn === "is_admin_or_supervisor"
      ? Promise.resolve({ data: isAdminOrSupervisor, error: null })
      : Promise.resolve({ data: null, error: null }),
  };
}

function makeServiceClient(onInsert?: (row: any) => void): any {
  return {
    from: (table: string) => ({
      insert: (row: any) => {
        if (table === "audit_logs") onInsert?.(row);
        return Promise.resolve({ error: null });
      },
    }),
  };
}

const postAdmin = () => new Request(SELFTEST_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer admin-jwt" },
});

const dispatchReal = (req: Request) => handleEvolutionWebhook(req);

// ---------------------------------------------------------------------------
// 1. admin: fluxo completo com rota real pelo webhook
// ---------------------------------------------------------------------------

Deno.test("admin: sonda assinada aceita, sonda sem assinatura recusada, auditoria sem segredo", async () => {
  await withEnv(
    {
      SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
      EVOLUTION_WEBHOOK_SECRET: SEGREDO,
      WEBHOOK_SECRET: undefined,
      EVOLUTION_WEBHOOK_ENFORCE: undefined,
      EVOLUTION_INSTANCE_TOKEN: undefined,
    },
    async () => {
      let inserted: any = null;
      const res = await handleWebhookHmacSelftest(postAdmin(), {
        callerClient: makeCallerClient(true),
        supabase: makeServiceClient((row) => { inserted = row; }),
        webhookUrl: WEBHOOK_URL,
        dispatch: dispatchReal,
      });

      assertEquals(res.status, 200);
      const report = await res.json();
      assertEquals(report.assinado_aceito, true, "sonda assinada precisa ser aceita");
      assertEquals(report.sem_assinatura_recusado, true, "sonda sem assinatura precisa ser recusada no modo token");
      assertEquals(report.modo_estrito, true);
      assertEquals(report.enforce_mode, "token");
      assertEquals(report.configurado, true);
      assert(typeof report.latencia === "number" && report.latencia >= 0, "latência precisa ser número");

      // Auditoria gravada, sem o segredo.
      assert(inserted, "a auditoria precisa ser gravada");
      assertEquals(inserted.action, "webhook_hmac_selftest");
      assertEquals(inserted.user_id, "admin-1");
      assertEquals(inserted.entity_type, "webhook");
      assertEquals(JSON.stringify(inserted).includes(SEGREDO), false, "a auditoria nunca pode conter o segredo");
    },
  );
});

// ---------------------------------------------------------------------------
// 2. gate de acesso DENY BY DEFAULT
// ---------------------------------------------------------------------------

Deno.test("agente sem papel: 403 e nenhuma sonda disparada", async () => {
  await withEnv({ EVOLUTION_WEBHOOK_SECRET: SEGREDO, EVOLUTION_WEBHOOK_ENFORCE: undefined }, async () => {
    let dispatched = 0;
    let auditoria = 0;
    const res = await handleWebhookHmacSelftest(postAdmin(), {
      callerClient: makeCallerClient(false),
      supabase: makeServiceClient(() => { auditoria += 1; }),
      dispatch: async () => { dispatched += 1; return new Response("{}", { status: 200 }); },
    });
    assertEquals(res.status, 403);
    assertEquals(dispatched, 0, "acesso negado não pode sondar o webhook");
    assertEquals(auditoria, 0, "acesso negado não pode gravar auditoria");
  });
});

Deno.test("sem sessão: 401 e nenhuma sonda disparada", async () => {
  await withEnv({ EVOLUTION_WEBHOOK_SECRET: SEGREDO, EVOLUTION_WEBHOOK_ENFORCE: undefined }, async () => {
    let dispatched = 0;
    const res = await handleWebhookHmacSelftest(postAdmin(), {
      callerClient: makeCallerClient(true, null),
      supabase: makeServiceClient(() => {}),
      dispatch: async () => { dispatched += 1; return new Response("{}", { status: 200 }); },
    });
    assertEquals(res.status, 401);
    assertEquals(dispatched, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. sem segredo configurado: honestidade do relatório
// ---------------------------------------------------------------------------

Deno.test("sem segredo configurado: assinado_aceito e configurado ficam false (não finge sucesso)", async () => {
  await withEnv(
    {
      SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
      EVOLUTION_WEBHOOK_SECRET: undefined,
      WEBHOOK_SECRET: undefined,
      EVOLUTION_WEBHOOK_ENFORCE: undefined,
      EVOLUTION_INSTANCE_TOKEN: undefined,
    },
    async () => {
      const res = await handleWebhookHmacSelftest(postAdmin(), {
        callerClient: makeCallerClient(true),
        supabase: makeServiceClient(() => {}),
        webhookUrl: WEBHOOK_URL,
        dispatch: dispatchReal,
      });
      assertEquals(res.status, 200);
      const report = await res.json();
      assertEquals(report.configurado, false);
      assertEquals(report.assinado_aceito, false);
      // Sem segredo, o webhook também não aceita a sonda sem assinatura.
      assertEquals(report.sem_assinatura_recusado, true);
    },
  );
});

// ---------------------------------------------------------------------------
// 4. evento reservado no próprio webhook: ack DEPOIS do gate, sem efeito
// ---------------------------------------------------------------------------

Deno.test("evolution-webhook: evento selftest assinado é ACKado (200+selftest) e sem assinatura é recusado (401)", async () => {
  await withEnv(
    {
      SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
      EVOLUTION_WEBHOOK_SECRET: SEGREDO,
      EVOLUTION_WEBHOOK_ENFORCE: undefined,
      EVOLUTION_INSTANCE_TOKEN: undefined,
    },
    async () => {
      const body = JSON.stringify({
        event: HMAC_SELFTEST_EVENT,
        instance: "inst-teste",
        data: { origem: "webhook-hmac-selftest" },
      });
      const assinatura = await new WebhookSecurityService(SEGREDO, false).signPayload(body);

      const ok = await handleEvolutionWebhook(new Request(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-signature-256": assinatura },
        body,
      }));
      assertEquals(ok.status, 200, "evento selftest assinado precisa ser aceito");
      const corpo = await ok.json();
      assertEquals(corpo.selftest, true, "a resposta precisa marcar o evento reservado selftest");

      const recusado = await handleEvolutionWebhook(new Request(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }));
      assertEquals(recusado.status, 401, "o gate roda BEFORE do ack: sem credencial, 401");
    },
  );
});
