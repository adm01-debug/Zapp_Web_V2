// SEC-EDGE-FUNCTIONS-04 (P2) — provas executáveis do handler REAL de `webauthn`.
//
// Offline: o client service_role (admin) e o limitador são INJETADOS, então
// nenhuma chamada toca banco, GoTrue ou rede. O que se prova:
//
//   1. o e-mail inexistente e a conta SEM passkey respondem idêntico (mesmo
//      status, mesmo corpo, sem `allowCredentials` no JSON) — o handler não é
//      oráculo de existência de conta;
//   2. a conta é encontrada mesmo fora da PRIMEIRA página de `listUsers` (a
//      busca é paginada; `listUsers()` sem paginação só enxergava 50 contas) e a
//      varredura para no total, sem pedir página depois da última;
//   3. a ação pública responde 429 depois do limite por IP, antes de qualquer
//      efeito (nenhuma consulta, nenhum desafio gravado);
//   4. falha na consulta responde igual a "não existe" (falha fechada).
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/webauthn/index.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleWebAuthn, findUserByEmail, LIST_USERS_PAGE_SIZE, type UserLookup } from "./index.ts";

const URL_ = "https://example.supabase.co/functions/v1/webauthn";
const IP = "9.9.9.9";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": IP, ...headers },
    body: JSON.stringify(body),
  });
}

type Account = { id: string; email: string };
type ListParams = { page?: number; perPage?: number };

/** Contas sintéticas com id derivado da posição (a mesma posição que o
 *  diretório paginado do GoTrue devolveria). Nunca dado real. */
function accounts(emails: string[]): Account[] {
  return emails.map((email, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    email,
  }));
}

/**
 * Falso do client service_role. `listUsers` imita a semântica REAL do admin do
 * GoTrue: sem parâmetro, página 1 com 50 contas (era isso que o defeito
 * enxergava); com `{ page, perPage }`, a fatia pedida mais `nextPage`/`lastPage`/
 * `total`. Nada de mock de texto: o teste chama o handler e o handler chama isto.
 */
function fakeAdmin(opts: {
  accounts: Account[];
  /** Rota de erro do GoTrue: `{ message }` faz a consulta falhar. */
  listError?: unknown;
  /** Passkeys por user_id. */
  passkeys?: Record<string, Array<{ credential_id: string; transports: string[] | null }>>;
}) {
  const listCalls: ListParams[] = [];
  const passkeyReads: string[] = [];
  const challengeInserts: Array<{ user_id: string | null; challenge: string; type: string }> = [];
  const passkeys = opts.passkeys ?? {};

  function listUsers(params: ListParams = {}) {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 50; // padrão do admin do GoTrue
    listCalls.push({ page, perPage });
    if (opts.listError) return Promise.resolve({ data: null, error: opts.listError });
    const start = (page - 1) * perPage;
    const users = opts.accounts.slice(start, start + perPage);
    const total = opts.accounts.length;
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    return Promise.resolve({
      data: { users, aud: "authenticated", nextPage: page < lastPage ? page + 1 : null, lastPage, total },
      error: null,
    });
  }

  function from(table: string) {
    let eqUserId: string | null = null;
    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q,
      eq: (column: string, value: unknown) => {
        if (column === "user_id") eqUserId = String(value);
        return q;
      },
      order: () => q,
      limit: () => q,
      single: () => Promise.resolve({ data: null, error: null }),
      insert: (row: { user_id?: string | null; challenge?: unknown; type?: unknown }) => {
        challengeInserts.push({
          user_id: row?.user_id ?? null,
          challenge: String(row?.challenge ?? ""),
          type: String(row?.type ?? ""),
        });
        return Promise.resolve({ data: null, error: null });
      },
      update: () => q,
      delete: () => q,
      then: (onFulfilled: (v: unknown) => unknown) => {
        if (table === "passkey_credentials" && eqUserId !== null) passkeyReads.push(eqUserId);
        const value = table === "passkey_credentials"
          ? { data: eqUserId !== null ? (passkeys[eqUserId] ?? []) : [], error: null }
          : { data: null, error: null };
        return Promise.resolve(value).then(onFulfilled);
      },
    };
    return q;
  }

  return {
    listCalls,
    passkeyReads,
    challengeInserts,
    auth: { admin: { listUsers } },
    rpc: () => Promise.resolve({ data: null, error: null }),
    from,
  };
}

/** Falso do limitador: registra (key, max, window) e devolve `allowed`. */
function fakeRateLimit(allowed = true) {
  const calls: Array<{ key: string; max: number; windowMs: number }> = [];
  return {
    calls,
    enforceRateLimit(key: string, max: number, windowMs: number) {
      calls.push({ key, max, windowMs });
      return Promise.resolve({ allowed });
    },
  };
}

