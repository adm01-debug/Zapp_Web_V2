import { handleTalkxSend, personalize, randomBetween } from './index.ts';
import {
  TEST_SERVICE_KEY, CAMPAIGN_ID, makePost,
  makeCampaign, makeConnection,
  makeDispatchDeps, makeTestActionDeps,
  setDispatchEnv, setDispatchEnvGo,
  mockGlobalFetch, makeDispatchPost,
  TEST_CRON_SECRET, installFakeClock,
  makeContinueRecipients, makeContinueDeps, mockProviderRecording,
  thenableQB, makeEventRecordingQB,
} from './_test-utils.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const contact = { name: 'Joao Silva', nickname: 'Joao', company: 'Empresa Teste' };

Deno.test('personalize resolves the built-in placeholders (nome/apelido/empresa/saudacao)', () => {
  const result = personalize('Ola {{nome}}, aqui é da {{empresa}}', contact, {}).text;
  assert(result === 'Ola Joao, aqui é da Empresa Teste', `unexpected result: ${result}`);
});

Deno.test('personalize falls back to a bracket placeholder for an unresolved variable instead of throwing', () => {
  // Regressão: campanha sem template salvo (template_id null) ou contato sem
  // aquele campo customizado preenchido não pode derrubar o envio inteiro com
  // unknown_placeholder — antes isso falhava 100% dos destinatários.
  const result = personalize('Seu cargo é {{cargo}}', contact, {}).text;
  assert(result === 'Seu cargo é [cargo]', `unexpected result: ${result}`);
});

Deno.test('personalize substitutes the real value when the contact has that custom field', () => {
  // Regressão: o envio real de campanha (talkx-send, action=start) sempre
  // "resolvia" variável customizada como o próprio nome entre colchetes
  // (ex.: {{cargo}} -> "[cargo]"), nunca o dado real de contact_custom_fields.
  const result = personalize('Seu cargo é {{cargo}}', contact, { cargo: 'Diretor de Vendas' }).text;
  assert(result === 'Seu cargo é Diretor de Vendas', `unexpected result: ${result}`);
});

Deno.test('personalize resolves multiple custom values in the same message', () => {
  const result = personalize(
    'Ola {{nome}}, seu cargo e {{cargo}} no time {{time}}',
    contact,
    { cargo: 'Diretor', time: 'Vendas' },
  ).text;
  assert(result === 'Ola Joao, seu cargo e Diretor no time Vendas', `unexpected result: ${result}`);
});

Deno.test('personalize replaces {{link}} with the per-recipient tracking URL when provided', () => {
  const result = personalize('Veja aqui: {{link}}', contact, {}, 'America/Sao_Paulo', 'https://zapp.example/l/abc').text;
  assert(result === 'Veja aqui: https://zapp.example/l/abc', `unexpected result: ${result}`);
});

Deno.test('personalize falls back to a bracket placeholder for {{link}} when no tracking URL is available', () => {
  const result = personalize('Veja aqui: {{link}}', contact, {}).text;
  assert(result === 'Veja aqui: [link]', `unexpected result: ${result}`);
});

Deno.test('personalize matches a custom field key case-insensitively', () => {
  // Regressão: o CRM guarda o nome do campo como foi digitado (ex.: "CPF"),
  // mas o editor de template força minúsculo no placeholder ({{cpf}}) — o
  // match não pode depender de bater exatamente a mesma caixa.
  const result = personalize('CPF: {{cpf}}', contact, { CPF: '000.000.000-00' }).text;
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
  ).text;
  assert(result === 'Nome: Joao - Link: https://zapp.example/l/abc', `unexpected result: ${result}`);
});

Deno.test('personalize does not reinterpret placeholder-shaped text inside a custom value', () => {
  // Regressão: um campo customizado com valor literal "{{empresa}}" não pode
  // ser reescaneado e virar o nome da empresa do contato — é o dado de CRM
  // como está, ponto.
  const result = personalize('Cargo: {{cargo}}', contact, { cargo: '{{empresa}}' }).text;
  assert(result === 'Cargo: {{empresa}}', `unexpected result: ${result}`);
});

