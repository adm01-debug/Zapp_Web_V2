import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { proxyToEvolution } from "../evolution-api-proxy.ts";

// ---------------------------------------------------------------------------
// E22 / SL-055 — circuito por INSTÂNCIA no proxy da Evolution.
//
// O inventário (item 027-028) registrava "Circuit breaker por instância
// Evolution NÃO CONFIRMADO", com a evidência apontando `_shared/ai-circuit.ts`
// (aquele circuito é só de IA). Este arquivo CONFIRMA o circuito da Evolution e
// trava o contrato por instância: `cbKey` (o `instanceName`) isola o estado, o
// limiar abre em falhas de INFRA (5xx/timeout), um sucesso zera a sequência e
// o cooldown devolve UMA tentativa.
//
// flavor v2: o circuito fica ANTES da tradução GO (proxyToEvolution), então a
// prova usa a rota v2 crua e o nome da instância sai direto na URL — dá para
// conferir, pelo próprio fetch, QUAL instância foi martelada.
// ---------------------------------------------------------------------------

Deno.env.set("EVOLUTION_API_FLAVOR", "v2");

const URL_BASE = "https://evolution.test";
const API_KEY = "test-evolution-key";
const CORS: Record<string, string> = {};
const ROTA = "/message/sendText";

interface FetchLog {
  urls: string[];
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Substitui o fetch global e registra cada URL realmente chamada. */
function stubFetch(responder: (url: string) => Response | Promise<Response>): {
  log: FetchLog;
  restore: () => void;
} {
  const original = globalThis.fetch;
  const log: FetchLog = { urls: [] };
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    log.urls.push(url);
    return Promise.resolve(responder(url));
  }) as typeof fetch;
  return { log, restore: () => { globalThis.fetch = original; } };
}

/** Uma chamada do proxy para a instância informada (chave do circuito = nome). */
function chamar(instancia: string): Promise<Response> {
  return proxyToEvolution(
    URL_BASE,
    API_KEY,
    CORS,
    ROTA,
    "POST",
    { number: "5500000000000", text: "oi" },
    instancia,
    instancia,
  );
}

async function corpo(res: Response): Promise<Record<string, unknown>> {
  return await res.json() as Record<string, unknown>;
}

const FALHA_INFRA = [500, 502, 503, 504, 408];

Deno.test("E22/SL-055: 5 falhas de infra na instância A abrem o circuito SÓ de A — B segue chamando a GO", async () => {
  const stub = stubFetch(() => json({ error: "evolution fora" }, 503));
  try {
    for (let i = 0; i < 5; i++) {
      const res = await chamar("INST_A");
      assertEquals(res.status, 200);
      assertEquals((await corpo(res)).status, 503);
    }
    // As 5 falhas foram à rede, cada uma na sua instância.
    assertEquals(stub.log.urls.length, 5);
    assertEquals(stub.log.urls.every((u) => u.endsWith("/INST_A")), true);

    // 6ª chamada de A: circuito ABERTO → bloqueia ANTES da rede.
    const aberta = await chamar("INST_A");
    const corpoAberto = await corpo(aberta);
    assertEquals(aberta.status, 200);
    assertEquals(corpoAberto.error, true);
    assertEquals(corpoAberto.status, 503);
    assertEquals(
      String(corpoAberto.message).includes("circuit breaker aberto"),
      true,
    );
    assertEquals(stub.log.urls.length, 5); // nenhum fetch novo: parou de martelar

    // B continua: 5 falhas de A não podem abrir o circuito de B.
    const b = await chamar("INST_B");
    assertEquals((await corpo(b)).status, 503);
    assertEquals(stub.log.urls.length, 6);
    assertEquals(stub.log.urls[5].endsWith("/INST_B"), true);
  } finally {
    stub.restore();
  }
});

Deno.test("E22/SL-055: cada status de infra (500/502/503/504/408) conta falha; 5 somadas abrem", async () => {
  let i = 0;
  const stub = stubFetch(() => json({ error: "infra" }, FALHA_INFRA[i++ % FALHA_INFRA.length]));
  try {
    for (const status of FALHA_INFRA) {
      const res = await chamar("INST_STATUS");
      assertEquals((await corpo(res)).status, status);
    }
    const aberta = await chamar("INST_STATUS");
    const corpoAberto = await corpo(aberta);
    assertEquals(
      String(corpoAberto.message).includes("circuit breaker aberto"),
      true,
    );
    assertEquals(stub.log.urls.length, 5);
  } finally {
    stub.restore();
  }
});

