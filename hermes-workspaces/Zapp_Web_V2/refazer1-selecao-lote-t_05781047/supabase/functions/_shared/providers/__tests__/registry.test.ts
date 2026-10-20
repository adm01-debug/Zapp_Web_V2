// Testes do registry de provedores de WhatsApp (Bloco 5, etapas 046/047).
//
// O que este arquivo prova:
//   1. caminho PADRAO (sem knob e sem pedido) = `evolution` — o comportamento de hoje;
//   2. fail-closed: id desconhecido e `cloud` (reservado, sem implementacao) NEGAM —
//      nunca caem no provedor padrao;
//   3. `fake` so existe com DENO_ENV=test; pedir fora disso NEGA;
//   4. `PROVIDER_UNDER_TEST` so vale com DENO_ENV=test: o knob presente fora de teste
//      NEGA em vez de ser ignorado (ignorar = mandar mensagem real achando que esta
//      em teste). Um teste exercita o caminho REAL do processo (Deno.env) e restaura
//      o env no finally;
//   5. o fake cumpre o MESMO contrato do adaptador real (capacidades identicas, mesmo
//      shape de resultado), o envio pelo fake NAO toca o `fetch` injetado (prova de
//      "sem rede") e o registro nao guarda o valor de credencial nenhuma;
//   6. o adaptador `evolution` delega para o transporte (rota GO real e credencial da
//      instancia no header) e NEGA conexao sem baseUrl.
//
// Nao ha rede, banco nem credencial real: as URLs sao de teste (.test) e os ids de
// mensagem sao sinteticos.
//
// Rodar: deno test --config scripts/ci/deno.json --frozen --allow-env supabase/functions/_shared/providers/__tests__/registry.test.ts

import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { capabilities, MAX_TEXT_CHARS, type SendItem } from "../../messaging/evolution-go.ts";
import { createEvolutionProvider, ProviderMisconfiguredError } from "../evolution/index.ts";
import { createFakeProvider } from "../fake/index.ts";
import { resolveWhatsAppProvider } from "../registry.ts";
import { ProviderResolutionError } from "../types.ts";

const TEST_ITEM: SendItem = {
  kind: "text",
  to: "5564999999999",
  instanceId: "INST-TESTE",
  text: "ola",
};

const TEST_ENV = { DENO_ENV: "test" };

/** `fetch` que DENUNCIA qualquer tentativa de rede. */
function fetchProibido(): never {
  throw new Error("rede proibida neste teste");
}

function restaurarEnv(nome: string, valor: string | undefined): void {
  if (valor === undefined) Deno.env.delete(nome);
  else Deno.env.set(nome, valor);
}

// ─── resolucao: caminho padrao ───────────────────────────────────────────────

Deno.test("046: sem pedido e sem knob, o provedor e o Evolution (caminho padrao de hoje)", () => {
  const { provider, source } = resolveWhatsAppProvider({ env: {} });
  assertEquals(source, "default");
  assertEquals(provider.id, "evolution");
  assertEquals(provider.capabilities(), capabilities());
});

Deno.test("046: o caminho REAL do processo resolve Evolution sem knob e NEGA o knob fora de DENO_ENV=test", () => {
  const antes = {
    DENO_ENV: Deno.env.get("DENO_ENV"),
    PROVIDER_UNDER_TEST: Deno.env.get("PROVIDER_UNDER_TEST"),
  };
  try {
    Deno.env.delete("DENO_ENV");
    Deno.env.delete("PROVIDER_UNDER_TEST");
    const padrao = resolveWhatsAppProvider();
    assertEquals(padrao.source, "default");
    assertEquals(padrao.provider.id, "evolution");

    // O knob de teste fora de DENO_ENV=test NAO pode ser ignorado: negar e o unico
    // jeito de nao mandar mensagem real achando que se esta em teste.
    Deno.env.set("PROVIDER_UNDER_TEST", "fake");
    const negado = assertThrows(() => resolveWhatsAppProvider(), ProviderResolutionError);
    assertEquals(negado.code, "test_override_requires_test_env");

    Deno.env.set("DENO_ENV", "test");
    const comKnob = resolveWhatsAppProvider();
    assertEquals(comKnob.source, "test-override");
    assertEquals(comKnob.provider.id, "fake");
  } finally {
    restaurarEnv("DENO_ENV", antes.DENO_ENV);
    restaurarEnv("PROVIDER_UNDER_TEST", antes.PROVIDER_UNDER_TEST);
  }
});