Deno.test('personalize does not leak an inherited Object.prototype property for an unresolved placeholder', () => {
  // Regressão: "key in contactValues" também acha propriedades herdadas
  // (constructor, __proto__, etc.) antes de consultar o mapa de valores
  // customizados — um placeholder desses vazaria texto de função/objeto em
  // vez de cair no fallback "[variavel]".
  const result = personalize('X: {{constructor}}', contact, {}).text;
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
  // X013: o papel passou a ser conferido pela RPC is_admin_or_supervisor.
  isAdminOrSupervisor?: boolean;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rpc(name: string, _args?: unknown): Promise<any> {
        if (name === "is_admin_or_supervisor") {
          return Promise.resolve({ data: opts.isAdminOrSupervisor ?? false, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      from(_table: string) {
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
    isAdminOrSupervisor: false,
  }));
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Forbidden", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT válido e role admin → passa auth, chega no 400 de campaignId ausente", async () => {
  const req = makePost({ bearer: "eyJvalid.admin.token.xx" });
  const res = await handleTalkxSend(req, mockDeps({
    authUser: { id: "user-admin-001" },
    isAdminOrSupervisor: true,
  }));
  assert(res.status === 400, `esperado 400 (auth ok via JWT admin), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "campaignId required", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT válido e role supervisor → passa auth, chega no 400 de campaignId ausente", async () => {
  const req = makePost({ bearer: "eyJvalid.supervisor.token.xx" });
  const res = await handleTalkxSend(req, mockDeps({
    authUser: { id: "user-supervisor-001" },
    isAdminOrSupervisor: true,
  }));
  assert(res.status === 400, `esperado 400 (auth ok via JWT supervisor), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "campaignId required", `body inesperado: ${JSON.stringify(body)}`);
});

// ---------------------------------------------------------------------------
// Testes de integração — dispatch/start
// ---------------------------------------------------------------------------

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
    isAdminOrSupervisor: true,
  }));
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Forbidden", `body inesperado: ${JSON.stringify(body)}`);
});

// ---------------------------------------------------------------------------
// X013 — lançamento assíncrono: action=start só transiciona e dispara o kick.
// ---------------------------------------------------------------------------
// O laço de envio deixou de rodar dentro do `start`; ele vive no `continue`
// (X011), dirigido pelo `kick_talkx_campaign`. Os testes acima que exercitavam
// o laço em `start` foram migrados para `continue` logo abaixo.

interface AsyncStartDepsOpts {
  campaign?: Record<string, unknown> | null;
  connection?: Record<string, unknown> | null;
  recipients?: unknown[];
  authUser?: { id: string } | null;
  isAdminOrSupervisor?: boolean;
  roleRpcError?: boolean;
  kickError?: boolean;
}

/**
 * Deps do handler para `action=start` assíncrono: auth por JWT (opcional),
 * papel via RPC, sem limite diário (settings vazio) e um contador de kicks e
 * de POSTs ao provedor. `getUser` devolve null quando nenhum `authUser` é dado
 * (caminho da service key, que nem consulta o papel).
 */
