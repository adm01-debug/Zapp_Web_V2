// IA-011 / IA-012 — identidade dos endpoints de IA.
//
// O que estes testes travam: (1) a comparação da service role key é em tempo
// constante e não aceita prefixo/variação; (2) `requireAiIdentity` recusa
// requisição sem identidade de usuário verificada (o buraco original: qualquer
// portador da anon key pública passava pelo gateway com verify_jwt=true) e
// recusa explicitamente a identidade de serviço.
//
// Run with: deno test --config scripts/ci/deno.json supabase/functions/_shared/__tests__/ai-auth.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { isServiceRoleRequest, requireAiIdentity } from "../ai-auth.ts";

const SERVICE_KEY = "service-role-key-com-tamanho-realista-1234567890";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://example.supabase.co/functions/v1/classify-emoji", { headers });

// ---------------------------------------------------------------------------
// isServiceRoleRequest — comparação em tempo constante
// ---------------------------------------------------------------------------

Deno.test("isServiceRoleRequest: só aceita a chave exata", () => {
  assert(isServiceRoleRequest(request({ authorization: `Bearer ${SERVICE_KEY}` }), SERVICE_KEY));
});

Deno.test("isServiceRoleRequest: recusa chave errada, prefixo, sufixo e case trocado", () => {
  const cases = [
    SERVICE_KEY + "x",
    SERVICE_KEY.slice(0, -1),
    SERVICE_KEY.toUpperCase(),
    "outra-chave-qualquer",
  ];
  for (const candidate of cases) {
    assertEquals(
      isServiceRoleRequest(request({ authorization: `Bearer ${candidate}` }), SERVICE_KEY),
      false,
      `aceitou indevidamente: ${candidate}`,
    );
  }
});

Deno.test("isServiceRoleRequest: sem header, sem Bearer ou sem chave configurada -> false", () => {
  assertEquals(isServiceRoleRequest(request(), SERVICE_KEY), false);
  assertEquals(isServiceRoleRequest(request({ authorization: SERVICE_KEY }), SERVICE_KEY), false);
  assertEquals(isServiceRoleRequest(request({ authorization: `Bearer ${SERVICE_KEY}` }), ""), false);
  assertEquals(isServiceRoleRequest(request({ authorization: `Bearer ${SERVICE_KEY}` }), undefined), false);
});

Deno.test("isServiceRoleRequest: header em minúsculas (authorization) também é lido", () => {
  assert(isServiceRoleRequest(request({ authorization: `bearer ${SERVICE_KEY}` }), SERVICE_KEY));
});

// ---------------------------------------------------------------------------
// requireAiIdentity — sem identidade de usuário não há processamento
// ---------------------------------------------------------------------------

Deno.test("requireAiIdentity: sem Authorization -> 401 e nenhum processamento", async () => {
  const result = await requireAiIdentity(request(), "classify-emoji");
  assert(result instanceof Response);
  assertEquals((result as Response).status, 401);
});

Deno.test("requireAiIdentity: Bearer sem sessão válida -> 401", async () => {
  const result = await requireAiIdentity(
    request({ authorization: "Bearer nao-e-um-jwt-valido" }),
    "classify-emoji",
  );
  assert(result instanceof Response);
  assertEquals((result as Response).status, 401);
});

Deno.test("requireAiIdentity: identidade de serviço é recusada (403), não tratada como usuário", async () => {
  const previous = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
  try {
    const result = await requireAiIdentity(
      request({ authorization: `Bearer ${SERVICE_KEY}` }),
      "classify-emoji",
    );
    assert(result instanceof Response);
    assertEquals((result as Response).status, 403);
  } finally {
    if (previous === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", previous);
  }
});
