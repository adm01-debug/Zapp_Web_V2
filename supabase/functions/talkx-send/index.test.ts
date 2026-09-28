import { handleTalkxSend, personalize } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const contact = { name: 'Joao Silva', nickname: 'Joao', company: 'Empresa Teste' };

Deno.test('personalize resolves the built-in placeholders (nome/apelido/empresa/saudacao)', () => {
  const result = personalize('Ola {{nome}}, aqui é da {{empresa}}', contact, {});
  assert(result === 'Ola Joao, aqui é da Empresa Teste', `unexpected result: ${result}`);
});

Deno.test('personalize falls back to a bracket placeholder for an unresolved variable instead of throwing', () => {
  // Regressão: campanha sem template salvo (template_id null) ou contato sem
  // aquele campo customizado preenchido não pode derrubar o envio inteiro com
  // unknown_placeholder — antes isso falhava 100% dos destinatários.
  const result = personalize('Seu cargo é {{cargo}}', contact, {});
  assert(result === 'Seu cargo é [cargo]', `unexpected result: ${result}`);
});

Deno.test('personalize substitutes the real value when the contact has that custom field', () => {
  // Regressão: o envio real de campanha (talkx-send, action=start) sempre
  // "resolvia" variável customizada como o próprio nome entre colchetes
  // (ex.: {{cargo}} -> "[cargo]"), nunca o dado real de contact_custom_fields.
  const result = personalize('Seu cargo é {{cargo}}', contact, { cargo: 'Diretor de Vendas' });
  assert(result === 'Seu cargo é Diretor de Vendas', `unexpected result: ${result}`);
});

Deno.test('personalize resolves multiple custom values in the same message', () => {
  const result = personalize(
    'Ola {{nome}}, seu cargo e {{cargo}} no time {{time}}',
    contact,
    { cargo: 'Diretor', time: 'Vendas' },
  );
  assert(result === 'Ola Joao, seu cargo e Diretor no time Vendas', `unexpected result: ${result}`);
});

Deno.test('personalize replaces {{link}} with the per-recipient tracking URL when provided', () => {
  const result = personalize('Veja aqui: {{link}}', contact, {}, 'America/Sao_Paulo', 'https://zapp.example/l/abc');
  assert(result === 'Veja aqui: https://zapp.example/l/abc', `unexpected result: ${result}`);
});

Deno.test('personalize falls back to a bracket placeholder for {{link}} when no tracking URL is available', () => {
  const result = personalize('Veja aqui: {{link}}', contact, {});
  assert(result === 'Veja aqui: [link]', `unexpected result: ${result}`);
});

Deno.test('personalize matches a custom field key case-insensitively', () => {
  // Regressão: o CRM guarda o nome do campo como foi digitado (ex.: "CPF"),
  // mas o editor de template força minúsculo no placeholder ({{cpf}}) — o
  // match não pode depender de bater exatamente a mesma caixa.
  const result = personalize('CPF: {{cpf}}', contact, { CPF: '000.000.000-00' });
  assert(result === 'CPF: 000.000.000-00', `unexpected result: ${result}`);
});

Deno.test('personalize ignores a custom value using a reserved built-in name', () => {
  // Regressão: um campo customizado chamado "link" comia {{link}} antes do
  // passe de tracking, e um campo "nome"/"empresa" sequestrava o dado real do
  // contato.
  const result = personalize(
    'Nome: {{nome}} - Link: {{link}}',
    contact,
    { nome: 'Valor Errado', link: 'https://phishing.example' },
    'America/Sao_Paulo',
    'https://zapp.example/l/abc',
  );
  assert(result === 'Nome: Joao - Link: https://zapp.example/l/abc', `unexpected result: ${result}`);
});

Deno.test('personalize does not reinterpret placeholder-shaped text inside a custom value', () => {
  // Regressão: um campo customizado com valor literal "{{empresa}}" não pode
  // ser reescaneado e virar o nome da empresa do contato — é o dado de CRM
  // como está, ponto.
  const result = personalize('Cargo: {{cargo}}', contact, { cargo: '{{empresa}}' });
  assert(result === 'Cargo: {{empresa}}', `unexpected result: ${result}`);
});

Deno.test('personalize does not leak an inherited Object.prototype property for an unresolved placeholder', () => {
  // Regressão: "key in contactValues" também acha propriedades herdadas
  // (constructor, __proto__, etc.) antes de consultar o mapa de valores
  // customizados — um placeholder desses vazaria texto de função/objeto em
  // vez de cair no fallback "[variavel]".
  const result = personalize('X: {{constructor}}', contact, {});
  assert(result === 'X: [constructor]', `unexpected result: ${result}`);
});

// ---------------------------------------------------------------------------
// handleTalkxSend — cobertura dos caminhos de autenticação
// ---------------------------------------------------------------------------

const TEST_SERVICE_KEY = "eyJtest.servicekey.forauth";

function makePost(opts: {
  bearer?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any;
}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.bearer !== undefined) headers["Authorization"] = `Bearer ${opts.bearer}`;
  return new Request("https://edge.test/talkx-send", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function qb(overrides: Record<string, () => unknown> = {}): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  authUser?: { id: string } | null;
  authUserError?: boolean;
  roleData?: { role: string } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockDeps(opts: MockOpts): any {
  return {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
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
        return qb();
      },
    },
  };
}

Deno.test("auth: sem Authorization header → 401", async () => {
  const req = makePost({});
  const res = await handleTalkxSend(req, mockDeps({}));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com service-role key correta → passa auth, chega no 400 de campaignId ausente", async () => {
  const req = makePost({ bearer: TEST_SERVICE_KEY });
  const res = await handleTalkxSend(req, mockDeps({}));
  assert(res.status === 400, `esperado 400 (auth ok via service key), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "campaignId required", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT inválido (getUser retorna error) → 401", async () => {
  const req = makePost({ bearer: "eyJinvalid.jwt.token" });
  const res = await handleTalkxSend(req, mockDeps({ authUserError: true }));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT válido mas sem role admin/supervisor → 403", async () => {
  const req = makePost({ bearer: "eyJvalid.user.token.xx" });
  const res = await handleTalkxSend(req, mockDeps({
    authUser: { id: "user-001" },
    roleData: null,
  }));
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Forbidden", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT válido e role admin → passa auth, chega no 400 de campaignId ausente", async () => {
  const req = makePost({ bearer: "eyJvalid.admin.token.xx" });
  const res = await handleTalkxSend(req, mockDeps({
    authUser: { id: "user-admin-001" },
    roleData: { role: "admin" },
  }));
  assert(res.status === 400, `esperado 400 (auth ok via JWT admin), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "campaignId required", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT válido e role supervisor → passa auth, chega no 400 de campaignId ausente", async () => {
  const req = makePost({ bearer: "eyJvalid.supervisor.token.xx" });
  const res = await handleTalkxSend(req, mockDeps({
    authUser: { id: "user-supervisor-001" },
    roleData: { role: "supervisor" },
  }));
  assert(res.status === 400, `esperado 400 (auth ok via JWT supervisor), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "campaignId required", `body inesperado: ${JSON.stringify(body)}`);
});
