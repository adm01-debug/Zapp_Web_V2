/**
 * Prévia de link — a imagem NÃO vai crua para o `<img>` do atendente.
 *
 * Antes: `index.ts` devolvia o `og:image` só passado por `absolutize` (resolve
 * contra a URL final da página, sem olhar esquema nem host), e o navegador do
 * atendente conectava direto no host escolhido pelo cliente (vazamento de IP).
 *
 * Agora: a imagem é buscada pelo proxy de egresso (IP fixado, redirect
 * revalidado) e volta como `data:` URL. Aceite do cartão:
 *   1. imagem de host interno/`http:` -> recusada (nada de egress de imagem);
 *   2. imagem acima do teto de 512 KB -> cortada (não é embutida);
 *   3. `requireAuth` e rate limit preservados (401/429 sem tocar o egress).
 *
 * O handler REAL roda com o `fetch` global stubado por trecho de URL:
 *   `/auth/v1/user`                     (requireAuth)
 *   `/rest/v1/rpc/consume_rate_limit`   (enforceRateLimit)
 *   o endpoint do proxy de egresso      (PREVIEW_EGRESS_PROXY_URL)
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1
 */
import { handleFetchLinkPreview } from "../index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const EGRESS_URL = "https://egress.proxy.test/preview";
const TOKEN_USUARIO = "token-de-teste";
const UID = "10000000-0000-0000-0000-0000000000aa";
// 1x1 PNG — bytes reais para provar o `data:image/png;base64,...`.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
// base64 de ~600 KB: o helper de egresso recusa acima do teto de 512 KB.
const GRANDE_BASE64 = "A".repeat(800000);

type Route = { match: string; make: (init?: RequestInit) => Response };
type Call = { url: string; init?: RequestInit };

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    calls.push({ url, init });
    // `requireAuth` consulta a política de rede antes de liberar o handler.
    if (url.includes("/rest/v1/rpc/resolve_network_policy")) {
      return Promise.resolve(jsonResp([
        { allowed: true, reason: null, rate_limit_max_requests: 30, rate_limit_window_seconds: 60 },
      ]));
    }
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return Promise.resolve(new Response("nao stubado", { status: 599 }));
    return Promise.resolve(route.make(init));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PREVIEW_EGRESS_PROXY_URL",
  "PREVIEW_EGRESS_SHARED_SECRET",
] as const;

function withEnv(fn: () => Promise<void>) {
  const values: Record<string, string> = {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_ANON_KEY: "anon-key-de-teste",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-de-teste",
    PREVIEW_EGRESS_PROXY_URL: EGRESS_URL,
    PREVIEW_EGRESS_SHARED_SECRET: "segredo-de-teste-com-mais-de-32-caracteres",
  };
  const saved = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  for (const key of ENV_KEYS) Deno.env.set(key, values[key]);
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  });
}

/** Página -> `og:image` que ela declara. Uma URL de página por caso (cache). */
const PAGINAS: Record<string, string> = {
  "https://exemplo.test/p-http": "http://img.test/x.png",
  "https://exemplo.test/p-loopback": "https://127.0.0.1/x.png",
  "https://exemplo.test/p-localhost": "https://localhost/x.png",
  "https://exemplo.test/p-metadata": "https://169.254.169.254/x.png",
  "https://exemplo.test/p-grande": "https://img.test/grande.png",
  "https://exemplo.test/p-ok": "https://img.test/ok.png",
  "https://exemplo.test/p-ok-auth": "https://img.test/ok.png",
  "https://exemplo.test/p-ok-limit": "https://img.test/ok.png",
};

function htmlComImagem(ogImage: string): string {
  return `<html><head><title>Pagina</title>` +
    `<meta property="og:image" content="${ogImage}"></head><body>oi</body></html>`;
}

const ROTA_EGRESS: Route = {
  match: "egress.proxy.test",
  make: (init) => {
    const pedida = JSON.parse(String(init?.body ?? "{}")).url as string;
    if (pedida === "https://img.test/ok.png") {
      return jsonResp({
        url: pedida,
        status: 200,
        content_type: "image/png",
        body_base64: PNG_BASE64,
      });
    }
    if (pedida === "https://img.test/grande.png") {
      return jsonResp({
        url: pedida,
        status: 200,
        content_type: "image/png",
        body_base64: GRANDE_BASE64,
      });
    }
    return jsonResp({
      url: pedida,
      status: 200,
      content_type: "text/html",
      body_base64: btoa(htmlComImagem(PAGINAS[pedida] ?? "")),
    });
  },
};