function makeAsyncStartDeps(opts: AsyncStartDepsOpts = {}) {
  const campaign = opts.campaign === undefined ? makeCampaign() : opts.campaign;
  const connection = opts.connection === undefined ? makeConnection() : opts.connection;
  const recipients = opts.recipients ?? [];
  const ctx = { kickCalls: 0, rpcCalls: [] as string[] };
  return {
    ctx,
    deps: {
      serviceKey: TEST_SERVICE_KEY,
      supabase: {
        auth: {
          getUser: () => Promise.resolve(
            opts.authUser
              ? { data: { user: opts.authUser }, error: null }
              : { data: { user: null }, error: new Error("no user") },
          ),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rpc(name: string, _args?: unknown): Promise<any> {
          ctx.rpcCalls.push(name);
          if (name === "is_admin_or_supervisor") {
            if (opts.roleRpcError) return Promise.resolve({ data: null, error: { message: "rpc failed" } });
            return Promise.resolve({ data: opts.isAdminOrSupervisor ?? false, error: null });
          }
          if (name === "kick_talkx_campaign") {
            ctx.kickCalls++;
            return Promise.resolve({ data: null, error: opts.kickError ? { message: "kick failed" } : null });
          }
          if (name === "transition_talkx_campaign") return Promise.resolve({ data: [{ current_status: "sending" }], error: null });
          if (name === "get_talkx_cron_secret") return Promise.resolve({ data: null, error: null });
          if (name === "get_instance_token") return Promise.resolve({ data: "tok-principal", error: null });
          if (name === "talkx_connection_send_budget") return Promise.resolve({
            data: {
              minute_limit: 6, minute_sent: 0, minute_remaining: 6,
              day_limit: 500, day_sent: 0, day_remaining: 500, next_day_at: null,
            },
            error: null,
          });
          return Promise.resolve({ data: null, error: null });
        },
        from(table: string) {
          if (table === "talkx_campaigns") return thenableQB({ data: campaign, error: campaign ? null : { message: "not found" } });
          if (table === "whatsapp_connections") return thenableQB({ data: connection, error: null });
          if (table === "talkx_settings") return thenableQB({ data: [], error: null });
          if (table === "talkx_recipients") return thenableQB({ data: recipients, error: null });
          if (table === "talkx_links") return thenableQB({ data: null, error: null });
          return thenableQB({ data: null, error: null });
        },
      },
    },
  };
}

/** Igual a mockProviderRecording, mas derruba 5xx em URLs com `failFragment`. */
function mockProviderRecordingFailing(failFragment?: string): { posts: Array<{ url: string; body: Record<string, unknown> }>; restore: () => void } {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orig = (globalThis as any).fetch;
  let counter = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = (input: unknown, init?: any): Promise<Response> => {
    const url = typeof input === "string" ? input : String((input as { url?: unknown })?.url ?? input);
    let body: Record<string, unknown> = {};
    try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch { body = {}; }
    posts.push({ url, body });
    if (failFragment && url.includes(failFragment)) {
      return Promise.resolve(new Response(JSON.stringify({ error: "mock server error" }), { status: 500 }));
    }
    counter++;
    return Promise.resolve(new Response(JSON.stringify({ key: { id: `provider-msg-${counter}` } }), { status: 200 }));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { posts, restore: () => { (globalThis as any).fetch = orig; } };
}

Deno.test("X013 start: campanha com 500 destinatários → 200 accepted, 0 POST ao provedor, 1 kick", async () => {
  setDispatchEnv();
  const { deps, ctx } = makeAsyncStartDeps({ recipients: makeContinueRecipients(500) });
  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(makeDispatchPost(), deps);
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.accepted === true, `esperado accepted:true, recebido: ${JSON.stringify(body)}`);
    assert(body.status === "sending", `esperado status sending, recebido ${body.status}`);
    assert(provider.posts.length === 0, `start não pode POSTar ao provedor (foi ${provider.posts.length})`);
    assert(ctx.kickCalls === 1, `esperado exatamente 1 chamada a kick_talkx_campaign, houve ${ctx.kickCalls}`);
  } finally {
    provider.restore();
  }
});

Deno.test("X013 start: usuário com as roles admin E supervisor → 200 accepted", async () => {
  setDispatchEnv();
  const { deps, ctx } = makeAsyncStartDeps({
    authUser: { id: "user-admin-supervisor-001" },
    isAdminOrSupervisor: true,
  });
  const req = makePost({
    bearer: "eyJvalid.admin-supervisor.token.xx",
    body: { action: "start", campaignId: CAMPAIGN_ID },
  });
  const res = await handleTalkxSend(req, deps);
  assert(res.status === 200, `esperado 200 (as duas roles não podem virar 403), recebido ${res.status}`);
  const body = await res.json();
  assert(body.accepted === true, `esperado accepted:true, recebido: ${JSON.stringify(body)}`);
  assert(ctx.kickCalls === 1, `esperado 1 kick, houve ${ctx.kickCalls}`);
});

