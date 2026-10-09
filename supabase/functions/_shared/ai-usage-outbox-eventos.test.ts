// SL-195c2 — IA: a Edge grava o evento de IA não confirmado em
// `public.outbox_events` (contrato do pai `t_c33d0cbc`) e assina as
// estatísticas com HMAC-SHA256.
//
// Defeito coberto: quando o insert em `ai_usage_logs` não se confirma,
// `registrarFalhaDeLog` só enfileirava a linha em `ai_usage_outbox` — o evento
// nunca chegava a `outbox_events` e nenhuma estatística era assinada.
//
// Estes testes provam, SEM rede/banco real (`globalThis.fetch` stubado, sem
// credencial verdadeira):
//   (1) sucesso: um POST em outbox_events com as colunas do contrato e
//       assinatura que verifica com o verificador do repositório;
//   (2) idempotência: a MESMA entrada produz o MESMO event_id (a unicidade
//       é do banco via UNIQUE(origem,event_id) + ignore-duplicates; a Edge
//       não pode gerar id novo por chamada);
//   (3) fail-closed: sem AI_OUTBOX_HMAC_SECRET nenhum POST sai para
//       outbox_events (assinatura de mentira é pior que não gravar);
//   (4) falha de gravação: outbox_events 500 não derruba logAiUsage e o
//       caminho do log essencial (ai_usage_outbox + marcador) continua igual;
//   (5) linha não serializável: não derruba logAiUsage e não grava evento
//       com assinatura inválida.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env \
//   --allow-read --allow-net=127.0.0.1 \
//   supabase/functions/_shared/ai-usage-outbox-eventos.test.ts

