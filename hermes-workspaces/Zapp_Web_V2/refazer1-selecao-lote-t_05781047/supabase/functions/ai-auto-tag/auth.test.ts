/**
 * Gate de autenticação do `ai-auto-tag` (SL-068).
 *
 * ANTES: os dois `Deno.test` daqui tinham `ignore: !BASE` — só rodavam quando
 * `SUPABASE_FUNCTIONS_URL` (um ambiente externo) estava definida — e o arquivo
 * nem era coletado pelo CI (o passo "Run executable Edge handler contracts" usa
 * `git ls-files 'supabase/functions/**\/*.test.ts'` e o nome era `auth_test.ts`).
 * Medido na ponta de dia/2026-10-08: `0 passed | 0 failed | 2 ignored`.
 *
 * AGORA: os dois casos rodam SEM depender de URL base do ambiente. O teste sobe
 * o handler REAL (`handleAiAutoTag`) num servidor local em 127.0.0.1 — o mesmo
 * caminho de um `supabase functions serve` — e faz um POST de verdade contra
 * ele, provando o status HTTP do gate.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleAiAutoTag } from "./index.ts";

const BODY = JSON.stringify({ messages: [] });

/** Sobe o handler real num servidor local (equivalente ao `functions serve`). */
function startLocalServe() {
  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1" },
    (req) => handleAiAutoTag(req),
  );
  const port = (server.addr as Deno.NetAddr).port;
  return { url: `http://127.0.0.1:${port}/ai-auto-tag`, shutdown: () => server.shutdown() };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
  }
  const restaurar = () => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
    }
  };
  return fn().finally(restaurar);
}

Deno.test("ai-auto-tag rejects request without Authorization", async () => {
  const serve = startLocalServe();
  try {
    const res = await fetch(serve.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: BODY,
    });
    await res.text();
    assertEquals(res.status, 401);
  } finally {
    await serve.shutdown();
  }
});

Deno.test("ai-auto-tag rejects invalid bearer token", async () => {
  // O serviço de auth também é local: um `/auth/v1/user` em 127.0.0.1 recusa o
  // token apresentado. Nada de rede externa e nada de credencial real.
  let tokenConsultado = false;
  const auth = Deno.serve({ port: 0, hostname: "127.0.0.1" }, () => {
    tokenConsultado = true;
    return new Response(JSON.stringify({ message: "invalid JWT" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  });
  const authPort = (auth.addr as Deno.NetAddr).port;
  const serve = startLocalServe();
  try {
    await withEnv(
      { SUPABASE_URL: `http://127.0.0.1:${authPort}`, SUPABASE_ANON_KEY: "anon-key-local" },
      async () => {
        const res = await fetch(serve.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer invalid.token.here",
          },
          body: BODY,
        });
        await res.text();
        assertEquals(res.status, 401);
        assertEquals(
          tokenConsultado,
          true,
          "o token apresentado precisa ser conferido antes de responder 401",
        );
      },
    );
  } finally {
    await serve.shutdown();
    await auth.shutdown();
  }
});
