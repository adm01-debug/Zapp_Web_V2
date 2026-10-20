// Testes do handler de evolution-sync: validação de nome de instância, tetos
// numéricos e rate limit por usuário. O handler é exportado
// (`handleEvolutionSync`) e recebe as dependências por injeção — nada de rede
// nem de banco real aqui.
//
// Run: deno test --allow-env supabase/functions/evolution-sync/index.test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  handleEvolutionSync,
  clampInt,
  MAX_PAGE,
  MAX_OFFSET,
  MAX_MESSAGES_PER_CONTACT,
  type EvolutionSyncInjected,
  type EvolutionSyncUserClient,
} from "./index.ts";
import type { EvolutionDbClient } from "../_shared/evolution-types.ts";

Deno.env.set("EVOLUTION_API_URL", "https://evo.example.com");
Deno.env.set("EVOLUTION_API_KEY", "test-key");

function fakeUserClient(isAdmin = true): EvolutionSyncUserClient {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }) },
    rpc: () => Promise.resolve({ data: isAdmin }),
  };
}

function makeRequest(body: unknown, withAuth = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (withAuth) headers.Authorization = "Bearer test-token";
  return new Request("https://x.supabase.co/functions/v1/evolution-sync", {
    method: "POST", headers, body: JSON.stringify(body),
  });
}

function deps(overrides: Partial<EvolutionSyncInjected> = {}): EvolutionSyncInjected {
  return {
    makeUserClient: () => fakeUserClient(),
    supabase: {} as unknown as EvolutionDbClient,
    enforceRateLimit: () => Promise.resolve({ allowed: true }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Nome de instância — rejeitado antes de qualquer acesso a banco/rede.
// ---------------------------------------------------------------------------

Deno.test("instanceName inválido (path traversal) devolve 400", async () => {
  const response = await handleEvolutionSync(
    makeRequest({ action: "sync-contacts", instanceName: "bad/../name" }),
    deps(),
  );
  const body = await response.json();
  assertEquals(response.status, 400);
  assertStringIncludes(body.error, "Nome de instância inválido");
});

Deno.test("instanceName ausente devolve 400", async () => {
  const response = await handleEvolutionSync(makeRequest({ action: "sync-contacts" }), deps());
  const body = await response.json();
  assertEquals(response.status, 400);
  assertStringIncludes(body.error, "Nome de instância inválido");
});

Deno.test("instanceName acima de 40 caracteres devolve 400", async () => {
  const longo = "a".repeat(41);
  const response = await handleEvolutionSync(
    makeRequest({ action: "sync-contacts", instanceName: longo }),
    deps(),
  );
  assertEquals(response.status, 400);
});

// ---------------------------------------------------------------------------
// 2. Rate limit por usuário (cortado ANTES de a ação rodar).
// ---------------------------------------------------------------------------

Deno.test("rate limit estourado devolve 429", async () => {
  const response = await handleEvolutionSync(
    makeRequest({ action: "sync-contacts", instanceName: "conexao_1" }),
    deps({ enforceRateLimit: () => Promise.resolve({ allowed: false }) }),
  );
  const body = await response.json();
  assertEquals(response.status, 429);
  assertStringIncludes(body.error, "Rate limit");
});

Deno.test("rate limit usa a chave por usuário", async () => {
  const keys: string[] = [];
  await handleEvolutionSync(
    makeRequest({ action: "sync-contacts", instanceName: "conexao_1" }),
    deps({
      enforceRateLimit: (key) => { keys.push(key); return Promise.resolve({ allowed: false }); },
    }),
  );
  assertEquals(keys, ["evolution-sync:user-1"]);
});

// ---------------------------------------------------------------------------
// 3. Auth
// ---------------------------------------------------------------------------

Deno.test("sem Authorization devolve 401", async () => {
  const response = await handleEvolutionSync(
    makeRequest({ action: "sync-contacts", instanceName: "conexao_1" }, false),
    deps(),
  );
  assertEquals(response.status, 401);
});

Deno.test("não-admin devolve 403", async () => {
  const response = await handleEvolutionSync(
    makeRequest({ action: "sync-contacts", instanceName: "conexao_1" }),
    deps({ makeUserClient: () => fakeUserClient(false) }),
  );
  assertEquals(response.status, 403);
});

// ---------------------------------------------------------------------------
// 4. Tetos numéricos — clampInt é a função que o handler usa para page/offset/
//    messagesPerContact.
// ---------------------------------------------------------------------------

Deno.test("clampInt limita page/offset/messagesPerContact aos tetos", () => {
  assertEquals(clampInt(999_999, 0, MAX_PAGE, 1), MAX_PAGE);
  assertEquals(clampInt(-7, 0, MAX_PAGE, 1), 0);
  assertEquals(clampInt(1.9, 0, MAX_PAGE, 1), 1);
  assertEquals(clampInt("nope", 0, MAX_PAGE, 1), 1);

  assertEquals(clampInt(999_999, 1, MAX_OFFSET, 100), MAX_OFFSET);
  assertEquals(clampInt(0, 1, MAX_OFFSET, 100), 1);

  assertEquals(clampInt(999_999, 1, MAX_MESSAGES_PER_CONTACT, 200), MAX_MESSAGES_PER_CONTACT);
});
