import assert from "node:assert/strict";
import test from "node:test";

// Modulo Deno importado direto pelo Node (type-stripping nativo, Node >= 22.18;
// o CI roda Node 24). So funcoes puras sao exercitadas — nada aqui toca Deno.env.
import { normalizeGoResponse } from "../../supabase/functions/_shared/evolution-api-proxy.ts";

// Shape real do GO em /instance/all (campos reais, valores ficticios).
function goInstanceAll() {
  return {
    message: "success",
    data: [
      { id: "uuid-1", name: "PRINCIPAL", token: "SECRET-TOKEN-1", webhook: "https://x/functions/v1/evolution-webhook", events: "MESSAGE,CALL", connected: true },
      { id: "uuid-2", name: "OUTRA", token: "SECRET-TOKEN-2", webhook: "", events: "", connected: false },
    ],
  };
}

test("regressao de seguranca: /instance/all nunca devolve o token da instancia", () => {
  const input = goInstanceAll();
  const out = normalizeGoResponse("/instance/all", input);

  assert.equal(out.message, "success");
  assert.equal(out.data.length, 2);
  for (const instance of out.data) {
    assert.equal("token" in instance, false, "token da instancia nao pode vazar para o cliente");
  }
  assert.equal(JSON.stringify(out).includes("SECRET-TOKEN"), false);
  assert.deepEqual(out.data[0], {
    id: "uuid-1", name: "PRINCIPAL", webhook: "https://x/functions/v1/evolution-webhook", events: "MESSAGE,CALL", connected: true,
  });
  assert.deepEqual(out.data[1], { id: "uuid-2", name: "OUTRA", webhook: "", events: "", connected: false });
});

test("/instance/all nao muta o objeto de entrada", () => {
  const input = goInstanceAll();
  normalizeGoResponse("/instance/all", input);
  assert.equal(input.data[0].token, "SECRET-TOKEN-1");
  assert.equal(input.data[1].token, "SECRET-TOKEN-2");
});

test("/instance/all com data nao-array passa intacto (sem crash)", () => {
  assert.deepEqual(normalizeGoResponse("/instance/all", { message: "error" }), { message: "error" });
  assert.equal(normalizeGoResponse("/instance/all", null), null);
});

test("filtro de token e restrito a /instance/all — demais rotas inalteradas", () => {
  const labels = normalizeGoResponse("/label/list", { data: [{ label_id: "l1", label_name: "VIP", label_color: 3 }] });
  assert.deepEqual(labels, [{ id: "l1", name: "VIP", color: 3 }]);

  const send = normalizeGoResponse(null, { data: { Info: { ID: "m1", Chat: "j@s", IsFromMe: true } } });
  assert.equal(send.key.id, "m1");
  assert.equal(send.messageId, "m1");

  // Rota generica com `token` no payload nao e tocada (escopo minimo).
  const other = normalizeGoResponse("/instance/status", { data: { token: "t", loggedIn: true } });
  assert.equal(other.data.token, "t");
});