Deno.test("046: pedido explicito de `evolution` fora de teste e atendido (nao vira outro provedor)", () => {
  const { provider, source } = resolveWhatsAppProvider({
    env: { DENO_ENV: "production" },
    requested: "evolution",
  });
  assertEquals(source, "requested");
  assertEquals(provider.id, "evolution");
});

// ─── resolucao: tudo que nao esta liberado NEGA ──────────────────────────────

Deno.test("046: pedir `fake` fora de DENO_ENV=test NEGA (nao cai no Evolution)", () => {
  const emProducao = assertThrows(
    () => resolveWhatsAppProvider({ env: { DENO_ENV: "production" }, requested: "fake" }),
    ProviderResolutionError,
  );
  assertEquals(emProducao.code, "provider_not_allowed_in_env");

  const semEnv = assertThrows(
    () => resolveWhatsAppProvider({ env: {}, requested: "fake" }),
    ProviderResolutionError,
  );
  assertEquals(semEnv.code, "provider_not_allowed_in_env");
});

Deno.test("048 (reservado): pedir `cloud` NEGA em qualquer env — nao ha queda silenciosa para o Evolution", () => {
  for (const env of [{}, TEST_ENV, { DENO_ENV: "production" }]) {
    const negado = assertThrows(
      () => resolveWhatsAppProvider({ env, requested: "cloud" }),
      ProviderResolutionError,
    );
    assertEquals(negado.code, "provider_unavailable");
  }
});

Deno.test("046: id desconhecido NEGA (nada e escolhido por engano)", () => {
  const peloPedido = assertThrows(
    () => resolveWhatsAppProvider({ env: TEST_ENV, requested: "wpp-aleatorio" }),
    ProviderResolutionError,
  );
  assertEquals(peloPedido.code, "provider_unknown");

  const peloKnob = assertThrows(
    () => resolveWhatsAppProvider({ env: { DENO_ENV: "test", PROVIDER_UNDER_TEST: "wpp-aleatorio" } }),
    ProviderResolutionError,
  );
  assertEquals(peloKnob.code, "provider_unknown");
});

Deno.test("046: o knob de teste manda sobre o pedido do chamador (a suite nao toca a rede)", () => {
  const { provider, source } = resolveWhatsAppProvider({
    env: { DENO_ENV: "test", PROVIDER_UNDER_TEST: "fake" },
    requested: "evolution",
  });
  assertEquals(source, "test-override");
  assertEquals(provider.id, "fake");
});

Deno.test("047: a suite usa UMA instancia do fake (nao um fake novo por resolucao)", () => {
  const env = { DENO_ENV: "test", PROVIDER_UNDER_TEST: "fake" };
  const primeira = resolveWhatsAppProvider({ env }).provider;
  const segunda = resolveWhatsAppProvider({ env }).provider;
  assertEquals(primeira.id, "fake");
  assert(primeira === segunda, "o registry deveria devolver a MESMA instancia do fake");
});

// ─── contrato do provedor falso ──────────────────────────────────────────────

Deno.test("047: o fake cumpre o MESMO contrato de capacidades do adaptador real", () => {
  const fake = createFakeProvider({ env: TEST_ENV });
  assertEquals(fake.capabilities(), capabilities());
  assertEquals(fake.capabilities().maxTextChars, MAX_TEXT_CHARS);
});

