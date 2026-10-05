// R2-AUTH-002 / item 71 — testes OFFLINE do handler webauthn.
//
// O client service_role é INJETADO: um fake do query-builder PostgREST opera
// sobre tabelas em memória e REGISTRA cada operação encadeada, então nenhuma
// chamada toca banco nem rede e ainda é possível provar COMO o handler
// consultou (eq por valor do challenge, delete por id, sem order/limit na
// busca do challenge). O que se prova:
//
//   * authentication-options pagina admin.listUsers além da 1ª página até
//     achar o e-mail (conta na página 2 devolve suas credenciais) e deixa
//     allowCredentials indefinido quando o e-mail não existe em página alguma;
//   * verify-authentication localiza a linha EXATA de webauthn_challenges pelo
//     challenge presente no clientDataJSON assinado — login discoverable
//     (challenge anônimo) autentica, um challenge antigo do próprio usuário
//     NÃO encobre o anônimo e só a linha usada é consumida por id;
//   * challenge ausente → 400 'Challenge not found or expired';
//   * challenge expirado → 400 'Challenge expired'.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/webauthn/

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleWebAuthn,
  type PostgrestBuilderLike,
  type QueryOutcome,
  type SupabaseAdminLike,
  type WebAuthnDeps,
} from "./index.ts";
import { buildAssertion, ORIGIN } from "./_test-utils.ts";

const FN_URL = "https://example.supabase.co/functions/v1/webauthn";

type Row = Record<string, unknown>;

interface RecordedCall {
  table: string;
  ops: string[];
}

// ─── Fake do query-builder PostgREST ────────────────────────────────────────
// Mantém as linhas da tabela por referência (insert/update/delete mutam o
// array vivo em `db`) e aplica os filtros na resolução, então eq/is/or/order/
// limit realmente filtram — um handler que consultasse por recência em vez de
// por valor pegaria a linha errada e o teste falharia.

class FakeBuilder implements PostgrestBuilderLike {
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: unknown = null;
  private filters: Array<(row: Row) => boolean> = [];
  private orderSpec: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;

  constructor(private rows: Row[], private ops: string[]) {}

  private rec(op: string) {
    this.ops.push(op);
  }

  select(columns = "*") {
    this.mode = "select";
    this.rec(`select(${columns})`);
    return this;
  }
  insert(values: unknown) {
    this.mode = "insert";
    this.payload = values;
    this.rec("insert()");
    return this;
  }
  update(values: unknown) {
    this.mode = "update";
    this.payload = values;
    this.rec("update()");
    return this;
  }
  delete() {
    this.mode = "delete";
    this.rec("delete()");
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    this.rec(`eq(${column},${String(value)})`);
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    this.rec(`is(${column},${String(value)})`);
    return this;
  }
  or(filters: string) {
    const clauses = filters.split(",").map((clause) => {
      const m = clause.match(/^([^.]+)\.(eq|is)\.(.+)$/);
      if (!m) throw new Error(`or() não suportado no fake: ${clause}`);
      const value = m[3] === "null" ? null : m[3];
      return (r: Row) => r[m[1]] === value;
    });
    this.filters.push((r) => clauses.some((c) => c(r)));
    this.rec(`or(${filters})`);
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { col: column, asc: opts?.ascending !== false };
    this.rec(`order(${column})`);
    return this;
  }
  limit(count: number) {
    this.limitN = count;
    this.rec(`limit(${count})`);
    return this;
  }
  single() {
    this.rec("single()");
    return Promise.resolve(this.finishSingle(false));
  }
  maybeSingle() {
    this.rec("maybeSingle()");
    return Promise.resolve(this.finishSingle(true));
  }

  then<TResult1 = QueryOutcome, TResult2 = never>(
    onfulfilled?: ((value: QueryOutcome) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.finish()).then(onfulfilled, onrejected);
  }

  private matching(): Row[] {
    let rows = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.orderSpec) {
      const { col, asc } = this.orderSpec;
      rows = [...rows].sort((a, b) =>
        (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1)
      );
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  private finish(): QueryOutcome {
    switch (this.mode) {
      case "select":
        return { data: this.matching(), error: null };
      case "insert": {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload];
        for (const item of items) this.rows.push({ ...(item as Row) });
        return { data: null, error: null };
      }
      case "update": {
        for (const row of this.matching()) Object.assign(row, this.payload);
        return { data: null, error: null };
      }
      case "delete": {
        const keep = this.rows.filter((r) => !this.filters.every((f) => f(r)));
        this.rows.length = 0;
        this.rows.push(...keep);
        return { data: null, error: null };
      }
    }
  }

  private finishSingle(maybe: boolean): QueryOutcome {
    const rows = this.matching();
    if (rows.length === 0) {
      return maybe
        ? { data: null, error: null }
        : { data: null, error: { code: "PGRST116", message: "no rows returned" } };
    }
    return { data: rows[0], error: null };
  }
}

