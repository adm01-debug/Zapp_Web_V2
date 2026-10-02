import { handleTalkxSend, personalize, randomBetween } from './index.ts';
import {
  TEST_SERVICE_KEY, CAMPAIGN_ID, makePost,
  makeCampaign, makeConnection,
  makeDispatchDeps, makeTestActionDeps,
  setDispatchEnv, setDispatchEnvGo,
  mockGlobalFetch, mockGlobalFetchGo, makeDispatchPost,
  TEST_CRON_SECRET, installFakeClock,
  makeContinueRecipients, makeContinueDeps, mockProviderRecording,
} from './_test-utils.ts';

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
// V09 — limites de envio (send_interval_min/max) respeitados
// ---------------------------------------------------------------------------
// O intervalo entre destinatários é sorteado dentro de [min, max] por
// randomBetween (index.ts:88). O teto de 24h (86.400.000 ms) foi fechado pela
// CHECK talkx_campaigns_send_interval_max_check (A2); este teste trava que o
// sorteio nunca extrapola os limites — inclusive quando min === max.

Deno.test('randomBetween respeita os limites inclusive min..max (V09)', () => {
  for (let i = 0; i < 500; i++) {
    const v = randomBetween(5000, 8000);
    assert(v >= 5000 && v <= 8000, `fora dos limites [5000..8000]: ${v}`);
    assert(Number.isInteger(v), `não é inteiro: ${v}`);
  }
});

Deno.test('randomBetween devolve exatamente o valor quando min === max (teto 24h)', () => {
  assert(randomBetween(86400000, 86400000) === 86400000, 'teto de 24h deve ser respeitado');
  assert(randomBetween(0, 0) === 0, 'limite zero deve ser respeitado');
});

// ---------------------------------------------------------------------------
// handleTalkxSend — cobertura dos caminhos de autenticação
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Testes de integração — dispatch/start
// ---------------------------------------------------------------------------