import {
  assert,
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { chaveDeLog, logAiUsage } from "./ai-usage.ts";
import { verifyHmacSignature } from "./hmac-validation.ts";

const SEGREDO = "segredo-de-teste-da-outbox-de-ia";

type Captura = {
  metodo: string;
  url: string;
  corpo: unknown;
  headers: Record<string, string>;
};

/** Fixa as credenciais do Supabase e o segredo da outbox (sem rede real). */
function stubEnv(comSegredo: boolean): () => void {
  const prev = new Map<string, string | undefined>();
  const fixar = (nome: string, valor: string | undefined) => {
    prev.set(nome, Deno.env.get(nome));
    if (valor === undefined) Deno.env.delete(nome);
    else Deno.env.set(nome, valor);
  };
  fixar("SUPABASE_URL", "https://projeto-teste.supabase.co");
  fixar("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-de-teste");
  fixar("AI_OUTBOX_HMAC_SECRET", comSegredo ? SEGREDO : undefined);
  return () => {
    for (const [nome, valor] of prev) {
      if (valor === undefined) Deno.env.delete(nome);
      else Deno.env.set(nome, valor);
    }
  };
}

/**
 * Substitui `globalThis.fetch` por um espião que reproduz o contrato PostgREST
 * mínimo das tabelas envolvidas — sem rede real, sem banco.
 */
function stubFetch(opts: { logStatus?: number; outboxEventsStatus?: number } = {}): {
  capturas: Captura[];
  restaurar: () => void;
} {
  const capturas: Captura[] = [];
  const original = globalThis.fetch;

  const json = (valor: unknown, status = 200) => Promise.resolve(
    new Response(JSON.stringify(valor), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const metodo = init?.method ?? "GET";
    let corpo: unknown = null;
    try {
      corpo = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      corpo = init?.body ?? null;
    }
    const headers: Record<string, string> = {};
    if (init?.headers) {
      new Headers(init.headers as HeadersInit).forEach((valor, chave) => {
        headers[chave] = valor;
      });
    }
    capturas.push({ metodo, url, corpo, headers });

    if (url.includes("/rest/v1/ai_usage_logs") && metodo === "POST") {
      const status = opts.logStatus ?? 201;
      return status >= 300 ? json({ message: "insert falhou" }, status) : json([], status);
    }
    if (url.includes("/rest/v1/ai_usage_logs") && metodo === "GET") {
      return json([]);
    }
    if (url.includes("/rest/v1/outbox_events") && metodo === "POST") {
      const status = opts.outboxEventsStatus ?? 201;
      return status >= 300 ? json({ message: "outbox indisponivel" }, status) : json([], status);
    }
    if (url.includes("/rest/v1/ai_usage_outbox") && metodo === "POST") {
      return json([], 201);
    }
    return json([]);
  }) as typeof fetch;

  return { capturas, restaurar: () => { globalThis.fetch = original; } };
}

/** Captura os marcadores de console.error sem deixar vazar para o log. */
function capturarErros(): { erros: string[]; restaurar: () => void } {
  const erros: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => erros.push(args.map(String).join(" "));
  return { erros, restaurar: () => { console.error = original; } };
}

/** `userId` nulo evita a resolução de profile_id (uma chamada a menos). */
const ENTRADA = {
  functionName: "ai-proxy",
  userId: null,
  model: "modelo-de-teste",
  inputTokens: 10,
  outputTokens: 5,
  status: "success",
  metadata: { prova: "sl-195c2" },
};

const postsEm = (capturas: Captura[], tabela: string) =>
  capturas.filter((c) => c.metodo === "POST" && c.url.includes(`/rest/v1/${tabela}`));

// ---------------------------------------------------------------------------
// (1) Sucesso — o evento não confirmado chega a outbox_events ASSINADO
// ---------------------------------------------------------------------------
Deno.test("SL-195c2 evento de IA não confirmado é gravado em outbox_events com assinatura HMAC válida", async () => {
  const restaurarEnv = stubEnv(true);
  const { capturas, restaurar } = stubFetch({ logStatus: 500 });

  try {
    await logAiUsage(ENTRADA);

    const posts = postsEm(capturas, "outbox_events");
    assertEquals(
      posts.length,
      1,
      "o evento de IA não confirmado tem de gravar UMA vez em outbox_events",
    );
    const post = posts[0];
    assert(
      post.url.includes("on_conflict=origem,event_id"),
      `a gravação tem de ser idempotente por ON CONFLICT (origem,event_id): ${post.url}`,
    );
    const prefer = post.headers["prefer"] ?? "";
    assert(
      prefer.includes("resolution=ignore-duplicates"),
      `Prefer tem de pedir ignore-duplicates (ON CONFLICT DO NOTHING do pai): ${prefer}`,
    );

    const corpo = post.corpo as Record<string, unknown>;
    assertEquals(corpo.origem, "ai-proxy", "origem = produtor do evento (function_name)");
    assertEquals(corpo.tipo, "ia.stats");
    assertEquals(corpo.algoritmo, "sha256");
    assertEquals(corpo.tentativas, 0);
    assert(
      !("processed_at" in corpo),
      "processed_at não vai no POST: a coluna nasce NULL (não confirmado)",
    );
    assertMatch(
      String(corpo.assinatura),
      /^(sha256=)?[0-9a-f]{64}$/,
      "assinatura tem de ser HMAC-SHA256 hex minúsculo",
    );

    const payload = corpo.payload as Record<string, unknown>;
    assertEquals(typeof payload, "object", "payload é objeto, nunca string solta");
    assertEquals(typeof payload.corpo, "string", "payload.corpo guarda a STRING assinada");
    assertEquals(payload.motivo, "insert_exaurido");

    // event_id é a chave estável de idempotência: chaveDeLog da linha emitida.
    const postLog = postsEm(capturas, "ai_usage_logs")[0];
    const enviado = postLog.corpo as Record<string, unknown> | Record<string, unknown>[];
    const linha = (Array.isArray(enviado) ? enviado[0] : enviado) as Record<string, unknown>;
    const esperado = await chaveDeLog(linha);
    assertMatch(String(corpo.event_id), /^[0-9a-f]{64}$/);
    assertEquals(
      corpo.event_id,
      esperado,
      "event_id tem de ser o chaveDeLog da linha — nada de id novo por chamada",
    );
    assertEquals(payload.log_key, esperado);

    // Verificação INDEPENDENTE, com o verificador do repositório.
    const verificou = await verifyHmacSignature(
      payload.corpo as string,
      String(corpo.assinatura),
      SEGREDO,
    );
    assert(verificou, "a assinatura gravada tem de verificar contra o corpo canônico");

    const canonico = JSON.parse(payload.corpo as string) as Record<string, unknown>;
    assertEquals(canonico.function_name, "ai-proxy", "o corpo canônico carrega a linha emitida");
  } finally {
    restaurar();
    restaurarEnv();
  }
});

// ---------------------------------------------------------------------------
// (2) Idempotência — a mesma entrada produz o MESMO event_id
// ---------------------------------------------------------------------------
Deno.test("SL-195c2 duas gravações da mesma entrada usam o MESMO event_id", async () => {
  const restaurarEnv = stubEnv(true);
  const { capturas, restaurar } = stubFetch({ logStatus: 500 });

  try {
    await logAiUsage(ENTRADA);
    await logAiUsage(ENTRADA);

    const eventos = postsEm(capturas, "outbox_events")
      .map((c) => (c.corpo as Record<string, unknown>).event_id);
    assertEquals(eventos.length, 2, "cada falha de log gera um POST em outbox_events");
    assertEquals(
      eventos[0],
      eventos[1],
      "a Edge não pode gerar id novo por chamada — a unicidade é do banco",
    );
  } finally {
    restaurar();
    restaurarEnv();
  }
});

// ---------------------------------------------------------------------------
// (3) Fail-closed — sem segredo, NENHUM POST sai para outbox_events
// ---------------------------------------------------------------------------
Deno.test("SL-195c2 sem AI_OUTBOX_HMAC_SECRET nenhum evento sai (e o log essencial continua)", async () => {
  const restaurarEnv = stubEnv(false);
  const { capturas, restaurar } = stubFetch({ logStatus: 500 });
  const { erros, restaurar: restaurarConsole } = capturarErros();

  try {
    await logAiUsage(ENTRADA);

    assertEquals(
      postsEm(capturas, "outbox_events").length,
      0,
      "sem segredo a assinatura é impossível: gravar sem assinar é proibido",
    );
    assert(
      erros.some((m) => m.includes("[ai-usage][OUTBOX-EVENTO-NAO-ASSINADO]")),
      "o marcador de evento não assinado tem de sair no log da função",
    );
    assertEquals(
      postsEm(capturas, "ai_usage_outbox").length,
      1,
      "o caminho de ai_usage_outbox do log essencial continua sendo chamado",
    );
  } finally {
    restaurarConsole();
    restaurar();
    restaurarEnv();
  }
});

// ---------------------------------------------------------------------------
// (4) Falha de gravação — outbox_events 500 não derruba o fluxo
// ---------------------------------------------------------------------------
Deno.test("SL-195c2 outbox_events respondendo 500: logAiUsage resolve sem lançar e marca a perda", async () => {
  const restaurarEnv = stubEnv(true);
  const { capturas, restaurar } = stubFetch({ logStatus: 500, outboxEventsStatus: 500 });
  const { erros, restaurar: restaurarConsole } = capturarErros();

  try {
    await logAiUsage(ENTRADA); // tem de RESOLVER — o caminho de log não explode

    assertEquals(
      postsEm(capturas, "outbox_events").length,
      1,
      "a tentativa de gravação do evento aconteceu",
    );
    assert(
      erros.some((m) => m.includes("[ai-usage][OUTBOX-EVENTO-PERDIDO]")),
      "a perda do evento tem de sair pelo marcador de log",
    );
    assertEquals(
      postsEm(capturas, "ai_usage_outbox").length,
      1,
      "a pendência do log essencial continua sendo gravada normalmente",
    );
  } finally {
    restaurarConsole();
    restaurar();
    restaurarEnv();
  }
});

// ---------------------------------------------------------------------------
// (5) Payload inválido não vira lixo — linha circular não derruba nem grava
//     evento com assinatura inválida
// ---------------------------------------------------------------------------
Deno.test("SL-195c2 linha não serializável não derruba logAiUsage e não grava evento inválido", async () => {
  const restaurarEnv = stubEnv(true);
  const { capturas, restaurar } = stubFetch({ logStatus: 500 });
  const { erros, restaurar: restaurarConsole } = capturarErros();

  try {
    const circular: Record<string, unknown> = {};
    circular.eu = circular;
    await logAiUsage({ ...ENTRADA, metadata: { ciclo: circular } });

    const posts = postsEm(capturas, "outbox_events");
    for (const post of posts) {
      const corpo = post.corpo as Record<string, unknown>;
      const payload = corpo.payload as Record<string, unknown>;
      const ok = await verifyHmacSignature(
        String(payload?.corpo),
        String(corpo.assinatura),
        SEGREDO,
      );
      assert(ok, "não pode gravar evento cuja assinatura não verifica");
    }
    assertEquals(
      posts.length,
      0,
      "linha não serializável não pode virar evento gravado (assinatura impossível)",
    );
    assert(
      erros.some(
        (m) =>
          m.includes("[ai-usage][OUTBOX-EVENTO-PERDIDO]") ||
          m.includes("[ai-usage][LOG-ESSENCIAL-PERDIDO]"),
      ),
      "a perda tem de ser declarada pelo marcador, nunca engolida",
    );
  } finally {
    restaurarConsole();
    restaurar();
    restaurarEnv();
  }
});