Deno.test("X013 start: agente sem role admin/supervisor → 403", async () => {
  setDispatchEnv();
  const { deps, ctx } = makeAsyncStartDeps({
    authUser: { id: "user-agent-001" },
    isAdminOrSupervisor: false,
  });
  const req = makePost({
    bearer: "eyJvalid.agent.token.xx",
    body: { action: "start", campaignId: CAMPAIGN_ID },
  });
  const res = await handleTalkxSend(req, deps);
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Forbidden", `body inesperado: ${JSON.stringify(body)}`);
  assert(ctx.kickCalls === 0, "um agente barrado não pode disparar o kick");
});

// ---------------------------------------------------------------------------
// X013 — os testes de envio migrados de `start` para `continue`.
// ---------------------------------------------------------------------------
// O laço inline do `start` virou o lote do `continue` (X011); estas coberturas
// seguem exercitando os mesmos desfechos, agora pela ação que realmente envia.

Deno.test("X013 continue (migrado de start): happy path — 1 destinatário de texto → sent=1", async () => {
  setDispatchEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const { deps } = makeContinueDeps({ recipients: makeContinueRecipients(1), clock, cronSecret: TEST_CRON_SECRET });
  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.sent === 1, `esperado sent:1, recebido sent:${body.sent}`);
    assert(body.failed === 0, `esperado failed:0, recebido failed:${body.failed}`);
    assert(body.processed === 1, `esperado processed:1, recebido processed:${body.processed}`);
    assert(messagePosts(provider.posts).length === 1, `esperado 1 POST, recebido ${messagePosts(provider.posts).length}`);
  } finally {
    provider.restore();
    clock.restore();
  }
});

Deno.test("X013 continue (migrado de start): destinatário suprimido → blacklisted=1, sent=0", async () => {
  setDispatchEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const { deps } = makeContinueDeps({
    recipients: makeContinueRecipients(1), clock, cronSecret: TEST_CRON_SECRET, suppressAll: true,
  });
  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.blacklisted === 1, `esperado blacklisted:1, recebido blacklisted:${body.blacklisted}`);
    assert(body.sent === 0, `esperado sent:0, recebido sent:${body.sent}`);
    assert(messagePosts(provider.posts).length === 0, "suprimido não pode POSTar ao provedor");
  } finally {
    provider.restore();
    clock.restore();
  }
});

Deno.test("X013 continue (migrado de start): Evolution v2 retorna 5xx em /message/sendText → outcome_unknown=1, sent=0", async () => {
  setDispatchEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const { deps } = makeContinueDeps({ recipients: makeContinueRecipients(1), clock, cronSecret: TEST_CRON_SECRET });
  const provider = mockProviderRecordingFailing("/message/sendText");
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.outcome_unknown === 1, `esperado outcome_unknown:1, recebido: ${JSON.stringify(body)}`);
    assert(body.sent === 0, `esperado sent:0, recebido sent:${body.sent}`);
  } finally {
    provider.restore();
    clock.restore();
  }
});

Deno.test("X013 continue (migrado de start, GO flavor): happy path — URL /send/text → sent=1", async () => {
  setDispatchEnvGo();
  const clock = installFakeClock(1_700_000_000_000);
  const { deps } = makeContinueDeps({ recipients: makeContinueRecipients(1), clock, cronSecret: TEST_CRON_SECRET });
  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.sent === 1, `esperado sent:1, recebido sent:${body.sent}`);
    assert(provider.posts.some((p) => p.url.endsWith("/send/text")), "deveria POSTar na rota GO /send/text");
    assert(
      !provider.posts.some((p) => p.url.includes("/message/sendText/")),
      "GO não pode POSTar na rota v2 /message/sendText/",
    );
  } finally {
    provider.restore();
    clock.restore();
  }
});