Deno.test("dispatch/start: happy path — 1 destinatário de texto → sent=1", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps());
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.sent === 1, `esperado sent:1, recebido sent:${body.sent}`);
    assert(body.failed === 0, `esperado failed:0, recebido failed:${body.failed}`);
    assert(body.total === 1, `esperado total:1, recebido total:${body.total}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/start: campanha não encontrada → 404", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps({ campaign: null }));
    assert(res.status === 404, `esperado 404, recebido ${res.status}`);
    const body = await res.json();
    assert(body.error === "Campaign not found", `body inesperado: ${JSON.stringify(body)}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/start: conexão WhatsApp ausente → 409", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps({ connection: null }));
    assert(res.status === 409, `esperado 409, recebido ${res.status}`);
    const body = await res.json();
    assert(typeof body.error === "string" && body.error.includes("WhatsApp connection"),
      `body inesperado: ${JSON.stringify(body)}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/start: janela de envio fechada → 200 ok:false", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makeDispatchPost();
    const campaign = makeCampaign({ send_window_start: "00:00", send_window_end: "00:00" });
    const res = await handleTalkxSend(req, makeDispatchDeps({ campaign }));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.ok === false, `esperado ok:false, recebido: ${JSON.stringify(body)}`);
    assert(body.reason === "outside_send_window", `reason inesperado: ${body.reason}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/start: destinatário suprimido → blacklisted=1, sent=0", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps({ suppressAll: true }));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.blacklisted === 1, `esperado blacklisted:1, recebido blacklisted:${body.blacklisted}`);
    assert(body.sent === 0, `esperado sent:0, recebido sent:${body.sent}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/start: Evolution GO retorna 5xx → outcome_unknown=1, sent=0", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch("/message/sendText");
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps());
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.outcome_unknown === 1, `esperado outcome_unknown:1, recebido: ${JSON.stringify(body)}`);
    assert(body.sent === 0, `esperado sent:0, recebido sent:${body.sent}`);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Testes de integração — dispatch/test
// ---------------------------------------------------------------------------

Deno.test("dispatch/test: envia template de teste com sucesso → provider_message_id devolvido", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makePost({
      bearer: TEST_SERVICE_KEY,
      body: { action: "test", templateContent: "Ola {{nome}}, tudo bem?", phone: "+5511999990001" },
    });
    const res = await handleTalkxSend(req, makeTestActionDeps(makeConnection()));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(typeof body.provider_message_id === "string" && body.provider_message_id.length > 0,
      `provider_message_id ausente: ${JSON.stringify(body)}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/test: sem conexão WhatsApp ativa → 400", async () => {
  setDispatchEnv();
  const req = makePost({
    bearer: TEST_SERVICE_KEY,
    body: { action: "test", templateContent: "Ola {{nome}}", phone: "+5511999990001" },
  });
  const res = await handleTalkxSend(req, makeTestActionDeps(null));
  assert(res.status === 400, `esperado 400, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Nenhuma conexao WhatsApp ativa", `body inesperado: ${JSON.stringify(body)}`);
});

// ---------------------------------------------------------------------------
// Testes de integração — dispatch/pause e dispatch/cancel
// ---------------------------------------------------------------------------

Deno.test("dispatch/pause: transição bem-sucedida → success:true com current_status", async () => {
  setDispatchEnv();
  const req = makePost({ bearer: TEST_SERVICE_KEY, body: { action: "pause", campaignId: CAMPAIGN_ID } });
  const res = await handleTalkxSend(req, makeDispatchDeps());
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
  assert(typeof body.status === "string", `status ausente: ${JSON.stringify(body)}`);
});

Deno.test("dispatch/cancel: transição bem-sucedida → success:true com current_status", async () => {
  setDispatchEnv();
  const req = makePost({ bearer: TEST_SERVICE_KEY, body: { action: "cancel", campaignId: CAMPAIGN_ID } });
  const res = await handleTalkxSend(req, makeDispatchDeps());
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
  assert(typeof body.status === "string", `status ausente: ${JSON.stringify(body)}`);
});

// ---------------------------------------------------------------------------
// Testes de integração — ação não implementada
// ---------------------------------------------------------------------------

Deno.test("dispatch/resume: ação não implementada → 400 Invalid campaign action", async () => {
  setDispatchEnv();
  const req = makePost({ bearer: TEST_SERVICE_KEY, body: { action: "resume", campaignId: CAMPAIGN_ID } });
  const res = await handleTalkxSend(req, makeDispatchDeps());
  assert(res.status === 400, `esperado 400, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Invalid campaign action", `body inesperado: ${JSON.stringify(body)}`);
});

// ---------------------------------------------------------------------------
// Testes de integração — dispatch/start com EVOLUTION_API_FLAVOR=go
// ---------------------------------------------------------------------------

Deno.test("dispatch/start (GO flavor): happy path — URL traduzida /send/text → sent=1", async () => {
  setDispatchEnvGo();
  const restore = mockGlobalFetchGo();
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps());
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.sent === 1, `esperado sent:1, recebido sent:${body.sent}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/start (GO flavor): Evolution GO retorna 5xx em /send/text → outcome_unknown=1", async () => {
  setDispatchEnvGo();
  const restore = mockGlobalFetchGo("/send/text");
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps());
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.outcome_unknown === 1, `esperado outcome_unknown:1, recebido: ${JSON.stringify(body)}`);
    assert(body.sent === 0, `esperado sent:0, recebido sent:${body.sent}`);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// V19 — retry manual de destinatário terminal (outcome_unknown/failed)
// ---------------------------------------------------------------------------

Deno.test("retry: destinatário outcome_unknown → retry manual → success:true", async () => {
  const deps = {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: new Error("") }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rpc(name: string): Promise<any> {
        if (name === "talkx_recipient_is_suppressed") return Promise.resolve({ data: false, error: null });
        if (name === "retry_talkx_recipient") return Promise.resolve({ data: true, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        if (table === "user_roles") return qb({ maybeSingle: () => Promise.resolve({ data: null, error: null }) });
        if (table === "talkx_recipients") {
          return qb({
            single: () => Promise.resolve({
              data: { id: "recip-1", contact_id: "contact-1", status: "outcome_unknown", attempt_count: 1 },
              error: null,
            }),
          });
        }
        return qb();
      },
    },
  };
  const req = makePost({ bearer: TEST_SERVICE_KEY, body: { action: "retry", recipientId: "recip-1" } });
  const res = await handleTalkxSend(req, deps);
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
});

Deno.test("retry: destinatário suprimido → success:false reason:suppressed", async () => {
  const deps = {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: new Error("") }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rpc(name: string): Promise<any> {
        if (name === "talkx_recipient_is_suppressed") return Promise.resolve({ data: true, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        if (table === "user_roles") return qb({ maybeSingle: () => Promise.resolve({ data: null, error: null }) });
        if (table === "talkx_recipients") {
          return qb({
            single: () => Promise.resolve({
              data: { id: "recip-1", contact_id: "contact-1", status: "failed", attempt_count: 0 },
              error: null,
            }),
          });
        }
        return qb();
      },
    },
  };
  const req = makePost({ bearer: TEST_SERVICE_KEY, body: { action: "retry", recipientId: "recip-1" } });
  const res = await handleTalkxSend(req, deps);
  const body = await res.json();
  assert(body.success === false && body.reason === "suppressed", `esperado suppressed, recebido: ${JSON.stringify(body)}`);
});

// ---------------------------------------------------------------------------
// X011 — ação continue: passadas em lote com orçamento de tempo e lease.
// ---------------------------------------------------------------------------
// O relógio falso faz cada `sleep(interval)` avançar o relógio, então o
// orçamento (TALKX_BATCH_BUDGET_MS) é exercitado sem espera real. Com
// send_interval=1000ms e typing_delay_max=0, cada destinatário custa 1s:
// orçamento de 44000ms (25000 de folga mínima + 19s) deixa passar EXATAMENTE
// um lote de 20 por invocação.

type ProviderPost = { url: string; body: Record<string, unknown> };
const phoneOf = (p: ProviderPost): string => String(p.body?.number ?? "");
const messagePosts = (posts: ProviderPost[]): ProviderPost[] => posts.filter((p) => p.url.includes("/message/"));

Deno.test("X011 continue: 45 destinatários em lote de 20 → três invocações enviam 45, sem id repetido", async () => {
  setDispatchEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const recipients = makeContinueRecipients(45);
  const { deps, ctx } = makeContinueDeps({ recipients, clock, cronSecret: TEST_CRON_SECRET });
  const provider = mockProviderRecording();
  Deno.env.set("TALKX_BATCH_BUDGET_MS", "44000");
  try {
    const perInvocation: number[] = [];
    const hasMore: boolean[] = [];
    let previous = 0;
    for (let i = 0; i < 3; i++) {
      const res = await handleTalkxSend(
        makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
        deps,
      );
      assert(res.status === 200, `invocação ${i + 1}: esperado 200, recebido ${res.status}`);
      const body = await res.json();
      const total = messagePosts(provider.posts).length;
      perInvocation.push(total - previous);
      previous = total;
      hasMore.push(body.has_more === true);
    }
    assert(
      perInvocation.join(",") === "20,20,5",
      `esperado um lote de 20 por invocação (20,20,5), recebido ${perInvocation.join(",")}`,
    );
    const phones = messagePosts(provider.posts).map(phoneOf);
    assert(phones.length === 45, `esperado 45 envios, recebido ${phones.length}`);
    assert(new Set(phones).size === 45, "nenhum destinatário pode ser enviado duas vezes ao provedor");
    assert(
      hasMore.join(",") === "true,true,false",
      `has_more esperado true,true,false — recebido ${hasMore.join(",")}`,
    );
    assert(ctx.completeDrainedCalls === 1, `complete_talkx_campaign_if_drained deveria rodar 1x (fila drenada), rodou ${ctx.completeDrainedCalls}`);
    assert(ctx.releaseWorkerCalls === 3, `o lease deveria ser solto em cada invocação, foi ${ctx.releaseWorkerCalls}x`);
  } finally {
    provider.restore();
    clock.restore();
    Deno.env.delete("TALKX_BATCH_BUDGET_MS");
  }
});

Deno.test("X011 continue: orçamento estourado → has_more:true e complete_talkx_campaign_if_drained não é chamada", async () => {
  setDispatchEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const recipients = makeContinueRecipients(45);
  const { deps, ctx } = makeContinueDeps({ recipients, clock, cronSecret: TEST_CRON_SECRET });
  const provider = mockProviderRecording();
  Deno.env.set("TALKX_BATCH_BUDGET_MS", "1");
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.has_more === true, `esperado has_more:true, recebido ${JSON.stringify(body)}`);
    assert(body.processed === 0, `nenhum destinatário deveria ser processado, processed=${body.processed}`);
    assert(ctx.completeDrainedCalls === 0, "complete_talkx_campaign_if_drained NÃO pode rodar quando o orçamento estoura");
    assert(messagePosts(provider.posts).length === 0, "nenhum POST de mensagem com o orçamento estourado");
    assert(ctx.claimWorkerCalls === 1, "a campanha deveria ter sido reivindicada");
  } finally {
    provider.restore();
    clock.restore();
    Deno.env.delete("TALKX_BATCH_BUDGET_MS");
  }
});

Deno.test("X011 continue: destinatário com retry_after vencido só é enviado na invocação seguinte", async () => {
  setDispatchEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const future = new Date(clock.now() + 60_000).toISOString();
  const recipients = makeContinueRecipients(2, { retryAfter: (i) => (i === 1 ? future : null) });
  const { deps } = makeContinueDeps({ recipients, clock, cronSecret: TEST_CRON_SECRET });
  const provider = mockProviderRecording();
  try {
    const res1 = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res1.status === 200, `1ª invocação: esperado 200, recebido ${res1.status}`);
    const body1 = await res1.json();
    assert(body1.processed === 1, `1ª invocação deveria processar 1 (o reagendado ainda não venceu), processou ${body1.processed}`);
    assert(messagePosts(provider.posts).length === 1, `1ª invocação deveria POSTar 1x, POSTou ${messagePosts(provider.posts).length}`);
    const primeiroPhone = phoneOf(messagePosts(provider.posts)[0]);

    // O relógio avança além do retry_after: na invocação seguinte ele é elegível.
    clock.advance(61_000);
    const res2 = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res2.status === 200, `2ª invocação: esperado 200, recebido ${res2.status}`);
    const body2 = await res2.json();
    assert(body2.processed === 1, `2ª invocação deveria processar o reagendado, processou ${body2.processed}`);
    const phones = messagePosts(provider.posts).map(phoneOf);
    assert(phones.length === 2, `esperado 2 envios no total, recebido ${phones.length}`);
    const expectedSecond = String(recipients[1].contact_phone).replace(/\D/g, "");
    assert(
      primeiroPhone !== expectedSecond && phones[1] === expectedSecond,
      `o reagendado só podia sair na 2ª invocação: phones=${JSON.stringify(phones)}`,
    );
  } finally {
    provider.restore();
    clock.restore();
  }
});

Deno.test("X011 continue: segunda invocação com lease vivo faz 0 POST", async () => {
  setDispatchEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const recipients = makeContinueRecipients(3);
  // 1ª chamada reivindica o lease; a 2ª encontra o lease vivo de outro worker.
  const { deps } = makeContinueDeps({ recipients, clock, cronSecret: TEST_CRON_SECRET, claimWorker: (call) => call === 1 });
  const provider = mockProviderRecording();
  try {
    const res1 = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res1.status === 200, `1ª invocação: esperado 200, recebido ${res1.status}`);
    await res1.json();
    const afterFirst = messagePosts(provider.posts).length;
    assert(afterFirst === 3, `1ª invocação deveria enviar os 3, enviou ${afterFirst}`);

    const res2 = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res2.status === 200, `2ª invocação: esperado 200, recebido ${res2.status}`);
    const body2 = await res2.json();
    assert(body2.skipped === "worker_alive", `esperado skipped:'worker_alive', recebido ${JSON.stringify(body2)}`);
    assert(body2.processed === 0, `sem lease não há processamento, processed=${body2.processed}`);
    assert(
      messagePosts(provider.posts).length === afterFirst,
      "com o lease vivo nenhum POST ao provedor pode sair",
    );
  } finally {
    provider.restore();
    clock.restore();
  }
});

Deno.test("X011 continue: JWT de admin → 403 (só service key ou x-cron-secret dirigem a fila)", async () => {
  setDispatchEnv();
  const req = makePost({
    bearer: "eyJvalid.admin.token.xx",
    body: { action: "continue", campaignId: CAMPAIGN_ID },
  });
  const res = await handleTalkxSend(req, mockDeps({
    authUser: { id: "user-admin-001" },
    roleData: { role: "admin" },
  }));
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Forbidden", `body inesperado: ${JSON.stringify(body)}`);
});