/** Tira o `challenge` (aleatório a cada chamada) para comparar o resto. */
function semDesafio(texto: string): string {
  return texto.replace(/"challenge":"[^"]*"/, '"challenge":"<desafio>"');
}

function optionsDoCorpo(texto: string): Record<string, unknown> {
  return (JSON.parse(texto) as { options: Record<string, unknown> }).options;
}

async function authenticationOptions(
  admin: ReturnType<typeof fakeAdmin>,
  rl: ReturnType<typeof fakeRateLimit>,
  userEmail: string,
): Promise<{ status: number; texto: string }> {
  const res = await handleWebAuthn(post({ action: "authentication-options", userEmail }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
  });
  return { status: res.status, texto: await res.text() };
}

// ─── (b) busca paginada: a conta fora da primeira página é encontrada ─────────

Deno.test("conta com passkey fora da primeira página é encontrada (busca paginada)", async () => {
  // Diretório maior que uma página, com a conta alvo bem depois do corte da
  // primeira página do padrão do GoTrue (50).
  const emails = Array.from({ length: 250 }, (_, i) => `pessoa${i + 1}@exemplo.test`);
  emails[230] = "alvo@exemplo.test";
  const contas = accounts(emails);
  const alvo = contas[230];
  const admin = fakeAdmin({
    accounts: contas,
    passkeys: { [alvo.id]: [{ credential_id: "cred-alvo", transports: ["internal"] }] },
  });
  const rl = fakeRateLimit();

  const { status, texto } = await authenticationOptions(admin, rl, "ALVO@Exemplo.Test");

  assertEquals(status, 200);
  const options = optionsDoCorpo(texto);
  assertEquals(options.allowCredentials, [{ id: "cred-alvo", type: "public-key", transports: ["internal"] }]);
  // Passou da primeira página e não pediu duas vezes a mesma página.
  assertEquals(admin.listCalls[0], { page: 1, perPage: LIST_USERS_PAGE_SIZE });
  assertEquals(admin.listCalls.some((c) => c.page === 2), true);
  assertEquals(new Set(admin.listCalls.map((c) => c.page)).size, admin.listCalls.length);
  // O desafio ficou amarrado à conta encontrada (é o que `verify-authentication` lê).
  assertEquals(admin.challengeInserts.length, 1);
  assertEquals(admin.challengeInserts[0].user_id, alvo.id);
  assertEquals(admin.challengeInserts[0].type, "authentication");
});

Deno.test("paginação: total múltiplo exato do tamanho da página não gera página extra", async () => {
  // Duas páginas cheias exatas: quem chega ao fim não deve pedir a terceira.
  const cheias = accounts(Array.from({ length: LIST_USERS_PAGE_SIZE * 2 }, (_, i) => `pessoa${i + 1}@exemplo.test`));

  const semAlvo = fakeAdmin({ accounts: cheias });
  const rlA = fakeRateLimit();
  const busca = await authenticationOptions(semAlvo, rlA, "nao-existe@exemplo.test");
  assertEquals(busca.status, 200);
  assertEquals(semAlvo.listCalls.map((c) => c.page), [1, 2]);

  // Uma página cheia exata, também sem alvo: uma única consulta.
  const umaPagina = fakeAdmin({ accounts: accounts(Array.from({ length: LIST_USERS_PAGE_SIZE }, (_, i) => `pessoa${i + 1}@exemplo.test`)) });
  const rlB = fakeRateLimit();
  await authenticationOptions(umaPagina, rlB, "nao-existe@exemplo.test");
  assertEquals(umaPagina.listCalls.map((c) => c.page), [1]);

  // Alvo na última posição da última página cheia: encontrado, sem página extra.
  const ultimo = cheias[cheias.length - 1];
  const comAlvo = fakeAdmin({
    accounts: cheias,
    passkeys: { [ultimo.id]: [{ credential_id: "cred-ultimo", transports: null }] },
  });
  const rlC = fakeRateLimit();
  const achado = await authenticationOptions(comAlvo, rlC, ultimo.email);
  assertEquals(achado.status, 200);
  assertEquals(optionsDoCorpo(achado.texto).allowCredentials, [
    { id: "cred-ultimo", type: "public-key", transports: ["internal", "hybrid"] },
  ]);
  assertEquals(comAlvo.listCalls.map((c) => c.page), [1, 2]);
});

// ─── (a) e-mail inexistente e conta sem passkey respondem IGUAL ──────────────