Deno.test("047: envio pelo fake NAO toca a rede, devolve id sintetico e nao guarda credencial", async () => {
  const fake = createFakeProvider({ env: TEST_ENV });
  const resultado = await fake.send(TEST_ITEM, {
    fetch: fetchProibido,
    credentials: { instanceToken: "token-de-teste" },
  });
  assertEquals(resultado.ok, true);
  assertEquals(resultado.status, 200);
  assertEquals(resultado.messageId, "fake-1");
  assertEquals(resultado.body, { key: { id: "fake-1" } });

  assertEquals(fake.sent.length, 1);
  assertEquals(fake.sent[0].usedInstanceToken, true);
  assert(
    !JSON.stringify(fake.sent).includes("token-de-teste"),
    "o registro do fake nao pode guardar o valor da credencial",
  );
});

Deno.test("047: os modos de falha do fake devolvem ok:false (nao lancam, como o adaptador real)", async () => {
  const fake = createFakeProvider({ env: TEST_ENV });
  const deps = { fetch: fetchProibido, credentials: {} };

  fake.setMode("500");
  assertEquals(await fake.send(TEST_ITEM, deps), {
    ok: false,
    status: 500,
    error: "HTTP 500",
    body: { error: "fake_500" },
  });

  fake.setMode("error_body");
  const recusado = await fake.send(TEST_ITEM, deps);
  assertEquals(recusado.ok, false);
  assertEquals(recusado.status, 200);
  assertEquals(recusado.error, "fake_error");

  fake.setMode("sem_id");
  const semId = await fake.send(TEST_ITEM, deps);
  assertEquals(semId.ok, false);
  assertEquals(semId.messageId, undefined);
  assertEquals(semId.error, "missing_provider_message_id");

  assertEquals(fake.sent.length, 3);
});

Deno.test("047: o fake recusa existir fora de DENO_ENV=test", () => {
  assertThrows(() => createFakeProvider({ env: { DENO_ENV: "production" } }), Error, "DENO_ENV=test");
  assertThrows(() => createFakeProvider({ env: {} }), Error, "DENO_ENV=test");
});

// ─── adaptador do transporte real ────────────────────────────────────────────

Deno.test("046: o adaptador `evolution` traduz credenciais e usa a rota GO real do transporte", async () => {
  const chamadas: { url: string; apikey: string; body: Record<string, unknown> | undefined }[] = [];
  const fetchFalso = (url: string, options: RequestInit): Promise<Response> => {
    const headers = (options.headers ?? {}) as Record<string, string>;
    chamadas.push({
      url,
      apikey: headers.apikey ?? "",
      body: options.body ? JSON.parse(String(options.body)) : undefined,
    });
    return Promise.resolve(
      new Response(JSON.stringify({ key: { id: "evo-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  const provider = createEvolutionProvider();
  const resultado = await provider.send(TEST_ITEM, {
    fetch: fetchFalso,
    credentials: { baseUrl: "https://evolution.test", instanceToken: "token-de-teste" },
  });

  assertEquals(resultado, { ok: true, status: 200, messageId: "evo-1", body: { key: { id: "evo-1" } } });
  const envio = chamadas[chamadas.length - 1];
  assertEquals(envio.url, "https://evolution.test/send/text");
  assertEquals(envio.apikey, "token-de-teste");
  assertEquals(envio.body?.number, TEST_ITEM.to);
  // a presenca humanizada antecede o envio (best-effort) no transporte
  assertEquals(chamadas[0].url, "https://evolution.test/message/presence");
});

Deno.test("046: o adaptador `evolution` NEGA conexao sem baseUrl (nenhum envio sem configuracao)", async () => {
  const provider = createEvolutionProvider();

  const semBaseUrl = await assertRejects(
    () => provider.send(TEST_ITEM, { fetch: fetchProibido, credentials: { instanceToken: "x" } }),
    ProviderMisconfiguredError,
  );
  assertEquals(semBaseUrl.code, "provider_misconfigured");

  const baseUrlVazia = await assertRejects(
    () => provider.send(TEST_ITEM, { fetch: fetchProibido, credentials: { baseUrl: "   " } }),
    ProviderMisconfiguredError,
  );
  assertEquals(baseUrlVazia.code, "provider_misconfigured");
});
