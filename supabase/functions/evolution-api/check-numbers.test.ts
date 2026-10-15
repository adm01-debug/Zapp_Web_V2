import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleEvolutionApi } from "./index.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais dos
   clients Supabase (mesmo padrão de index.test.ts: SupabaseClient é genérico
   e não é importável no teste). */

// Refazer 1 (t_7063f452): check-numbers virou ação 'control' (só admin) com
// teto de 20 números por chamada (422 acima) e limite de 20 chamadas/60s por
// usuário (429), com a chave no user.id — não no IP.
// RED: sem o bloco, 21 números iam ao provedor e não havia limite por usuário
// (o antigo caía no proxy genérico). GREEN: 422/429 antes de qualquer fetch.
// Cada teste injeta os dois clients via `_injected` e substitui o fetch
// global por um stub que REGISTRA url + body (prova de "chegou ao proxy com
// exatamente esses números").

// O handler exige EVOLUTION_API_URL/KEY configurados (503 sem eles). URL
// inalcançável de propósito: o fetch global está stubado em todos os testes,
// então nenhum byte sai; se algum teste esquecer o stub, a chamada falha em
// vez de tocar a rede.
Deno.env.set("EVOLUTION_API_KEY", "test-evolution-key");
Deno.env.set("EVOLUTION_API_URL", "http://127.0.0.1:9");

// Instância exclusiva deste arquivo: isola o circuit breaker (chave = nome)
// e o cache de token de outros arquivos de teste do mesmo processo.
const INSTANCE = "CHECKNUM";

let ipSeq = 100;
function nextIp(): string {
  // TEST-NET-2 de propósito: sem colisão com a sequência 10.0.0.x dos outros
  // arquivos (o mapa do rate limit é por isolate e sobrevive entre arquivos).
  ipSeq += 1;
  return `198.51.100.${ipSeq}`;
}

/** Builder PostgREST em cadeia que nunca toca rede. */
function makeQuery(data: any = null): any {
  const q: any = {
    select: () => q,
    eq: () => q,
    maybeSingle: () => Promise.resolve({ data, error: null }),
    single: () => Promise.resolve({ data, error: null }),
  };
  return q;
}

/** Caller admin (passa o gate de 'control') com user.id configurável. */
function makeCallerClient(userId: string): any {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: userId } }, error: null }),
    },
    rpc: (fn: string) =>
      fn === "is_admin_or_supervisor"
        ? Promise.resolve({ data: true, error: null })
        : Promise.resolve({ data: null, error: null }),
  };
}

/** Service client: resolve o token da instância no Vault (mockado). */
function makeServiceClient(): any {
  return {
    from: () => makeQuery(),
    rpc: (fn: string) =>
      fn === "get_instance_token"
        ? Promise.resolve({ data: "vault-token-checknum", error: null })
        : Promise.resolve({ data: null, error: null }),
  };
}

interface FetchCall {
  url: string;
  body: unknown;
}