function rotaAuth(userId: string): Route {
  return { match: "/auth/v1/user", make: () => jsonResp({ id: userId, aud: "authenticated" }) };
}
function rotaRate(allowed: boolean): Route {
  return {
    match: "/rest/v1/rpc/consume_rate_limit",
    make: () => jsonResp([{ allowed, remaining: allowed ? 19 : 0 }]),
  };
}

function makeRequest(body: unknown, token: string | null): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("https://stub.supabase.co/functions/v1/fetch-link-preview", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Corpo do egresso casa uma URL de imagem (`img.test`), não a página. */
const chamadasImagem = (calls: Call[]) =>
  calls.filter((c) =>
    c.url.includes("egress.proxy.test") &&
    String(c.init?.body ?? "").includes("img.test")
  ).length;
const chamadasEgress = (calls: Call[]) =>
  calls.filter((c) => c.url.includes("egress.proxy.test")).length;

async function preview(
  url: string,
  opts: { token?: string | null; rateAllowed?: boolean } = {},
) {
  const stub = withFetch([
    rotaAuth(UID),
    rotaRate(opts.rateAllowed ?? true),
    ROTA_EGRESS,
  ]);
  try {
    const res = await handleFetchLinkPreview(
      makeRequest({ url }, opts.token === undefined ? TOKEN_USUARIO : opts.token),
    );
    const body = await res.json().catch(() => ({})) as {
      preview?: { url?: string; title?: string; image?: string };
    };
    return { status: res.status, body, calls: stub.calls };
  } finally {
    stub.restore();
  }
}

Deno.test("previa: imagem http: ou host interno e recusada sem tocar o egress", async () => {
  await withEnv(async () => {
    for (
      const pagina of [
        "https://exemplo.test/p-http",
        "https://exemplo.test/p-loopback",
        "https://exemplo.test/p-localhost",
        "https://exemplo.test/p-metadata",
      ]
    ) {
      const { body, calls } = await preview(pagina);
      assert(
        body.preview?.image === undefined,
        `imagem ${PAGINAS[pagina]} deveria ser recusada (veio ${body.preview?.image})`,
      );
      assert(
        chamadasImagem(calls) === 0,
        `imagem de ${PAGINAS[pagina]} nao pode ser buscada (egress de imagem tocado)`,
      );
    }
  });
});

Deno.test("previa: imagem https publica volta embutida como data URL", async () => {
  await withEnv(async () => {
    const { body, calls } = await preview("https://exemplo.test/p-ok");
    assert(
      body.preview?.image === `data:image/png;base64,${PNG_BASE64}`,
      `imagem deveria vir embutida como data URL (veio ${body.preview?.image})`,
    );
    assert(
      !body.preview?.image?.includes("img.test"),
      "o host do og:image nao pode aparecer na previa (vazaria o IP do atendente)",
    );
    assert(chamadasImagem(calls) === 1, "a imagem e buscada pelo proxy uma vez");
  });
});

Deno.test("previa: imagem acima do teto de 512 KB e cortada (nao embutida)", async () => {
  await withEnv(async () => {
    const { body, calls } = await preview("https://exemplo.test/p-grande");
    assert(
      body.preview?.image === undefined,
      "imagem acima de 512 KB nao pode ser embutida",
    );
    assert(chamadasImagem(calls) === 1, "a busca aconteceu; o teto cortou o corpo");
  });
});

Deno.test("previa: sem usuario -> 401 e acima do limite -> 429, sem egress de imagem", async () => {
  await withEnv(async () => {
    const semAuth = await preview("https://exemplo.test/p-ok-auth", { token: null });
    assert(semAuth.status === 401, `esperado 401 sem autenticacao, veio ${semAuth.status}`);
    assert(chamadasEgress(semAuth.calls) === 0, "sem autenticacao nao pode haver egress");

    const limitado = await preview("https://exemplo.test/p-ok-limit", { rateAllowed: false });
    assert(limitado.status === 429, `esperado 429 acima do limite, veio ${limitado.status}`);
    assert(
      chamadasEgress(limitado.calls) === 0,
      "acima do limite o egress (pagina ou imagem) nao pode ser tocado",
    );
  });
});