Deno.test("E22/SL-055: um sucesso zera a sequência — o limiar é de falhas CONSECUTIVAS", async () => {
  let modo: "falha" | "ok" = "falha";
  const stub = stubFetch(() => modo === "falha" ? json({ error: "infra" }, 503) : json({ ok: true }, 200));
  try {
    for (let i = 0; i < 4; i++) await chamar("INST_C");
    modo = "ok";
    const sucesso = await chamar("INST_C");
    assertEquals(await corpo(sucesso), { ok: true });
    modo = "falha";
    for (let i = 0; i < 4; i++) await chamar("INST_C");

    // 4 falhas + sucesso + 4 falhas = 9 idas à rede; nenhuma foi bloqueada.
    assertEquals(stub.log.urls.length, 9);
    // A 10ª é a 5ª falha DEPOIS do sucesso: ainda passa pela rede (o circuito
    // só abre na PRÓXIMA), provando que o sucesso realmente zerou o contador.
    const decima = await chamar("INST_C");
    assertEquals((await corpo(decima)).status, 503);
    assertEquals(stub.log.urls.length, 10);
    const decimaPrimeira = await chamar("INST_C");
    assertEquals(
      String((await corpo(decimaPrimeira)).message).includes("circuit breaker aberto"),
      true,
    );
    assertEquals(stub.log.urls.length, 10);
  } finally {
    stub.restore();
  }
});

Deno.test("E22/SL-055: 4xx é a GO respondendo (serviço de pé) e NÃO abre o circuito", async () => {
  let n = 0;
  const stub = stubFetch(() => (n++ === 4 ? json({ message: "nao encontrado" }, 404) : json({ error: "infra" }, 500)));
  try {
    for (let i = 0; i < 4; i++) await chamar("INST_404");
    const quatroZero = await chamar("INST_404"); // 404 no meio
    assertEquals((await corpo(quatroZero)).status, 404);
    for (let i = 0; i < 4; i++) await chamar("INST_404");

    // Se o 404 não tivesse zerado, o circuito já teria aberto na 5ª ocorrência.
    assertEquals(stub.log.urls.length, 9);
    const seguinte = await chamar("INST_404");
    assertEquals((await corpo(seguinte)).status, 500);
    assertEquals(stub.log.urls.length, 10);
  } finally {
    stub.restore();
  }
});

Deno.test("E22/SL-055: queda de rede (fetch lança) também abre o circuito", async () => {
  const stub = stubFetch(() => {
    throw new Error("connect ECONNREFUSED");
  });
  try {
    for (let i = 0; i < 5; i++) await chamar("INST_REDE");
    const aberta = await chamar("INST_REDE");
    const corpoAberto = await corpo(aberta);
    assertEquals(corpoAberto.status, 503);
    assertEquals(
      String(corpoAberto.message).includes("circuit breaker aberto"),
      true,
    );
    assertEquals(stub.log.urls.length, 5);
  } finally {
    stub.restore();
  }
});

Deno.test("E22/SL-055: passado o cooldown o circuito devolve UMA tentativa (half-open)", async () => {
  const realNow = Date.now;
  let agora = 1_700_000_000_000;
  (Date as unknown as { now: () => number }).now = () => agora;
  const stub = stubFetch(() => json({ error: "infra" }, 503));
  try {
    for (let i = 0; i < 5; i++) await chamar("INST_D");
    const bloqueada = await chamar("INST_D");
    assertEquals(
      String((await corpo(bloqueada)).message).includes("circuit breaker aberto"),
      true,
    );
    assertEquals(stub.log.urls.length, 5);

    // +1s: ainda dentro do cooldown (60s) → continua bloqueado sem rede.
    agora += 1_000;
    await chamar("INST_D");
    assertEquals(stub.log.urls.length, 5);

    // Passou do cooldown → a tentativa volta a passar pela rede.
    agora += 60_000;
    const liberada = await chamar("INST_D");
    assertEquals((await corpo(liberada)).status, 503);
    assertEquals(stub.log.urls.length, 6);
  } finally {
    stub.restore();
    Date.now = realNow;
  }
});
