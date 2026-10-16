// T15 — provisionamento da linha pelo servidor.
//
// O que estes testes travam: (1) host/usuário/porta vêm do servidor e o front
// não pode voltar a conhecer a linha; (2) sem as variáveis de ambiente os
// defaults são exatamente os valores que estavam hardcoded no front (é o que
// permite publicar a função antes de configurar qualquer segredo novo); (3)
// porta vazia ou não-numérica não vira NaN — um `wss://host:NaN/ws` derruba a
// conexão inteira.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env supabase/functions/get-sip-password/index.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { provisionamentoSip } from "./index.ts";

const semEnv = () => undefined;
const comEnv = (vars: Record<string, string>) => (key: string) => vars[key];

Deno.test("T15: sem variáveis de ambiente usa os defaults (o hardcode que saiu do front)", () => {
  assertEquals(provisionamentoSip(semEnv), {
    server: "ip.b24-9441-1552764901.bitrixphone.com",
    user: "phone1",
    wsPort: 8089,
  });
});

Deno.test("T15: com variáveis de ambiente usa o que o servidor diz", () => {
  assertEquals(
    provisionamentoSip(comEnv({ SIP_SERVER: "sip.outro.com", SIP_USER: "phone9", SIP_WS_PORT: "5066" })),
    { server: "sip.outro.com", user: "phone9", wsPort: 5066 },
  );
});

Deno.test("T15: porta vazia ou não-numérica cai no default (nunca NaN)", () => {
  assertEquals(provisionamentoSip(comEnv({ SIP_WS_PORT: "" })).wsPort, 8089);
  assertEquals(provisionamentoSip(comEnv({ SIP_WS_PORT: "abc" })).wsPort, 8089);
});

Deno.test("T15: wsPort sai como número (o front tipa number)", () => {
  assertEquals(typeof provisionamentoSip(comEnv({ SIP_WS_PORT: "5066" })).wsPort, "number");
});
