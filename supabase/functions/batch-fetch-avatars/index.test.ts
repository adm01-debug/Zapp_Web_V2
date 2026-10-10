/**
 * N-165: batch-fetch-avatars exige admin/supervisor para chamadas de
 * usu\u00e1rio. Este arquivo prova os quatro caminhos de autentica\u00e7\u00e3o:
 * cron secret (isento), service key (isento), usu\u00e1rio admin/supervisor
 * (ok) e usu\u00e1rio sem papel de gest\u00e3o (403).
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleBatchFetchAvatars } from "./index.ts";

type Route = { match: string; body: unknown; status?: number };

function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    const alvo = new URL(url);
    const hostComPath = `${alvo.hostname}${alvo.pathname}`;
    const route = routes.find(
      (r) => r.match === hostComPath || r.match === alvo.pathname,
    );
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

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

function withEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  fn: () => Promise<void>,
) {
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
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-de-teste",
};

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ROTA_AUTH = { match: "/auth/v1/user", body: { id: USER_ID, aud: "authenticated" } };
const ROTA_STAFF = { match: "/rest/v1/rpc/is_admin_or_supervisor", body: true };
const ROTA_NAO_STAFF = { match: "/rest/v1/rpc/is_admin_or_supervisor", body: false };
const ROTA_CRON = { match: "/rest/v1/rpc/get_avatars_refresh_cron_secret", body: "cron-secret-de-teste" };
const ROTA_CONTATOS = { match: "/rest/v1/contacts", body: [] };
const ROTA_CONEXOES = { match: "/rest/v1/whatsapp_connections", body: [] };

Deno.test("N-165: cron secret autoriza sem verifica\u00e7\u00e3o de admin/supervisor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_CRON, ROTA_CONTATOS, ROTA_CONEXOES]);
    try {
      const req = new Request("http://localhost/functions/v1/batch-fetch-avatars", {
        headers: { "x-cron-secret": "cron-secret-de-teste" },
      });
      const resp = await handleBatchFetchAvatars(req);
      assertEquals(resp.status, 200);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("N-165: service key autoriza sem verifica\u00e7\u00e3o de admin/supervisor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_CONTATOS, ROTA_CONEXOES]);
    try {
      const req = new Request("http://localhost/functions/v1/batch-fetch-avatars", {
        headers: { Authorization: `Bearer ${ENV_OK.SUPABASE_SERVICE_ROLE_KEY}` },
      });
      const resp = await handleBatchFetchAvatars(req);
      assertEquals(resp.status, 200);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("N-165: usu\u00e1rio admin passa pela verifica\u00e7\u00e3o de admin/supervisor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_STAFF, ROTA_CONTATOS, ROTA_CONEXOES]);
    try {
      const req = new Request("http://localhost/functions/v1/batch-fetch-avatars", {
        headers: { Authorization: "Bearer user-jwt-admin" },
      });
      const resp = await handleBatchFetchAvatars(req);
      assertEquals(resp.status, 200);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("N-165: usu\u00e1rio supervisor passa pela verifica\u00e7\u00e3o de admin/supervisor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_STAFF, ROTA_CONTATOS, ROTA_CONEXOES]);
    try {
      const req = new Request("http://localhost/functions/v1/batch-fetch-avatars", {
        headers: { Authorization: "Bearer user-jwt-supervisor" },
      });
      const resp = await handleBatchFetchAvatars(req);
      assertEquals(resp.status, 200);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("N-165: usu\u00e1rio sem papel de gest\u00e3o recebe 403", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_NAO_STAFF]);
    try {
      const req = new Request("http://localhost/functions/v1/batch-fetch-avatars", {
        headers: { Authorization: "Bearer user-jwt-agent" },
      });
      const resp = await handleBatchFetchAvatars(req);
      assertEquals(resp.status, 403);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("N-165: usu\u00e1rio sem autentica\u00e7\u00e3o recebe 401", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([]);
    try {
      const req = new Request("http://localhost/functions/v1/batch-fetch-avatars");
      const resp = await handleBatchFetchAvatars(req);
      assertEquals(resp.status, 401);
      assertEquals(stub.seen.length, 0, "n\u00e3o deveria tocar a rede");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("N-165: token inv\u00e1lido (getUser rejeita) recebe 401", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      { match: "/auth/v1/user", status: 401, body: { error: "invalid_token" } },
    ]);
    try {
      const req = new Request("http://localhost/functions/v1/batch-fetch-avatars", {
        headers: { Authorization: "Bearer token-invalido" },
      });
      const resp = await handleBatchFetchAvatars(req);
      assertEquals(resp.status, 401);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("N-165: Bearer de usuario comum com x-cron-secret invalido NAO escapa do papel (403)", async () => {
  await withEnv(ENV_OK, async () => {
    // Regressao: o x-cron-secret era tratado como "veio do cron" so por estar presente,
    // entao qualquer usuario logado mandava um valor qualquer e pulava a checagem de
    // admin/supervisor. O Vault e consultado (ROTA_CRON) e o valor conferido em tempo
    // constante; com valor invalido o caminho de usuario deve continuar exigindo o papel.
    const stub = withFetch([ROTA_CRON, ROTA_AUTH, ROTA_NAO_STAFF, ROTA_CONTATOS, ROTA_CONEXOES]);
    try {
      const req = new Request("http://localhost/functions/v1/batch-fetch-avatars", {
        headers: {
          Authorization: "Bearer user-jwt-agent",
          "x-cron-secret": "lixo-que-nao-e-o-segredo",
        },
      });
      const resp = await handleBatchFetchAvatars(req);
      assertEquals(
        resp.status,
        403,
        "x-cron-secret invalido nao pode isentar usuario comum do papel de gestao",
      );
    } finally {
      stub.restore();
    }
  });
});