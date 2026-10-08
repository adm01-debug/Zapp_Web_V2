// SL-056 — "Sentry no front e nas edges" (itens 031-032 do plano de paridade).
//
// Lacuna medida no inventário de 07/10/2026: "Sem Sentry.init no front/edges".
// O V2 não aceita dependência nova, então o envelope do Sentry é falado aqui mesmo.
//
// Rode com:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/_shared/__tests__/sentry.test.ts
//
// O que este teste prova (e que falha sem a correção: `../sentry.ts` não existia):
//  1. DESLIGADO POR PADRÃO: sem DSN no ambiente nada é montado e nada é enviado
//     (nenhum fetch) — nenhuma informação sai do sistema por acidente;
//  2. DSN inválido não liga o rastreio, e canal aberto (http) só passa em loopback;
//  3. com DSN válido o evento sai no endpoint do projeto, com a chave pública no
//     cabeçalho, e leva a edge dona, o requestId da requisição e a release;
//  4. o payload não carrega requisição, usuário nem cookies — telefone/e-mail da
//     mensagem saem mascarados (`maskSensitive`);
//  5. reportar nunca vira segunda falha (fetch que rejeita devolve `false`);
//  6. `withSentry` captura e REPASSA o erro, sem mudar a resposta do caminho feliz.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  captureSentryError,
  isSentryEnabled,
  maskSensitive,
  parseSentryDsn,
  sentryStoreUrl,
  withSentry,
} from "../sentry.ts";

const DSN = "https://chavepublica@o123.ingest.sentry.io/42";
const STORE = "https://o123.ingest.sentry.io/api/42/envelope/";

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave);
    else Deno.env.set(chave, valor);
  }
  const restaurar = () => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave);
      else Deno.env.set(chave, valor);
    }
  };
  const resultado = fn();
  if (resultado instanceof Promise) return resultado.finally(restaurar);
  restaurar();
}

/** Só DSN_EDGE/DSN controlados: as demais envs de Sentry saem do caminho. */
function semSentryEnv(fn: () => void | Promise<void>) {
  return withEnv(
    {
      SENTRY_DSN_EDGE: undefined,
      SENTRY_DSN: undefined,
      SENTRY_ENVIRONMENT: undefined,
      SENTRY_RELEASE: undefined,
    },
    fn,
  );
}

interface Envelope {
  header: Record<string, unknown>;
  item: Record<string, unknown>;
  event: Record<string, unknown>;
}

function espiarFetch(resposta: () => Response = () => new Response("", { status: 200 })) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(resposta());
  }) as typeof fetch;
  return { chamadas, fetcher };
}

/** Lê as 3 linhas do envelope (cabeçalho, item e evento). */
function lerEnvelope(body: string): Envelope {
  const [header, item, event] = body.trim().split("\n");
  return {
    header: JSON.parse(header),
    item: JSON.parse(item),
    event: JSON.parse(event),
  };
}

Deno.test("sentry: sem DSN no ambiente fica desligado e não envia nada", async () => {
  await semSentryEnv(async () => {
    const { chamadas, fetcher } = espiarFetch();

    assertEquals(isSentryEnabled(), false);
    assertEquals(await captureSentryError(new Error("boom"), { fn: "evolution-webhook", fetcher }), false);
    assertEquals(chamadas.length, 0, "sem DSN nada pode sair do sistema");
  });
});

Deno.test("sentry: DSN inválido (ou canal aberto fora de loopback) não liga o rastreio", async () => {
  await semSentryEnv(async () => {
    assertEquals(parseSentryDsn(""), null);
    assertEquals(parseSentryDsn("nao-e-url"), null);
    assertEquals(parseSentryDsn("https://o123.ingest.sentry.io/42"), null); // sem chave pública
    assertEquals(parseSentryDsn("https://chave@o123.ingest.sentry.io/nao-numerico"), null);
    assertEquals(parseSentryDsn("http://chave@o123.ingest.sentry.io/42"), null); // http remoto: erro não sai por canal aberto
    assertEquals(parseSentryDsn("https://chave@localhost:9000/42")?.projectId, "42"); // self-hosted local
    assertEquals(parseSentryDsn("https://chave@glitchtip.interno/sentry/42")?.projectId, "42"); // com prefixo

    await withEnv({ SENTRY_DSN: "https://chave@host-invalido/nao-numerico" }, async () => {
      const { chamadas, fetcher } = espiarFetch();
      assertEquals(isSentryEnabled(), false);
      assertEquals(await captureSentryError(new Error("boom"), { fetcher }), false);
      assertEquals(chamadas.length, 0);
    });
  });
});

