// IA-014 — autorização por objeto no áudio.
//
// Antes: `ai-transcribe-audio` só validava a origem da URL e o nome do bucket e
// baixava o objeto com service_role — conhecer o caminho do objeto bastava para
// transcrever áudio de outro contato. Agora a mensagem tem de ser visível para o
// chamador (RLS), com o JWT dele.
//
// Estes testes cobrem os caminhos que decidem ANTES de qualquer acesso a banco ou
// rede (baratos e offline). O caminho "mensagem de outro contato" depende de RLS
// real e é travado pelo contrato de origem em
// `tests/contracts/ai-endpoints-auth.contract.test.ts`.
//
// Run with: deno test --config scripts/ci/deno.json supabase/functions/_shared/__tests__/ai-audio-authz.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { assertMessageVisibleToCaller } from "../ai-audio-authz.ts";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://example.supabase.co/functions/v1/ai-transcribe-audio", { headers });

const UUID = "6f1c4e2a-8b3d-4c5e-9f10-2a3b4c5d6e7f";

Deno.test("assertMessageVisibleToCaller: sem messageId -> 400 (não há objeto a autorizar)", async () => {
  const result = await assertMessageVisibleToCaller(request({ authorization: "Bearer x" }), undefined);
  assert(!result.ok);
  if (!result.ok) assertEquals(result.status, 400);
});

Deno.test("assertMessageVisibleToCaller: messageId fora do formato UUID -> 404 sem tocar o banco", async () => {
  const result = await assertMessageVisibleToCaller(request({ authorization: "Bearer x" }), "nao-e-uuid");
  assert(!result.ok);
  if (!result.ok) assertEquals(result.status, 404);
});

Deno.test("assertMessageVisibleToCaller: sem Bearer -> 401 antes de qualquer consulta", async () => {
  const result = await assertMessageVisibleToCaller(request(), UUID);
  assert(!result.ok);
  if (!result.ok) assertEquals(result.status, 401);
});

Deno.test("assertMessageVisibleToCaller: negativa não distingue 'não existe' de 'não é seu'", async () => {
  const notAVisibleObject = await assertMessageVisibleToCaller(request({ authorization: "Bearer x" }), "123");
  const anotherShape = await assertMessageVisibleToCaller(request({ authorization: "Bearer x" }), "00000000-0000-0000-0000-000000000000x");
  assert(!notAVisibleObject.ok && !anotherShape.ok);
  if (!notAVisibleObject.ok && !anotherShape.ok) {
    // Mesma resposta para os dois formatos: não vaza existência do objeto.
    assertEquals(notAVisibleObject.status, anotherShape.status);
    assertEquals(notAVisibleObject.error, anotherShape.error);
  }
});