function fakeAdmin(opts: {
  db?: Record<string, Row[]>;
  listUsersPages?: Record<number, Array<{ id: string; email: string }>>;
  usersById?: Record<string, { id: string; email: string }>;
}) {
  const db = new Map<string, Row[]>();
  for (const [table, rows] of Object.entries(opts.db ?? {})) db.set(table, rows);
  const calls: RecordedCall[] = [];
  const listUsersCalls: Array<{ page: number; perPage: number }> = [];

  const admin: SupabaseAdminLike = {
    from(table: string) {
      if (!db.has(table)) db.set(table, []);
      const call: RecordedCall = { table, ops: [] };
      calls.push(call);
      return new FakeBuilder(db.get(table)!, call.ops);
    },
    rpc(fn: string) {
      calls.push({ table: `rpc:${fn}`, ops: [] });
      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      admin: {
        listUsers({ page, perPage }: { page: number; perPage: number }) {
          listUsersCalls.push({ page, perPage });
          const users = opts.listUsersPages?.[page] ?? [];
          return Promise.resolve({ data: { users }, error: null });
        },
        getUserById(id: string) {
          return Promise.resolve({ data: { user: opts.usersById?.[id] ?? null }, error: null });
        },
      },
    },
  };

  return { admin, calls, listUsersCalls, db };
}

// ─── Helpers de request/deps ────────────────────────────────────────────────

function post(body: unknown): Request {
  return new Request(FN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify(body),
  });
}

function deps(admin: SupabaseAdminLike): WebAuthnDeps {
  return { supabaseAdmin: admin, supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "anon-key" };
}

function assertionBody(a: { clientDataJSON: string; authenticatorData: string; signature: string }, credentialId = "cred-1") {
  return {
    action: "verify-authentication",
    credential: {
      id: credentialId,
      response: {
        clientDataJSON: a.clientDataJSON,
        authenticatorData: a.authenticatorData,
        signature: a.signature,
      },
    },
  };
}

const FUTURE = () => new Date(Date.now() + 60_000).toISOString();
const PAST = () => new Date(Date.now() - 60_000).toISOString();

// ─── authentication-options: paginação do listUsers ─────────────────────────

Deno.test("authentication-options acha a conta além da 1ª página do listUsers", async () => {
  const page1 = Array.from({ length: 200 }, (_, i) => ({ id: `u-${i}`, email: `user${i}@ex.com` }));
  const page2 = [{ id: "u-200", email: "outro@ex.com" }, { id: "user-alvo", email: "alvo@ex.com" }];
  const { admin, listUsersCalls, db } = fakeAdmin({
    listUsersPages: { 1: page1, 2: page2 },
    db: {
      passkey_credentials: [
        { user_id: "user-alvo", credential_id: "cred-alvo", transports: ["internal"] },
      ],
    },
  });

  const res = await handleWebAuthn(post({ action: "authentication-options", userEmail: "alvo@ex.com" }), deps(admin));

  assertEquals(res.status, 200);
  const body = await res.json();
  // A conta estava fora da 1ª página: só a paginação a alcança.
  assertEquals(listUsersCalls.map((c) => c.page), [1, 2]);
  assertEquals(body.options.allowCredentials, [
    { id: "cred-alvo", type: "public-key", transports: ["internal"] },
  ]);
  // E o challenge fica vinculado à conta encontrada (fluxo com e-mail).
  const challenges = db.get("webauthn_challenges")!;
  assertEquals(challenges.length, 1);
  assertEquals(challenges[0].user_id, "user-alvo");
  assertEquals(challenges[0].type, "authentication");
});

Deno.test("authentication-options com e-mail inexistente deixa allowCredentials indefinido", async () => {
  const page1 = Array.from({ length: 200 }, (_, i) => ({ id: `u-${i}`, email: `user${i}@ex.com` }));
  const { admin, listUsersCalls, db } = fakeAdmin({ listUsersPages: { 1: page1, 2: [] } });

  const res = await handleWebAuthn(post({ action: "authentication-options", userEmail: "ninguem@ex.com" }), deps(admin));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(listUsersCalls.map((c) => c.page), [1, 2]);
  assertEquals(body.options.allowCredentials, undefined);
  // Sem conta, o challenge fica anônimo (login discoverable).
  assertEquals(db.get("webauthn_challenges")![0].user_id, null);
});

// ─── verify-authentication: challenge localizado por valor ──────────────────