/** Substitui o fetch global e registra cada chamada do proxy. */
function stubFetch(): { calls: FetchCall[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    let body: unknown;
    try {
      body = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      body = init?.body;
    }
    calls.push({ url, body });
    return new Response(JSON.stringify({ result: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function checkNumbersRequest(numbers: unknown, ip: string): Request {
  return new Request("http://localhost/functions/v1/evolution-api/check-numbers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer fake-jwt-checknum",
      "x-real-ip": ip,
    },
    body: JSON.stringify({ instanceName: INSTANCE, numbers }),
  });
}

function numeros(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `5511999${String(1000 + i)}`);
}

/** Roda com flavor v2 e restaura depois: sem tradução GO, o proxy repassa
 *  path e body crus — dá para conferir os números exatos na chamada. */
async function comFlavorV2<T>(fn: () => Promise<T>): Promise<T> {
  const anterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    return await fn();
  } finally {
    if (anterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", anterior);
  }
}

function depsDe(userId: string): any {
  return { callerClient: makeCallerClient(userId), supabase: makeServiceClient() };
}

Deno.test("check-numbers: 21 números devolvem 422 e não chegam ao provedor", async () => {
  await comFlavorV2(async () => {
    const stub = stubFetch();
    try {
      const res = await handleEvolutionApi(
        checkNumbersRequest(numeros(21), nextIp()),
        depsDe("ut-cn-422-vinteum"),
      );
      assertEquals(res.status, 422, "acima do teto de 20 deve ser 422");
      assertEquals((await res.json())?.error?.code, "VALIDATION_ERROR");
      assertEquals(stub.calls.length, 0, "acima do teto não pode ir à rede");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("check-numbers: lista vazia ou não-array devolve 422 sem ir à rede", async () => {
  await comFlavorV2(async () => {
    const stub = stubFetch();
    try {
      const casos: Array<[string, unknown]> = [["vazia", []], ["nao-array", "5511999000001"]];
      for (const [rotulo, numbers] of casos) {
        const res = await handleEvolutionApi(
          checkNumbersRequest(numbers, nextIp()),
          depsDe("ut-cn-422-formato"),
        );
        assertEquals(res.status, 422, `numbers ${rotulo} deve ser 422`);
        assertEquals((await res.json())?.error?.code, "VALIDATION_ERROR");
        assertEquals(stub.calls.length, 0, `numbers ${rotulo} não pode ir à rede`);
      }
    } finally {
      stub.restore();
    }
  });
});

Deno.test("check-numbers: 20 números chegam ao proxy com exatamente esses números", async () => {
  await comFlavorV2(async () => {
    const stub = stubFetch();
    try {
      const nums = numeros(20);
      const res = await handleEvolutionApi(
        checkNumbersRequest(nums, nextIp()),
        depsDe("ut-cn-200-vinte"),
      );
      assertEquals(res.status, 200, "no teto deve passar ao provedor");
      assertEquals(stub.calls.length, 1, "20 números devem ir ao provedor uma vez");
      assert(
        stub.calls[0].url.endsWith(`/chat/whatsappNumbers/${INSTANCE}`),
        `rota inesperada: ${stub.calls[0].url}`,
      );
      assertEquals(
        (stub.calls[0].body as any)?.numbers,
        nums,
        "o proxy deve repassar exatamente os números enviados",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("check-numbers: 21ª chamada do mesmo usuário em 60s devolve 429 sem ir à rede", async () => {
  await comFlavorV2(async () => {
    const stub = stubFetch();
    try {
      const userId = "ut-cn-429-mesmo-usuario";
      for (let i = 0; i < 20; i++) {
        const res = await handleEvolutionApi(
          checkNumbersRequest(numeros(1), nextIp()),
          depsDe(userId),
        );
        assertEquals(res.status, 200, `chamada ${i + 1} deveria passar`);
      }
      assertEquals(stub.calls.length, 20);
      const limitada = await handleEvolutionApi(
        checkNumbersRequest(numeros(1), nextIp()),
        depsDe(userId),
      );
      assertEquals(limitada.status, 429, "21ª chamada do mesmo usuário deve ser limitada");
      const corpoLimitada = await limitada.json() as any;
      assertEquals(corpoLimitada?.error, true);
      assert(
        String(corpoLimitada?.message ?? "").includes("Muitas consultas"),
        `mensagem inesperada: ${JSON.stringify(corpoLimitada)}`,
      );
      assertEquals(stub.calls.length, 20, "chamada limitada não pode ir à rede");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("check-numbers: limite de um usuário não afeta outro (chave é user.id, não IP)", async () => {
  await comFlavorV2(async () => {
    const stub = stubFetch();
    try {
      const ip = "198.51.100.77"; // mesmo IP para A e B de propósito
      for (let i = 0; i < 20; i++) {
        const res = await handleEvolutionApi(
          checkNumbersRequest(numeros(1), ip),
          depsDe("ut-cn-iso-a"),
        );
        assertEquals(res.status, 200, `A chamada ${i + 1} deveria passar`);
      }
      const antes = stub.calls.length;
      const b = await handleEvolutionApi(
        checkNumbersRequest(numeros(2), ip),
        depsDe("ut-cn-iso-b"),
      );
      assertEquals(b.status, 200, "B usa o mesmo IP de A e deve passar: a chave é o user.id");
      assertEquals(stub.calls.length, antes + 1, "B deve chegar ao provedor");
    } finally {
      stub.restore();
    }
  });
});