Deno.test("X013 continue (migrado de start, GO flavor): 5xx em /send/text → outcome_unknown=1, sent=0", async () => {
  setDispatchEnvGo();
  const clock = installFakeClock(1_700_000_000_000);
  const { deps } = makeContinueDeps({ recipients: makeContinueRecipients(1), clock, cronSecret: TEST_CRON_SECRET });
  const provider = mockProviderRecordingFailing("/send/text");
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.outcome_unknown === 1, `esperado outcome_unknown:1, recebido: ${JSON.stringify(body)}`);
    assert(body.sent === 0, `esperado sent:0, recebido sent:${body.sent}`);
  } finally {
    provider.restore();
    clock.restore();
  }
});

// ---------------------------------------------------------------------------
// IA-047 — o envio de TESTE é idempotente: repetir o mesmo pedido (duplo clique
// ou retry) NÃO pode produzir um segundo POST ao provedor. O claim durável
// (`talkx_test_send_claims`) é registrado ANTES do POST e a repetição cai na
// UNIQUE (23505), devolvendo o MESMO `provider_message_id` sem reenviar.
// ---------------------------------------------------------------------------

/** Deps com um `talkx_test_send_claims` stateful: a 2ª inserção da mesma
 *  `request_key` devolve 23505 e a leitura devolve o id já confirmado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeIdempotentTestDeps(connection: Record<string, unknown> | null): any {
  const claims = new Map<string, string | null>();
  const keyOf = (p: Record<string, unknown>) => String(p.request_key ?? "");
  return {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: new Error("") }) },
      rpc: () => Promise.resolve({ data: null, error: null }),
      from(table: string) {
        if (table === "whatsapp_connections") return thenableQB({ data: connection, error: null });
        if (table !== "talkx_test_send_claims") return thenableQB({ data: null, error: null });
        let mode: "select" | "insert" | "update" | "delete" = "select";
        let payload: Record<string, unknown> = {};
        let key = "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {};
        Object.assign(b, {
          insert: (row: Record<string, unknown>) => { mode = "insert"; payload = row; return b; },
          update: (row: Record<string, unknown>) => { mode = "update"; payload = row; return b; },
          delete: () => { mode = "delete"; return b; },
          select: () => b,
          eq: (col: string, val: string) => { if (col === "request_key") key = val; return b; },
          maybeSingle: () => Promise.resolve(
            mode === "select"
              ? { data: { provider_message_id: claims.get(key) ?? null }, error: null }
              : { data: null, error: null },
          ),
          then: (res: (v: unknown) => unknown) => {
            if (mode === "insert") {
              const k = keyOf(payload);
              if (claims.has(k)) return res({ data: null, error: { code: "23505", message: "duplicate key" } });
              claims.set(k, null);
              return res({ data: { id: "claim-1", request_key: k }, error: null });
            }
            if (mode === "update") { claims.set(key, String(payload.provider_message_id)); return res({ data: null, error: null }); }
            if (mode === "delete") { claims.delete(key); return res({ data: null, error: null }); }
            return res({ data: null, error: null });
          },
          catch: () => b,
        });
        return b;
      },
    },
  };
}

Deno.test("IA-047 test action: repetir o mesmo idempotencyKey faz UM único POST e devolve o MESMO id", async () => {
  setDispatchEnv();
  const provider = mockProviderRecording();
  const deps = makeIdempotentTestDeps(makeConnection());
  try {
    const body = {
      action: "test",
      templateContent: "Ola {{nome}}, tudo bem?",
      phone: "+551****0007",
      idempotencyKey: "teste-clique-1",
    };
    const res1 = await handleTalkxSend(makePost({ bearer: TEST_SERVICE_KEY, body }), deps);
    assert(res1.status === 200, `1ª chamada: esperado 200, recebido ${res1.status}`);
    const b1 = await res1.json();
    assert(typeof b1.provider_message_id === "string" && b1.provider_message_id.length > 0,
      `1ª chamada sem provider_message_id: ${JSON.stringify(b1)}`);

    const res2 = await handleTalkxSend(makePost({ bearer: TEST_SERVICE_KEY, body }), deps);
    assert(res2.status === 200, `2ª chamada: esperado 200, recebido ${res2.status}`);
    const b2 = await res2.json();
    assert(b2.provider_message_id === b1.provider_message_id,
      `a repetição devolve o MESMO provider_message_id: ${JSON.stringify(b2)}`);

    const posts = provider.posts.filter((p) => p.url.includes("/message/"));
    assert(posts.length === 1, `repetir o pedido NÃO pode POSTar de novo ao provedor (houve ${posts.length})`);
  } finally {
    provider.restore();
  }
});

Deno.test("IA-047 test action: sem idempotencyKey, o mesmo pedido deriva a MESMA chave (1 POST)", async () => {
  setDispatchEnv();
  const provider = mockProviderRecording();
  const deps = makeIdempotentTestDeps(makeConnection());
  try {
    const body = { action: "test", templateContent: "Ola {{nome}}", phone: "+551****0008" };
    await handleTalkxSend(makePost({ bearer: TEST_SERVICE_KEY, body }), deps);
    await handleTalkxSend(makePost({ bearer: TEST_SERVICE_KEY, body }), deps);

    const posts = provider.posts.filter((p) => p.url.includes("/message/"));
    assert(posts.length === 1, `o hash do pedido tem de deduplicar (houve ${posts.length} POSTs)`);
  } finally {
    provider.restore();
  }
});

// ---------------------------------------------------------------------------
// X025 — ator e motivo pela edge + eventos de conexão/supressão.
// ---------------------------------------------------------------------------

Deno.test("X025 pause: repassa o motivo (p_pause_reason) e o profiles.id do JWT (p_actor_id)", async () => {
  setDispatchEnv();
  const transitionCalls: Array<Record<string, unknown>> = [];
  const deps = {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "auth-user-1" } }, error: null }) },
      rpc(name: string, args: Record<string, unknown> = {}) {
        if (name === "is_admin_or_supervisor") return Promise.resolve({ data: true, error: null });
        if (name === "transition_talkx_campaign") {
          transitionCalls.push(args);
          return Promise.resolve({ data: [{ current_status: "paused" }], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        if (table === "profiles") return thenableQB({ data: { id: "profile-abc" }, error: null });
        return thenableQB({ data: null, error: null });
      },
    },
  };
  const req = makePost({
    bearer: "eyJvalid.admin.token.xx",
    body: { action: "pause", campaignId: CAMPAIGN_ID, reason: "Pausa do operador" },
  });
  const res = await handleTalkxSend(req, deps);
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true, `body inesperado: ${JSON.stringify(body)}`);
  assert(transitionCalls.length === 1, `esperado 1 transição, recebido ${transitionCalls.length}`);
  assert(
    transitionCalls[0].p_pause_reason === "Pausa do operador",
    `p_pause_reason inesperado: ${JSON.stringify(transitionCalls[0])}`,
  );
  assert(
    transitionCalls[0].p_actor_id === "profile-abc",
    `p_actor_id deveria ser o profiles.id resolvido do JWT: ${JSON.stringify(transitionCalls[0])}`,
  );
});

Deno.test("X025 pause: motivo acima de 500 caracteres → 400 e nenhuma transição", async () => {
  setDispatchEnv();
  const transitionCalls: unknown[] = [];
  const deps = {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "auth-user-1" } }, error: null }) },
      rpc(name: string, args: Record<string, unknown> = {}) {
        if (name === "is_admin_or_supervisor") return Promise.resolve({ data: true, error: null });
        if (name === "transition_talkx_campaign") {
          transitionCalls.push(args);
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      from() { return thenableQB({ data: { id: "profile-abc" }, error: null }); },
    },
  };
  const req = makePost({
    bearer: "eyJvalid.admin.token.xx",
    body: { action: "pause", campaignId: CAMPAIGN_ID, reason: "x".repeat(501) },
  });
  const res = await handleTalkxSend(req, deps);
  assert(res.status === 400, `esperado 400, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "reason_too_long", `body inesperado: ${JSON.stringify(body)}`);
  assert(transitionCalls.length === 0, "motivo inválido não pode chamar a transição");
});

Deno.test("X025 start: queda de conexão pausa e grava 1 connection_failed com o status lido", async () => {
  setDispatchEnv();
  const events: Array<Record<string, unknown>> = [];
  const transitionCalls: Array<Record<string, unknown>> = [];
  let connectionReads = 0;
  const deps = {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: new Error("") }) },
      rpc(name: string, args: Record<string, unknown> = {}) {
        if (name === "transition_talkx_campaign") {
          transitionCalls.push(args);
          return Promise.resolve({ data: [{ current_status: "paused" }], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        if (table === "talkx_campaigns") return thenableQB({ data: makeCampaign(), error: null });
        if (table === "whatsapp_connections") {
          connectionReads++;
          // 1ª leitura: o filtro status='connected' não acha nada (queda).
          // 2ª leitura (readConnectionStatus): devolve o status ATUAL.
          return connectionReads === 1
            ? thenableQB({ data: null, error: null })
            : thenableQB({ data: { status: "disconnected" }, error: null });
        }
        if (table === "talkx_campaign_events") return makeEventRecordingQB(events);
        if (table === "talkx_settings") return thenableQB({ data: [], error: null });
        if (table === "talkx_links") return thenableQB({ data: null, error: null });
        if (table === "contact_custom_fields") return thenableQB({ data: [], error: null });
        return thenableQB({ data: null, error: null });
      },
    },
  };
  const req = makePost({ bearer: TEST_SERVICE_KEY, body: { action: "start", campaignId: CAMPAIGN_ID } });
  const res = await handleTalkxSend(req, deps);
  assert(res.status === 409, `esperado 409, recebido ${res.status}`);
  const connectionFailed = events.filter((e) => e.event_type === "connection_failed");
  assert(connectionFailed.length === 1, `esperado 1 connection_failed, recebido ${connectionFailed.length}`);
  assert(
    String(connectionFailed[0].message).includes("disconnected"),
    `a mensagem deve conter o status lido: ${JSON.stringify(connectionFailed[0])}`,
  );
  assert(
    transitionCalls.some((c) => c.p_pause_reason === "connection_lost"),
    `esperado pausa connection_lost: ${JSON.stringify(transitionCalls)}`,
  );
});

Deno.test("X025 continue: lote com 2 suprimidos → 1 evento agregado skipped_suppressed", async () => {
  setDispatchEnv();
  const clock = installFakeClock(1_700_000_000_000);
  const { deps, ctx } = makeContinueDeps({
    recipients: makeContinueRecipients(2), clock, cronSecret: TEST_CRON_SECRET, suppressAll: true,
  });
  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.blacklisted === 2, `esperado blacklisted:2, recebido ${body.blacklisted}`);
    const suppressed = ctx.events.filter((e) => e.event_type === "skipped_suppressed");
    assert(suppressed.length === 1, `esperado 1 evento agregado, recebido ${suppressed.length}`);
    assert(
      String(suppressed[0].message).includes("2"),
      `a mensagem deve agregar a contagem: ${JSON.stringify(suppressed[0])}`,
    );
    assert(messagePosts(provider.posts).length === 0, "suprimido não pode POSTar ao provedor");
  } finally {
    provider.restore();
    clock.restore();
  }
});
