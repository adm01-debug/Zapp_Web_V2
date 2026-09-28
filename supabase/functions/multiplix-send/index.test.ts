import { handleMultiplixSend, personalizeMultiplix } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('personalizeMultiplix resolves {{empresa}} com o nome da empresa', () => {
  const result = personalizeMultiplix('Ola, aqui é da {{empresa}}', { name: 'Empresa Teste' });
  assert(result === 'Ola, aqui é da Empresa Teste', `unexpected result: ${result}`);
});

Deno.test('personalizeMultiplix resolve {{saudacao}} para um período válido do dia', () => {
  // getGreeting() usa a hora real — só valida que retorna uma das 3 saudações
  // esperadas, sem travar o teste a um horário fixo de execução do CI.
  const result = personalizeMultiplix('{{saudacao}}, {{empresa}}!', { name: 'Acme' });
  const validGreetings = ['Bom dia, Acme!', 'Boa tarde, Acme!', 'Boa noite, Acme!'];
  assert(validGreetings.includes(result), `unexpected greeting result: ${result}`);
});

Deno.test('personalizeMultiplix usa string vazia quando company.name é ausente/null', () => {
  const result = personalizeMultiplix('Empresa: {{empresa}}', {});
  assert(result === 'Empresa: ', `unexpected result: ${result}`);
});

Deno.test('personalizeMultiplix lança unknown_placeholder para variável fora do conjunto fixo', () => {
  // Multiplix nao tem custom_variables (diferente do talkx-send) — todo
  // placeholder que nao seja {{empresa}}/{{saudacao}} deve falhar explicito
  // em vez de vazar {{...}} intacto pra mensagem real do WhatsApp.
  let threw = false;
  try {
    personalizeMultiplix('Seu cargo é {{cargo}}', { name: 'Acme' });
  } catch (e) {
    threw = true;
    assert(e instanceof Error && e.message.includes('unknown_placeholder: {{cargo}}'), `unexpected error: ${e}`);
  }
  assert(threw, 'expected personalizeMultiplix to throw for an unregistered placeholder');
});

Deno.test('personalizeMultiplix é case-insensitive nos placeholders conhecidos', () => {
  const result = personalizeMultiplix('{{SAUDACAO}}, {{Empresa}}!', { name: 'Acme' });
  const validGreetings = ['Bom dia, Acme!', 'Boa tarde, Acme!', 'Boa noite, Acme!'];
  assert(validGreetings.includes(result), `unexpected result: ${result}`);
});

// ---------------------------------------------------------------------------
// handleMultiplixSend — cobertura dos caminhos de autenticação
// ---------------------------------------------------------------------------

const TEST_CRON_SECRET = "cron-secret-test-64chars-for-timing-safe-comparison-xxxxxxxxxxxx";
const TEST_SERVICE_KEY = "eyJtest.servicekey.forauth";

function makePost(opts: {
  cronSecret?: string;
  bearer?: string;
  // deno-lint-ignore no-explicit-any
  body?: any;
}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cronSecret !== undefined) headers["x-cron-secret"] = opts.cronSecret;
  if (opts.bearer !== undefined) headers["Authorization"] = `Bearer ${opts.bearer}`;
  return new Request("https://edge.test/multiplix-send", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? { dispatchId: "00000000-0000-0000-0000-000000000001" }),
  });
}

// Chainable query builder — select/eq/in/limit/is/update retornam self;
// single() retorna "not found" por padrão; maybeSingle() retorna null.
// Passar `overrides` substitui métodos terminais específicos.
// deno-lint-ignore no-explicit-any
function qb(overrides: Record<string, () => unknown> = {}): any {
  // deno-lint-ignore no-explicit-any
  const b: Record<string, any> = {};
  const chain = () => b;
  b.select = chain; b.eq = chain; b.in = chain; b.limit = chain;
  b.is = chain; b.update = chain;
  b.single = () => Promise.resolve({ data: null, error: { message: "not found" } });
  b.maybeSingle = () => Promise.resolve({ data: null, error: null });
  Object.assign(b, overrides);
  return b;
}

