// R2-API-022 (P1) — autorização do relay `send-email`.
//
// O que estes testes travam:
//   1. CORS preflight continua livre (OPTIONS responde antes de qualquer auth).
//   2. Sem identidade (sem bearer) → 401 e NENHUM fetch na rede.
//   3. Token inválido (getUser rejeita) → 401.
//   4. Usuário comum (getUser ok, is_admin_or_supervisor falso) → 403 e nenhum fetch Resend.
//   5. Conteúdo arbitrário (subject/html/text/cc/bcc/attachments) é rejeitado pelo schema → 422,
//      sem nenhum fetch Resend.
//   6. Caminho feliz: admin/supervisor + payload de convite → template do servidor + 1 fetch Resend.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/send-email/index.test.ts
import { buildInvitePayload, handleSendEmailRequest } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ── template do servidor ────────────────────────────────────────────────────
Deno.test("R2-API-022: template deriva remetente, assunto e corpo do servidor", () => {
  const p = buildInvitePayload({ email: "novo@empresa.com", name: "Ana", role: "supervisor" });
  assert(p.from === "ZAPP System <noreply@promobrindes.com.br>", "from deveria ser fixo no servidor");
  assert(JSON.stringify(p.to) === JSON.stringify(["novo@empresa.com"]), "destinatário deveria derivar do convite");
  assert(p.subject === "Convite para a plataforma ZAPP", "assunto deveria vir do template");
  assert(p.html.includes("Ana") && p.html.includes("Supervisor"), "corpo deveria derivar do template");
  assert(!("cc" in p) && !("bcc" in p) && !("attachments" in p) && !("text" in p) && !("reply_to" in p), "template não aceita cópias/anexos/texto avulso");
});

Deno.test("R2-API-022: template usa fallback para nome ausente e cargo desconhecido", () => {
  const p = buildInvitePayload({ email: "x@empresa.com", role: "admin" });
  assert(p.html.includes("colega") && p.html.includes("Administrador"), "nome ausente deveria cair em 'colega'");
});

Deno.test("R2-API-022: nome com HTML é escapado antes de entrar no corpo", () => {
  const p = buildInvitePayload({ email: "x@empresa.com", name: "<a href=x>", role: "agent" });
  assert(!p.html.includes("<a href=x>"), `nome não pode aparecer cru no html: ${p.html}`);
  assert(p.html.includes("&lt;a href=x&gt;"), `nome deveria aparecer escapado: ${p.html}`);
});

// ── handler ─────────────────────────────────────────────────────────────────
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
    const route = routes.find((r) => url.includes(r.match));
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

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "RESEND_API_KEY"] as const;

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
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-de-teste",
  RESEND_API_KEY: "re_key_de_teste",
};

const USER = "20000000-0000-0000-0000-00000000000a";
const ROTA_AUTH = { match: "/auth/v1/user", body: { id: USER, aud: "authenticated" } };
const ROTA_STAFF = { match: "/rest/v1/rpc/is_admin_or_supervisor", body: true };
const ROTA_NAO_STAFF = { match: "/rest/v1/rpc/is_admin_or_supervisor", body: false };
const ROTA_RESEND = { match: "api.resend.com/emails", body: { id: "resend-1" } };

function makeRequest(body: unknown, withAuth = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (withAuth) headers.Authorization = "Bearer token-de-teste";
  return new Request("https://stub.supabase.co/functions/v1/send-email", {
    method: "POST", headers, body: JSON.stringify(body),
  });
}

const semResend = (seen: string[]) => seen.filter((u) => u.includes("api.resend.com"));

Deno.test("R2-API-022: CORS preflight continua livre (OPTIONS sem auth)", async () => {
  const res = await handleSendEmailRequest(new Request("https://stub.supabase.co/functions/v1/send-email", {
    method: "OPTIONS",
    headers: { origin: "https://zapp-web-v2.vercel.app" },
  }));
  assert(res.status === 200, `esperado 200 no preflight, veio ${res.status}`);
});

Deno.test("R2-API-022: sem bearer devolve 401 e não toca a rede", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([]);
    try {
      const res = await handleSendEmailRequest(makeRequest({ email: "x@empresa.com" }, false));
      assert(res.status === 401, `esperado 401, veio ${res.status}`);
      assert(stub.seen.length === 0, `não deveria tocar a rede: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R2-API-022: token inválido (getUser rejeita) devolve 401 e não toca o Resend", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([{ match: "/auth/v1/user", status: 401, body: { error: "invalid" } }]);
    try {
      const res = await handleSendEmailRequest(makeRequest({ email: "x@empresa.com" }));
      assert(res.status === 401, `esperado 401, veio ${res.status}`);
      assert(semResend(stub.seen).length === 0, `não deveria chamar o Resend: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R2-API-022: usuário comum (não staff) devolve 403 e não chama o Resend", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_NAO_STAFF]);
    try {
      const res = await handleSendEmailRequest(makeRequest({ email: "x@empresa.com" }));
      assert(res.status === 403, `esperado 403, veio ${res.status}`);
      assert(semResend(stub.seen).length === 0, `não deveria chamar o Resend: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R2-API-022: conteúdo arbitrário (subject/html/cc) é rejeitado e não chama o Resend", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_STAFF]);
    try {
      // email VÁLIDO + campos fora do contrato: o 422 tem que vir da rejeição
      // dos extras pelo schema estrito, não da ausência de email.
      const res = await handleSendEmailRequest(makeRequest({
        email: "x@empresa.com",
        subject: "Phishing",
        html: "<b>conteúdo arbitrário</b>",
        cc: ["outro@empresa.com"],
      }));
      assert(res.status === 422, `esperado 422 de validação, veio ${res.status}`);
      assert(semResend(stub.seen).length === 0, `não deveria chamar o Resend: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R2-API-022: admin/supervisor com convite autorizado envia via template do servidor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_STAFF, ROTA_RESEND]);
    try {
      const res = await handleSendEmailRequest(makeRequest({ email: "novo@empresa.com", name: "Ana", role: "supervisor" }));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const payload = await res.json() as { success: boolean; id: string };
      assert(payload.success === true && payload.id === "resend-1", `resposta inesperada: ${JSON.stringify(payload)}`);
      assert(semResend(stub.seen).length === 1, `deveria haver exatamente 1 fetch ao Resend: ${stub.seen.join(",")}`);
    } finally {
      stub.restore();
    }
  });
});
