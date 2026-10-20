// IA-012 (lote B) — caminho de SERVIÇO das funções de IA.
//
// O lote A criou `requireAiIdentityOrService` para os chamadores internos que
// falam com a service role key, mas só aplicou em `ai-transcribe-audio`. A
// verificação adversarial mostrou o custo disso: o webhook do WhatsApp chama
// `classify-sticker` com a service key (`_shared/evolution-webhook-messages.ts`)
// e recebia 403 — toda figurinha nova caía no default sem erro visível.
//
// Estes testes travam as duas metades do contrato: (1) `requireAiIdentity`
// continua recusando service role (403), porque função de usuário não deve
// aceitar credencial de serviço; (2) `requireAiIdentityOrService` aceita, mas
// com teto por IP — identidade de serviço não é passe livre de consumo.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isServiceRoleRequest,
  requireAiIdentity,
  requireAiIdentityOrService,
} from "../ai-auth.ts";

const SERVICE_KEY = "service-role-key-de-teste-0123456789";
const CALLER = "https://projeto.supabase.co/functions/v1/classify-sticker";

function pedidoDeServico(ip: string): Request {
  return new Request(CALLER, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SERVICE_KEY}`,
      "x-forwarded-for": ip,
    },
  });
}

Deno.test("IA-012: reconhece a service role key sem comparação direta", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  assertEquals(isServiceRoleRequest(pedidoDeServico("10.0.1.1")), true);
  assertEquals(
    isServiceRoleRequest(
      new Request(CALLER, { headers: { authorization: `Bearer ${SERVICE_KEY}-quase` } }),
    ),
    false,
  );
  assertEquals(isServiceRoleRequest(new Request(CALLER)), false);
});

Deno.test("IA-012: requireAiIdentity recusa service role (403)", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  const r = await requireAiIdentity(pedidoDeServico("10.0.2.1"), "classify-sticker");
  assertEquals(r instanceof Response, true);
  if (r instanceof Response) assertEquals(r.status, 403);
});

Deno.test("IA-012: requireAiIdentityOrService aceita o chamador interno com identidade de serviço", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  const r = await requireAiIdentityOrService(pedidoDeServico("10.0.3.1"), "classify-sticker");
  assertEquals(r instanceof Response, false);
  if (!(r instanceof Response)) assertEquals(r.kind, "service");
});

Deno.test("IA-012: o caminho de serviço é limitado por IP (429 acima do teto)", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  const ip = "10.0.4.1";
  let ultimo: Response | null = null;
  for (let i = 0; i < 4; i++) {
    const r = await requireAiIdentityOrService(pedidoDeServico(ip), "classify-sticker", {
      servicePerMinute: 3,
    });
    if (r instanceof Response) ultimo = r;
  }
  assertEquals(ultimo !== null, true, "a 4ª chamada do mesmo IP deveria ser barrada");
  if (ultimo) assertEquals(ultimo.status, 429);
});

Deno.test("IA-012: sem service key no ambiente nada é tratado como serviço", async () => {
  const original = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  try {
    assertEquals(isServiceRoleRequest(pedidoDeServico("10.0.5.1")), false);
    const r = await requireAiIdentityOrService(pedidoDeServico("10.0.5.1"), "classify-sticker");
    // Sem identidade de serviço reconhecível o pedido cai na trilha de usuário,
    // que exige sessão verificada — nunca passa direto.
    assertEquals(r instanceof Response, true);
  } finally {
    if (original !== undefined) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", original);
  }
});