interface MockOpts {
  cronVaultResult?: string | null;
  cronVaultError?: boolean;
  authUser?: { id: string } | null;
  authUserError?: boolean;
  roleData?: { role: string } | null;
}

// deno-lint-ignore no-explicit-any
function mockDeps(opts: MockOpts): any {
  return {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      rpc(name: string) {
        if (name === "get_multiplix_cron_secret") {
          if (opts.cronVaultError) {
            return Promise.resolve({ data: null, error: new Error("vault rpc failed") });
          }
          return Promise.resolve({ data: opts.cronVaultResult ?? null, error: null });
        }
        return Promise.resolve({ data: null, error: new Error(`rpc ${name} not mocked`) });
      },
      auth: {
        getUser(_token: string) {
          if (opts.authUserError) {
            return Promise.resolve({ data: { user: null }, error: new Error("invalid token") });
          }
          const user = opts.authUser ?? null;
          return Promise.resolve({ data: { user }, error: user ? null : new Error("no user") });
        },
      },
      from(table: string) {
        if (table === "user_roles") {
          return qb({ maybeSingle: () => Promise.resolve({ data: opts.roleData ?? null, error: null }) });
        }
        // multiplix_dispatches e demais → simula "não encontrado" para encerrar auth-success tests em 404
        return qb();
      },
    },
  };
}

Deno.test("auth: x-cron-secret correto → passa auth, chega no 404 de dispatch ausente", async () => {
  const req = makePost({ cronSecret: TEST_CRON_SECRET });
  const res = await handleMultiplixSend(req, mockDeps({ cronVaultResult: TEST_CRON_SECRET }));
  // Auth bem-sucedida → handler busca dispatch → mock retorna "not found" → 404
  assert(res.status === 404, `esperado 404 (auth ok), recebido ${res.status}`);
});

Deno.test("auth: x-cron-secret errado → 401", async () => {
  const req = makePost({ cronSecret: "wrong-secret-value" });
  const res = await handleMultiplixSend(req, mockDeps({ cronVaultResult: TEST_CRON_SECRET }));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: vault RPC falha → fail-closed → 401 (não vaza secret inválido)", async () => {
  // Se o RPC de vault falhar, isCronAuth deve ficar false → nunca autorizar cron
  const req = makePost({ cronSecret: TEST_CRON_SECRET });
  const res = await handleMultiplixSend(req, mockDeps({ cronVaultError: true }));
  assert(res.status === 401, `esperado 401 (fail-closed), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: sem Authorization e sem x-cron-secret → 401", async () => {
  const req = makePost({});
  const res = await handleMultiplixSend(req, mockDeps({}));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com service-role key correta → passa auth, chega no 404 de dispatch ausente", async () => {
  const req = makePost({ bearer: TEST_SERVICE_KEY });
  const res = await handleMultiplixSend(req, mockDeps({}));
  assert(res.status === 404, `esperado 404 (auth ok via service key), recebido ${res.status}`);
});

Deno.test("auth: Bearer com JWT inválido (getUser retorna error) → 401", async () => {
  const req = makePost({ bearer: "eyJinvalid.jwt.token" });
  const res = await handleMultiplixSend(req, mockDeps({ authUserError: true }));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT válido mas sem role admin/supervisor → 403", async () => {
  const req = makePost({ bearer: "eyJvalid.user.token.xx" });
  const res = await handleMultiplixSend(req, mockDeps({
    authUser: { id: "user-001" },
    roleData: null,
  }));
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Forbidden", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT válido e role admin → passa auth, chega no 404 de dispatch ausente", async () => {
  const req = makePost({ bearer: "eyJvalid.admin.token.xx" });
  const res = await handleMultiplixSend(req, mockDeps({
    authUser: { id: "user-admin-001" },
    roleData: { role: "admin" },
  }));
  assert(res.status === 404, `esperado 404 (auth ok via JWT admin), recebido ${res.status}`);
});