Deno.test("e-mail inexistente e conta sem passkey respondem idêntico", async () => {
  const semPasskey = fakeAdmin({ accounts: accounts(["existe@exemplo.test"]) });
  const rlSemPasskey = fakeRateLimit();
  const comConta = await authenticationOptions(semPasskey, rlSemPasskey, "existe@exemplo.test");
  // A conta FOI encontrada (o diretório tem 1 conta): a consulta de credenciais
  // aconteceu e voltou vazia — é o caso "conta existe e não tem passkey".
  assertEquals(semPasskey.passkeyReads, [accounts(["existe@exemplo.test"])[0].id]);

  const inexistente = fakeAdmin({ accounts: accounts(["outra@exemplo.test"]) });
  const rlInexistente = fakeRateLimit();
  const semConta = await authenticationOptions(inexistente, rlInexistente, "nao-existe@exemplo.test");
  assertEquals(inexistente.passkeyReads, []);

  // Mesmo status, mesmo corpo (o desafio é aleatório e sai da comparação).
  assertEquals(comConta.status, semConta.status);
  assertEquals(semDesafio(semConta.texto), semDesafio(comConta.texto));
  // Nem o vazio de `allowCredentials` nem qualquer outra pista vão no corpo.
  assertEquals("allowCredentials" in optionsDoCorpo(semConta.texto), false);
  assertEquals("allowCredentials" in optionsDoCorpo(comConta.texto), false);
});

Deno.test("falha ao listar contas responde igual a 'não existe' (falha fechada)", async () => {
  const quebrado = fakeAdmin({ accounts: accounts(["existe@exemplo.test"]), listError: { message: "connection reset" } });
  const rlQuebrado = fakeRateLimit();
  const comFalha = await authenticationOptions(quebrado, rlQuebrado, "existe@exemplo.test");

  const vazio = fakeAdmin({ accounts: accounts([]) });
  const rlVazio = fakeRateLimit();
  const semConta = await authenticationOptions(vazio, rlVazio, "existe@exemplo.test");

  // Nada de 5xx (que denunciaria a conta) e corpo igual ao de "não existe".
  assertEquals(comFalha.status, 200);
  assertEquals(semDesafio(comFalha.texto), semDesafio(semConta.texto));
  assertEquals("allowCredentials" in optionsDoCorpo(comFalha.texto), false);
  // Sem conta resolvida, o desafio não é amarrado a ninguém.
  assertEquals(quebrado.challengeInserts[0].user_id, null);
});

// ─── (c) limite por IP ───────────────────────────────────────────────────────

Deno.test("ação pública responde 429 depois do limite por IP, antes de qualquer efeito", async () => {
  const admin = fakeAdmin({ accounts: accounts(["alvo@exemplo.test"]) });
  const rl = fakeRateLimit(false);

  const res = await handleWebAuthn(post({ action: "authentication-options", userEmail: "alvo@exemplo.test" }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
  });

  assertEquals(res.status, 429);
  assertEquals((await res.json()).error, "Rate limit exceeded");
  // A chave é por IP (o IP vem do cabeçalho, não do corpo).
  assertEquals(rl.calls.length, 1);
  assertEquals(rl.calls[0].key, `webauthn:${IP}`);
  assertEquals(rl.calls[0].max > 0, true);
  assertEquals(rl.calls[0].windowMs > 0, true);
  // Recusa ANTES de ler o corpo e de qualquer efeito: nenhuma listagem, nenhuma
  // leitura de passkey, nenhum desafio gravado.
  assertEquals(admin.listCalls.length, 0);
  assertEquals(admin.passkeyReads.length, 0);
  assertEquals(admin.challengeInserts.length, 0);
});

Deno.test("dentro do limite, a mesma chamada segue para o efeito normal", async () => {
  const admin = fakeAdmin({ accounts: accounts(["alvo@exemplo.test"]) });
  const rl = fakeRateLimit(true);

  const res = await handleWebAuthn(post({ action: "authentication-options", userEmail: "alvo@exemplo.test" }), {
    admin,
    enforceRateLimit: rl.enforceRateLimit,
  });

  assertEquals(res.status, 200);
  assertEquals(rl.calls.length, 1);
  assertEquals(admin.challengeInserts.length, 1);
});

// ─── Contrato de retorno da busca ────────────────────────────────────────────

Deno.test("findUserByEmail distingue encontrado, inexistente e indisponível", async () => {
  const contas = accounts(["um@exemplo.test", "dois@exemplo.test"]);

  const adminOk = fakeAdmin({ accounts: contas });
  const encontrado: UserLookup = await findUserByEmail(adminOk, "dois@exemplo.test");
  assertEquals(encontrado, { status: "found", userId: contas[1].id });
  assertEquals(await findUserByEmail(adminOk, "tres@exemplo.test"), { status: "not_found" });

  const adminQuebrado = fakeAdmin({ accounts: contas, listError: { message: "connection reset" } });
  assertEquals(await findUserByEmail(adminQuebrado, "dois@exemplo.test"), { status: "unavailable" });
});
