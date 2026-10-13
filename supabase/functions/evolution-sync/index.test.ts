// t_3cd6be4a — cobertura da Edge Function `evolution-sync`: o gate de papel
// (admin/supervisor), a validação da entrada e o 503 de "não configurado".
//
// O que estes testes travam:
//   1. EVOLUTION_API_URL/KEY ausente → 503 e NENHUM fetch na rede.
//   2. Sem bearer → 401 e NENHUM fetch.
//   3. Token inválido (getUser rejeita) → 401.
//   4. Usuário comum (getUser ok, is_admin_or_supervisor falso) → 403 e nenhum
//      request ao provedor.
//   5. Ação comum SEM `instanceName` → 400 (nunca assume a instância PRINCIPAL).
//   6. Ação desconhecida → 400 com a lista de ações válidas.
//
// O rate limit (PL-15) entra como TODO: a Edge ainda não o aplica.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-sync/index.test.ts
import { handleEvolutionSync } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Route = { match: string; body: unknown; status?: number };

function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    const alvo = new URL(url);
    const hostComPath = `${alvo.hostname}${alvo.pathname}`;
    const route = routes.find((r) => r.match === hostComPath || r.match === alvo.pathname);
    if (!route) {
      seen.push(`SEM_STUB ${url}`);
      return Promise.resolve(new Response("nao stubado", { status: 599 }));
    }
    seen.push(url);
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return { seen, restore: () => { globalThis.fetch = original; } };
}

const ENV_KEYS = [
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => Promise<void>) {
  const saved = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  });
}

const ENV_OK = {
  EVOLUTION_API_URL: "https://evolution.stub",
  EVOLUTION_API_KEY: "evolution-key-de-teste",
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-de-teste",
};
const SEM_EVOLUTION = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-de-teste",
};

const USER = "30000000-0000-0000-0000-00000000000a";
const ROTA_AUTH = { match: "/auth/v1/user", body: { id: USER, aud: "authenticated" } };
const ROTA_STAFF = { match: "/rest/v1/rpc/is_admin_or_supervisor", body: true };
const ROTA_NAO_STAFF = { match: "/rest/v1/rpc/is_admin_or_supervisor", body: false };

function makeRequest(body: unknown, withAuth = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (withAuth) headers.Authorization = "Bearer token-de-teste";
  return new Request("https://stub.supabase.co/functions/v1/evolution-sync", {
    method: "POST", headers, body: JSON.stringify(body),
  });
}

const semProvedor = (seen: string[]) => seen.filter((u) => u.includes("evolution.stub"));

Deno.test("evolution-sync: sem Evolution configurada devolve 503 e não toca a rede", async () => {
  await withEnv(SEM_EVOLUTION, async () => {
    const stub = withFetch([]);
    try {
      const res = await handleEvolutionSync(makeRequest({ action: "sync-contacts", instanceName: "inst-1" }));
      assert(res.status === 503, `esperado 503, veio ${res.status}`);
      assert(stub.seen.length === 0, `não deveria tocar a rede: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("evolution-sync: sem bearer devolve 401 e não toca a rede", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([]);
    try {
      const res = await handleEvolutionSync(makeRequest({ action: "sync-contacts", instanceName: "inst-1" }, false));
      assert(res.status === 401, `esperado 401, veio ${res.status}`);
      assert(stub.seen.length === 0, `não deveria tocar a rede: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("evolution-sync: token inválido (getUser rejeita) devolve 401", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([{ match: "/auth/v1/user", status: 401, body: { error: "invalid" } }]);
    try {
      const res = await handleEvolutionSync(makeRequest({ action: "sync-contacts", instanceName: "inst-1" }));
      assert(res.status === 401, `esperado 401, veio ${res.status}`);
      assert(semProvedor(stub.seen).length === 0, `não deveria chamar o provedor: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("evolution-sync: usuário comum devolve 403 e não chama o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_NAO_STAFF]);
    try {
      const res = await handleEvolutionSync(makeRequest({ action: "sync-contacts", instanceName: "inst-1" }));
      assert(res.status === 403, `esperado 403, veio ${res.status}`);
      assert(semProvedor(stub.seen).length === 0, `não deveria chamar o provedor: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("evolution-sync: ação comum sem instanceName devolve 400 e não chama o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_STAFF]);
    try {
      const res = await handleEvolutionSync(makeRequest({ action: "sync-contacts" }));
      assert(res.status === 400, `esperado 400, veio ${res.status}`);
      const body = await res.json();
      assert(
        body.error === "instanceName is required for this action",
        `mensagem inesperada: ${JSON.stringify(body)}`,
      );
      assert(semProvedor(stub.seen).length === 0, `não deveria chamar o provedor: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("evolution-sync: ação desconhecida devolve 400 com as ações válidas", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_STAFF]);
    try {
      const res = await handleEvolutionSync(makeRequest({ action: "apagar-tudo", instanceName: "inst-1" }));
      assert(res.status === 400, `esperado 400, veio ${res.status}`);
      const body = await res.json();
      assert(body.error === "Unknown action", `mensagem inesperada: ${JSON.stringify(body)}`);
      assert(
        Array.isArray(body.validActions) && body.validActions.includes("sync-contacts"),
        `validActions deveria listar as ações reais: ${JSON.stringify(body.validActions)}`,
      );
      assert(semProvedor(stub.seen).length === 0, `não deveria chamar o provedor: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});

// PL-15 (edgar) ainda não integrado: a Edge não aplica rate limit hoje.
// Sem corrigir o handler não há o que provar — fica como TODO, nunca como teste que finge.
Deno.test({
  name: "TODO PL-15: evolution-sync deve aplicar rate limit por usuário (ainda não integrado)",
  ignore: true,
  fn() {},
});