Deno.test("verify-authentication autentica com challenge anônimo (discoverable)", async () => {
  const challenge = "challenge-anonimo-001";
  const a = await buildAssertion({ challenge });
  const { admin, calls, db } = fakeAdmin({
    db: {
      passkey_credentials: [
        { id: "row-cred-1", credential_id: "cred-1", user_id: "user-1", public_key: a.storedPublicKey, counter: 0 },
      ],
      webauthn_challenges: [
        { id: "ch-anon", user_id: null, challenge, type: "authentication", expires_at: FUTURE() },
      ],
    },
    usersById: { "user-1": { id: "user-1", email: "dono@ex.com" } },
  });

  const res = await handleWebAuthn(post(assertionBody(a)), deps(admin));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.userId, "user-1");
  assertEquals(body.userEmail, "dono@ex.com");

  // A busca foi pelo VALOR do challenge assinado (não por recência).
  const select = calls.find((c) => c.table === "webauthn_challenges" && c.ops.some((o) => o.startsWith("select")));
  assert(select, "esperada consulta em webauthn_challenges");
  assert(select.ops.includes(`eq(challenge,${challenge})`), `ops: ${select.ops.join(" | ")}`);
  assert(!select.ops.some((o) => o.startsWith("order(")), "não pode depender de recência");

  // A linha anônima foi consumida por id.
  assertEquals(db.get("webauthn_challenges")!.length, 0);
  const del = calls.find((c) => c.table === "webauthn_challenges" && c.ops.includes("delete()"));
  assert(del?.ops.includes("eq(id,ch-anon)"), `ops: ${del?.ops.join(" | ")}`);
});

Deno.test("challenge antigo do usuário não encobre o anônimo; só a linha usada é consumida", async () => {
  const anonChallenge = "challenge-anonimo-xyz";
  const a = await buildAssertion({ challenge: anonChallenge });
  const { admin, db, calls } = fakeAdmin({
    db: {
      passkey_credentials: [
        { id: "row-cred-1", credential_id: "cred-1", user_id: "user-1", public_key: a.storedPublicKey, counter: 0 },
      ],
      webauthn_challenges: [
        // Fluxo com e-mail abandonado: challenge antigo do PRÓPRIO usuário.
        { id: "ch-owner-old", user_id: "user-1", challenge: "challenge-antigo-do-dono", type: "authentication", expires_at: FUTURE() },
        { id: "ch-anon", user_id: null, challenge: anonChallenge, type: "authentication", expires_at: FUTURE() },
      ],
    },
    usersById: { "user-1": { id: "user-1", email: "dono@ex.com" } },
  });

  const res = await handleWebAuthn(post(assertionBody(a)), deps(admin));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);

  // Só a linha anônima (a do challenge assinado) foi consumida; a antiga do
  // dono continua existindo — não foi apagada por user_id nem por recência.
  const restantes = db.get("webauthn_challenges")!;
  assertEquals(restantes.length, 1);
  assertEquals(restantes[0].id, "ch-owner-old");
  const del = calls.find((c) => c.table === "webauthn_challenges" && c.ops.includes("delete()"));
  assert(del?.ops.includes("eq(id,ch-anon)"), `ops: ${del?.ops.join(" | ")}`);
  assert(
    !del!.ops.some((o) => o.startsWith("eq(user_id")),
    "delete não pode ser por user_id",
  );
});

Deno.test("verify-authentication rejeita challenge ausente (400)", async () => {
  const challenge = "challenge-sem-linha";
  const a = await buildAssertion({ challenge });
  const { admin } = fakeAdmin({
    db: {
      passkey_credentials: [
        { id: "row-cred-1", credential_id: "cred-1", user_id: "user-1", public_key: a.storedPublicKey, counter: 0 },
      ],
      // Existe linha de autenticação, mas com OUTRO valor: sem fallback por
      // recência, ela não pode ser usada no lugar do challenge assinado.
      webauthn_challenges: [
        { id: "ch-outro", user_id: null, challenge: "outro-challenge", type: "authentication", expires_at: FUTURE() },
      ],
    },
  });

  const res = await handleWebAuthn(post(assertionBody(a)), deps(admin));

  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Challenge not found or expired");
});

Deno.test("verify-authentication rejeita clientDataJSON sem challenge (400)", async () => {
  const a = await buildAssertion();
  const { admin } = fakeAdmin({
    db: {
      passkey_credentials: [
        { id: "row-cred-1", credential_id: "cred-1", user_id: "user-1", public_key: a.storedPublicKey, counter: 0 },
      ],
      webauthn_challenges: [
        { id: "ch-anon", user_id: null, challenge: "qualquer", type: "authentication", expires_at: FUTURE() },
      ],
    },
  });
  // clientDataJSON parseável, mas sem o campo challenge.
  const semChallenge = {
    ...a,
    clientDataJSON: btoa(JSON.stringify({ type: "webauthn.get", origin: ORIGIN }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  };

  const res = await handleWebAuthn(post(assertionBody(semChallenge)), deps(admin));

  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Challenge not found or expired");
});

Deno.test("verify-authentication rejeita challenge expirado (400)", async () => {
  const challenge = "challenge-expirado";
  const a = await buildAssertion({ challenge });
  const { admin } = fakeAdmin({
    db: {
      passkey_credentials: [
        { id: "row-cred-1", credential_id: "cred-1", user_id: "user-1", public_key: a.storedPublicKey, counter: 0 },
      ],
      webauthn_challenges: [
        { id: "ch-exp", user_id: "user-1", challenge, type: "authentication", expires_at: PAST() },
      ],
    },
  });

  const res = await handleWebAuthn(post(assertionBody(a)), deps(admin));

  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Challenge expired");
});