Deno.test("sentry: com DSN válido envia o envelope ao projeto com chave, edge e requestId", async () => {
  await withEnv(
    {
      SENTRY_DSN_EDGE: DSN,
      SENTRY_DSN: "https://outra@o999.ingest.sentry.io/7",
      SENTRY_ENVIRONMENT: "production",
      SENTRY_RELEASE: "202610081759",
    },
    async () => {
      const { chamadas, fetcher } = espiarFetch();
      const stack = "Error: falhou\n    at handleEvolutionWebhook (file:///index.ts:120:5)";
      const erro = new Error("falhou");
      erro.stack = stack;

      assertEquals(isSentryEnabled(), true);
      assertEquals(
        await captureSentryError(erro, { fn: "evolution-webhook", requestId: "rid-123", fetcher }),
        true,
      );

      assertEquals(chamadas.length, 1);
      assertEquals(chamadas[0].url, STORE, "SENTRY_DSN_EDGE tem precedência sobre SENTRY_DSN");
      assertEquals(chamadas[0].init.method, "POST");
      const headers = chamadas[0].init.headers as Record<string, string>;
      assertEquals(headers["Content-Type"], "application/x-sentry-envelope");
      assertStringIncludes(headers["X-Sentry-Auth"], "sentry_key=chavepublica");
      assertStringIncludes(headers["X-Sentry-Auth"], "sentry_version=7");

      const { header, item, event } = lerEnvelope(String(chamadas[0].init.body));
      assertEquals(header.dsn, DSN);
      assertEquals(item.type, "event");
      assertEquals(event.platform, "javascript");
      assertEquals(event.environment, "production");
      assertEquals(event.release, "202610081759");
      assertEquals((event.tags as Record<string, string>).edge_function, "evolution-webhook");
      assertEquals((event.tags as Record<string, string>).request_id, "rid-123");
      const valor = (event.exception as { values: { type: string; value: string; stacktrace: { frames: unknown[] } }[] })
        .values[0];
      assertEquals(valor.type, "Error");
      assertEquals(valor.value, "falhou");
      assertEquals(valor.stacktrace.frames.length, 1);
    },
  );
});

Deno.test("sentry: o evento não leva requisição, usuário nem cookies — e mascara telefone/e-mail", async () => {
  await withEnv({ SENTRY_DSN_EDGE: DSN }, async () => {
    const { chamadas, fetcher } = espiarFetch();

    await captureSentryError(
      new Error("falha ao enviar para 5511999998888 (contato joao@exemplo.com.br)"),
      { fn: "evolution-webhook", requestId: "rid-1", fetcher },
    );

    const { event } = lerEnvelope(String(chamadas[0].init.body));
    const bruto = JSON.stringify(event);
    assert(!/5511999998888/.test(bruto), "telefone não pode sair do sistema");
    assert(!/joao@exemplo\.com\.br/.test(bruto), "e-mail não pode sair do sistema");
    assertStringIncludes(bruto, "[num]");
    assertStringIncludes(bruto, "[email]");
    assertEquals(event.user, undefined);
    assertEquals(event.request, undefined);
    assertEquals(event.breadcrumbs, undefined);
  });
});

Deno.test("sentry: reportar nunca vira segunda falha (fetch que rejeita devolve false)", async () => {
  await withEnv({ SENTRY_DSN_EDGE: DSN }, async () => {
    const falha = (() => Promise.reject(new Error("sem rede"))) as typeof fetch;
    assertEquals(await captureSentryError(new Error("boom"), { fetcher: falha }), false);

    const semOk = (() => Promise.resolve(new Response("nope", { status: 500 }))) as typeof fetch;
    assertEquals(await captureSentryError(new Error("boom"), { fetcher: semOk }), false);
  });
});

Deno.test("sentry: maskSensitive e sentryStoreUrl", () => {
  assertEquals(
    maskSensitive("erro em 5511999998888 / joao@exemplo.com.br"),
    "erro em [num] / [email]",
  );
  assertEquals(maskSensitive("sem dado sensivel"), "sem dado sensivel");
  assertEquals(
    sentryStoreUrl(parseSentryDsn(DSN)!),
    STORE,
  );
});

Deno.test("sentry: withSentry captura e repassa o erro, sem mudar o caminho feliz", async () => {
  await withEnv({ SENTRY_DSN_EDGE: DSN }, async () => {
    const { chamadas, fetcher } = espiarFetch();
    const quebrado = withSentry(
      () => Promise.reject(new Error("handler explodiu")),
      { fn: "evolution-webhook", fetcher },
    );

    const req = new Request("https://edge.local/evolution-webhook", {
      headers: { "x-request-id": "rid-9" },
    });
    await assertRejects(() => quebrado(req), Error, "handler explodiu");
    assertEquals(chamadas.length, 1, "o erro tem de ser reportado");
    const { event } = lerEnvelope(String(chamadas[0].init.body));
    assertEquals((event.tags as Record<string, string>).request_id, "rid-9");
  });

  await withEnv({ SENTRY_DSN_EDGE: DSN }, async () => {
    const { chamadas, fetcher } = espiarFetch();
    const resposta = new Response("ok", { status: 200 });
    const saudavel = withSentry(() => Promise.resolve(resposta), { fn: "evolution-webhook", fetcher });

    const devolvida = await saudavel(new Request("https://edge.local/evolution-webhook"));
    assertEquals(await devolvida.text(), "ok");
    assertEquals(devolvida.status, 200);
    assertEquals(chamadas.length, 0, "caminho feliz não reporta nada");
  });
});
