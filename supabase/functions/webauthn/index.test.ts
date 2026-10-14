import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleWebAuthn } from "./index.ts";

// ---------------------------------------------------------------------------
// webauthn · authentication-options (ação PÚBLICA, roda antes do login)
// 1) e-mail INEXISTENTE e conta SEM passkey devolvem o MESMO corpo (o `challenge`
//    é aleatório por chamada, então comparamos o resto): nada de oráculo de
//    enumeração de conta.
// 2) a conta pode estar em qualquer página — listUsers() sem argumentos só olhava
//    a 1ª página (≤50), então a paginação é provada com a conta na 2ª página.
// 3) rate limit por IP antes de qualquer consulta.
// Tudo por injeção: sem rede, sem banco, sem segredo real.
// ---------------------------------------------------------------------------

type Cred = { credential_id: string; transports: string[] | null };
type User = { id: string; email: string | null };

function adminMock(opts: {
  users: User[];
  credentials: Record<string, Cred[]>;
  inserted: unknown[];
}) {
  return {
    auth: {
      admin: {
        listUsers({ page, perPage }: { page: number; perPage: number }) {
          const start = (page - 1) * perPage;
          return Promise.resolve({
            data: { users: opts.users.slice(start, start + perPage) },
            error: null,
          });
        },
      },
    },
    from(table: string) {
      let eqValue = "";
      const builder = {
        select() {
          return builder;
        },
        eq(_col: string, value: string) {
          eqValue = value;
          return builder;
        },
        insert(row: unknown) {
          opts.inserted.push({ table, row });
          return builder;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          const data = table === "passkey_credentials"
            ? (opts.credentials[eqValue] ?? [])
            : null;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

// Limiter em memória com a MESMA semântica do guard (chave → contador/teto).
function makeLimiter(max: number) {
  const hits = new Map<string, number>();
  return (key: string) => {
    const n = (hits.get(key) ?? 0) + 1;
    hits.set(key, n);
    return Promise.resolve({ allowed: n <= max, remaining: Math.max(0, max - n), resetIn: 0 });
  };
}

function deps(mock: unknown, limiter: unknown) {
  return {
    supabaseAdmin: mock,
    supabaseUrl: "https://test.local",
    anonKey: "anon-key-test",
    enforceRateLimit: limiter,
  } as Parameters<typeof handleWebAuthn>[1];
}

function req(ip: string, body: unknown): Request {
  return new Request("https://test.local/webauthn", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

Deno.test("webauthn auth-options (defeito): e-mail inexistente e conta SEM passkey → corpo idêntico, sem allowCredentials", async () => {
  const mock = adminMock({
    users: [{ id: "u-sem-passkey", email: "sem.passkey@zapp.test" }],
    credentials: {},
    inserted: [],
  });
  const d = deps(mock, makeLimiter(100));

  const resMissing = await handleWebAuthn(
    req("10.0.0.1", { action: "authentication-options", userEmail: "nao.existe@zapp.test" }),
    d,
  );
  const resNoPass = await handleWebAuthn(
    // e-mail em CAIXA ALTA: a busca normaliza, então acha a conta
    req("10.0.0.2", { action: "authentication-options", userEmail: "SEM.PASSKEY@ZAPP.TEST" }),
    d,
  );

  assertEquals(resMissing.status, 200);
  assertEquals(resNoPass.status, 200);

  const a = await resMissing.json();
  const b = await resNoPass.json();
  delete a.options.challenge; // aleatório por chamada
  delete b.options.challenge;

  assertEquals(a, b, "corpo deve ser idêntico para e-mail inexistente e conta sem passkey");
  assert(!("allowCredentials" in a.options), "sem credencial, allowCredentials não deve aparecer");
});

Deno.test("webauthn auth-options: conta na 2ª página é encontrada (paginação) e devolve allowCredentials", async () => {
  const users: User[] = Array.from({ length: 200 }, (_, i) => ({
    id: `u${i}`,
    email: `u${i}@zapp.test`,
  }));
  users.push({ id: "u-page2", email: "pagina2@zapp.test" });

  const mock = adminMock({
    users,
    credentials: { "u-page2": [{ credential_id: "cred-abc", transports: ["internal"] }] },
    inserted: [],
  });

  const res = await handleWebAuthn(
    req("10.0.0.3", { action: "authentication-options", userEmail: "pagina2@zapp.test" }),
    deps(mock, makeLimiter(100)),
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.options.allowCredentials, [
    { id: "cred-abc", type: "public-key", transports: ["internal"] },
  ]);
});

Deno.test("webauthn auth-options: rate limit POR IP — 4ª chamada do mesmo IP → 429, IP novo segue 200", async () => {
  const mock = adminMock({ users: [], credentials: {}, inserted: [] });
  const d = deps(mock, makeLimiter(3));

  for (let i = 0; i < 3; i++) {
    const ok = await handleWebAuthn(req("10.0.0.9", { action: "authentication-options" }), d);
    assertEquals(ok.status, 200, `chamada ${i + 1} dentro do teto deveria passar`);
  }

  const blocked = await handleWebAuthn(req("10.0.0.9", { action: "authentication-options" }), d);
  assertEquals(blocked.status, 429, "acima do teto o IP recebe 429");

  const outro = await handleWebAuthn(req("10.0.0.10", { action: "authentication-options" }), d);
  assertEquals(outro.status, 200, "o teto é por IP, não global");
});
