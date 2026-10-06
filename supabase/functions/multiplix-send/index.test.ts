import { handleMultiplixSend, personalize } from './index.ts';
import { resolveBlockContent } from '../_shared/multiplix-content.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('personalize resolve {{empresa}} com o nome da empresa', () => {
  const result = personalize('Ola, aqui é da {{empresa}}', { company: 'Empresa Teste' }).text;
  assert(result === 'Ola, aqui é da Empresa Teste', `unexpected result: ${result}`);
});

Deno.test('personalize resolve {{saudacao}} para um período válido do dia', () => {
  // getGreeting() usa a hora real — só valida que retorna uma das 3 saudações
  // esperadas, sem travar o teste a um horário fixo de execução do CI.
  const result = personalize('{{saudacao}}, {{empresa}}!', { company: 'Acme' }).text;
  const validGreetings = ['Bom dia, Acme!', 'Boa tarde, Acme!', 'Boa noite, Acme!'];
  assert(validGreetings.includes(result), `unexpected greeting result: ${result}`);
});

Deno.test('personalize mantém o texto byte a byte E reporta {{empresa}} sem valor em missing (MX06)', () => {
  // O kernel NÃO muda de semântica: built-in sem valor continua resolvendo o
  // TEXTO para '' — a novidade do MX06 é que o worker passa a consumir o
  // relatório e pula o destinatário em vez de mandar a lacuna. Este teste só
  // existe para fixar as duas metades do contrato do kernel.
  const result = personalize('Empresa: {{empresa}}', {});
  assert(result.text === 'Empresa: ', `unexpected result: ${result.text}`);
  assert(result.missing.includes('empresa'), `missing deveria conter empresa: ${JSON.stringify(result.missing)}`);
});

Deno.test('personalize usa fallback [variavel] para placeholder fora do conjunto fixo (nunca lança)', () => {
  // MUDANÇA DE POLÍTICA do F37 (o caso que o plano manda corrigir): o kernel
  // NUNCA lança unknown_placeholder. Uma variável sem valor — {{cargo}}, que o
  // Multiplix não resolve — vira "[cargo]" em vez de derrubar o envio do
  // destinatário inteiro. O dialeto antigo (personalizeMultiplix) lançava.
  const result = personalize('Seu cargo é {{cargo}}', { company: 'Acme' }).text;
  assert(result === 'Seu cargo é [cargo]', `unexpected result: ${result}`);
});

Deno.test('personalize é case-insensitive nos placeholders conhecidos', () => {
  const result = personalize('{{SAUDACAO}}, {{Empresa}}!', { company: 'Acme' }).text;
  const validGreetings = ['Bom dia, Acme!', 'Boa tarde, Acme!', 'Boa noite, Acme!'];
  assert(validGreetings.includes(result), `unexpected greeting result: ${result}`);
});

// ---------------------------------------------------------------------------
// handleMultiplixSend — autenticação (F06/F07) e motor de envio (F09/F11a/F17)
// ---------------------------------------------------------------------------

const TEST_CRON_SECRET = "cron-secret-test-64chars-for-timing-safe-comparison-xxxxxxxxxxxx";
const TEST_SERVICE_KEY = "eyJtest.servicekey.forauth";
const TEST_JWT = "eyJvalid.user.token.xx";

function makePost(opts: {
  cronSecret?: string;
  bearer?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

interface DispatchRow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function dispatchRow(overrides: DispatchRow = {}): DispatchRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Disparo",
    message_template: "Ola {{empresa}}",
    status: "sending",
    created_by: "profile-me",
    whatsapp_connection_id: "conn-0001",
    total_recipients: 0,
    sent_count: 0,
    failed_count: 0,
    send_interval_min: 0,
    send_interval_max: 0,
    typing_delay_min: 0,
    typing_delay_max: 0,
    send_window_start: null,
    send_window_end: null,
    business_hours_only: false,
    speed_profile: "normal",
    schedule_timezone: "America/Sao_Paulo",
    media_url: null,
    media_type: null,
    scheduled_at: null,
    ...overrides,
  };
}

function recipientRow(index: number, phone: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id: `recipient-${index}`,
    dispatch_id: "00000000-0000-0000-0000-000000000001",
    company_id: `company-${index}`,
    company_name_snapshot: `Empresa ${index}`,
    destino_e164: phone,
    destino_origem: "singu",
    status: "pending",
    attempt_count: 0,
    retry_after: null,
    personalized_message: null,
    // F48/MX06: mapa de campos customizados congelado no confirm — o MESMO
    // insumo que o validate alimenta ao personalize.
    variables_snapshot: {},
    created_at: new Date(Date.now() + index).toISOString(),
    ...overrides,
  };
}

interface MockOpts {
  cronVaultResult?: string | null;
  cronVaultError?: boolean;
  authUser?: { id: string } | null;
  authUserError?: boolean;
  /** resposta de is_admin_or_supervisor (F07) */
  isAdminOrSupervisor?: boolean;
  /** resposta de user_has_permission('multiplix.dispatch.manage_all') (F06) */
  manageAll?: boolean;
  /** perfil (profiles.id) do usuario do JWT — e o que casa com created_by */
  ownProfileId?: string;
  dispatch?: DispatchRow | null;
  connection?: { id: string; status: string; instance_id: string } | null;
  recipients?: Array<ReturnType<typeof recipientRow>>;
  /** telefones que a lista negra responde como suprimidos (F09) */
  suppressedPhones?: string[];
  /** F09: simula opt-out que chega ENTRE o claim e o POST (1a checagem false, 2a true) */
  suppressAfterFirstCheck?: boolean;
  /** Auditoria adversarial 29/09: supressao detectada SOMENTE na 1a checagem
   * (o 1o ponto tem de barrar sozinho) — mata o mutante M08. */
  suppressOnlyFirstCheck?: boolean;
  /** Auditoria adversarial 29/09: a RPC de supressao responde ERRO — o envio
   * tem de seguir fail-closed (mata o fail-open do mutante M25). */
  suppressionRpcError?: boolean;
  blockContent?: Record<string, unknown>;
  /** MX02: `block_type` do bloco devolvido no detalhe do item (default "text") */
  blockType?: string;
  /** MX02: `variables_snapshot` do destinatario (variaveis congeladas do item) */
  variablesSnapshot?: Record<string, string>;
  /** MX02: `multiplix_delivery_items.personalized_message` — snapshot DO ITEM */
  itemPersonalizedMessage?: string | null;
  /** F65: `multiplix_delivery_items.voice_asset_id` — ativo de voz DO ITEM (personalizado) */
  itemVoiceAssetId?: string | null;
  /** F65: `multiplix_blocks.asset_id` — ativo de voz compartilhado (same_audio) */
  blockAssetId?: string | null;
  /** F65: `personalization_mode` do bloco ("same_audio" consome o asset_id do bloco) */
  blockPersonalizationMode?: string | null;
  /** F65: linhas de `multiplix_voice_assets` por id (caminho no bucket + invalidated_at) */
  voiceAssets?: Record<string, { caminho: string | null; invalidated_at?: string | null }>;
  /** MX02/F70: a RPC que grava o snapshot falha (erro transitorio do banco) */
  snapshotRpcError?: boolean;
  /** cota diaria restante da conexao (F17); null desliga a checagem */
  dailyRemaining?: number | null;
  /** F11a: reivindicacao que nao devolve token (lease de outro worker) */
  claimReturnsNothing?: boolean;
  /** F10: a janela de envio fecha logo depois do start (disparo em andamento) */
  windowClosesAfterStart?: boolean;
  /** MX07: resposta da RPC get_instance_token (null = instância sem token cadastrado) */
  instanceToken?: string | null;
}

interface MockCtx {
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  limits: number[];
  completions: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  /** MX02/F69: itens devolvidos a fila no backoff pre-dispatch */
  reschedules: Array<Record<string, unknown>>;
  /** MX02/F69: itens que estouraram o teto de tentativas (dead-letter do reschedule) */
  deadLettered: Array<Record<string, unknown>>;
  /** F65: chamadas ao sign do Storage (`createSignedUrl`) — bucket, path e ttl pedidos */
  signCalls: Array<{ bucket: string; path: string; ttl: number }>;
  dispatch: DispatchRow | null;
  remaining: Array<ReturnType<typeof recipientRow>>;
  recipientSelects: number;
  suppressionChecks: number;
}

// Chainable query builder: a cadeia devolve o proprio builder e o builder e
// "thenable", entao `await supabase.from(t).select().eq()...` resolve pelo
// conteudo da tabela mockada (como o PostgREST devolveria).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableBuilder(table: string, opts: MockOpts, ctx: MockCtx): any {
  let limit: number | null = null;
  // F65: a busca do ativo de voz filtra por id (.eq) — o builder grava os filtros
  // para a tabela devolver a linha CERTA (as demais ignoram, como antes).
  const eqFilters: Array<[string, unknown]> = [];
  // F61: o worker grava o codigo cru do provedor na trilha de eventos. Sem capturar aqui,
  // o insert cairia no vazio e o teste passaria sem provar nada (teste decorativo).
  if (table === "multiplix_events") {
    return {
      insert: (row: Record<string, unknown>) => {
        ctx.events.push(row);
        return Promise.resolve({ data: null, error: null });
      },
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (): { data: any; error: any } => {
    if (table === "multiplix_dispatches") return { data: ctx.dispatch, error: null };
    if (table === "multiplix_recipients") {
      ctx.recipientSelects++;
      // Rede de seguranca do teste: sem o "passada sem reivindicacao encerra o
      // laco" o worker re-seleciona a mesma fila para sempre e o teste ficaria
      // pendurado (o laco vive de promessas ja resolvidas, sem ceder ao timer).
      // Estourar aqui faz o teste FALHAR em vez de travar o CI.
      if (ctx.recipientSelects > 12) throw new Error("laco do worker nao encerrou (selecoes repetidas)");
      return { data: ctx.remaining.slice(0, limit ?? 1000), error: null };
    }
    // F55: o worker nao le mais item por SELECT — a escolha vem da RPC
    // list_multiplix_claimable_items. Esta leitura existe so para os detalhes de envio
    // (destino, nome da empresa, conteudo do bloco), e o stub devolve o destinatario da
    // fila embrulhado nos dois relacionamentos, que e a forma que o worker consome.
    if (table === "multiplix_delivery_items") {
      const alvo = ctx.remaining[0];
      if (!alvo) return { data: null, error: null };
      return {
        data: {
          id: `item-${String(alvo.id)}`,
          recipient_id: alvo.id,
          block_id: "block-1",
          attempt_count: alvo.attempt_count ?? 0,
          status: "sending",
          // MX02: o snapshot da mensagem e do ITEM (um destinatario tem N itens),
          // nao do recipient — ler o do recipient perderia os blocos 2..N.
          personalized_message: opts.itemPersonalizedMessage ?? null,
          // F65: o ativo de voz personalizado e do ITEM (um por destinatario) —
          // same_audio lera o asset_id do BLOCO, compartilhado entre todos.
          voice_asset_id: opts.itemVoiceAssetId ?? null,
          recipient: { ...alvo, variables_snapshot: opts.variablesSnapshot ?? alvo.variables_snapshot ?? null },
          // MX02: o conteudo do envio vem do BLOCO do item. O default espelha o
          // template do disparo do mock, para o cenario legado "bloco == template".
          block: {
            id: "block-1",
            block_order: 0,
            block_type: opts.blockType ?? "text",
            content: opts.blockContent ?? { text: opts.dispatch?.message_template ?? "Ola {{empresa}}" },
            personalization_mode: opts.blockPersonalizationMode ?? null,
            content_version: 1,
            asset_id: opts.blockAssetId ?? null,
          },
        },
        error: null,
      };
    }
    // F65: o ativo de voz e lido por id (select + eq + maybeSingle). Devolve a
    // linha mockada para o id pedido; sem linha, null — o banco responderia vazio.
    if (table === "multiplix_voice_assets") {
      const idFilter = eqFilters.filter(([col]) => col === "id").pop()?.[1];
      const row = idFilter === undefined ? null : (opts.voiceAssets?.[String(idFilter)] ?? null);
      return {
        data: row === null ? null : { id: String(idFilter), invalidated_at: null, ...row },
        error: null,
      };
    }
    if (table === "whatsapp_connections") return { data: opts.connection ?? null, error: null };
    if (table === "profiles") return { data: opts.ownProfileId ? { id: opts.ownProfileId } : null, error: null };
    return { data: null, error: null };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: Record<string, any> = {};
  const chain = () => b;
  b.select = chain; b.in = chain; b.is = chain; b.or = chain;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.eq = (col: string, val: unknown) => { eqFilters.push([col, val]); return b as any; };
  b.update = chain; b.insert = chain; b.order = chain; b.delete = chain;
  b.limit = (n: number) => { limit = n; ctx.limits.push(n); return b; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.single = () => Promise.resolve(rows() as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.maybeSingle = () => Promise.resolve(rows() as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.then = (onFulfilled: any, onRejected: any) => Promise.resolve(rows()).then(onFulfilled, onRejected);
  return b;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockDeps(opts: MockOpts, ctx: MockCtx): any {
  return {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      rpc(name: string, args: Record<string, unknown> = {}) {
        ctx.rpcCalls.push({ name, args });
        switch (name) {
          case "get_multiplix_cron_secret":
            if (opts.cronVaultError) return Promise.resolve({ data: null, error: new Error("vault rpc failed") });
            return Promise.resolve({ data: opts.cronVaultResult ?? null, error: null });
          case "is_admin_or_supervisor":
            return Promise.resolve({ data: opts.isAdminOrSupervisor === true, error: null });
          case "user_has_permission":
            return Promise.resolve({ data: opts.manageAll === true, error: null });
          case "transition_multiplix_dispatch": {
            // Espelha o efeito no estado do mock para o motor enxergar a
            // transicao seguinte (ex.: pause -> 'paused').
            if (ctx.dispatch && args.p_action === "pause") ctx.dispatch = { ...ctx.dispatch, status: "paused" };
            if (ctx.dispatch && args.p_action === "start") {
              ctx.dispatch = { ...ctx.dispatch, status: "sending" };
              if (opts.windowClosesAfterStart) {
                // Janela malformada = recusa garantida em qualquer horario.
                ctx.dispatch = { ...ctx.dispatch, send_window_start: "8h", send_window_end: "18h" };
              }
            }
            return Promise.resolve({ data: [{ current_status: ctx.dispatch?.status ?? null }], error: null });
          }
          // F55: a ESCOLHA vem daqui. Devolve a fila embrulhada como item — o id do item e
          // derivado do id do destinatario para o resto do stub continuar casando.
          case "list_multiplix_claimable_items":
            // O tamanho do lote agora e o p_limit desta RPC, nao um .limit() de SELECT. As
            // assercoes do F11a (que sempre perguntaram "qual o tamanho do lote") continuam
            // valendo sem reescrita porque o stub registra o mesmo valor no mesmo lugar.
            ctx.limits.push(Number(args.p_limit ?? 20));
            ctx.recipientSelects++;
            if (ctx.recipientSelects > 12) throw new Error("laco do worker nao encerrou (selecoes repetidas)");
            // claimReturnsNothing e sobre o CLAIM, nao sobre a lista: a fila existe (o worker
            // tenta reivindicar), mas outro worker levou o item. Antes do F55 isso caia no
            // SELECT; agora a lista entrega e o claim e que recusa.
            return Promise.resolve({
              data: ctx.remaining.slice(0, Number(args.p_limit ?? 20)).map((r) => ({
                item_id: `item-${String(r.id)}`,
                recipient_id: r.id,
                block_id: "block-1",
                block_order: 0,
                company_id: r.company_id,
                attempt_count: r.attempt_count ?? 0,
                next_attempt_at: null,
              })),
              error: null,
            });
          case "claim_multiplix_item":
            if (opts.claimReturnsNothing) return Promise.resolve({ data: [], error: null });
            // Fiel ao banco (f32b §2): o claim INCREMENTA attempt_count do item —
            // e o valor que o reschedule le para decidir o dead-letter em >= 3.
            {
              const claimedId = String(args.p_item_id).replace(/^item-/, "");
              const row = ctx.remaining.find((r) => r.id === claimedId);
              if (row) row.attempt_count = (row.attempt_count ?? 0) + 1;
            }
            return Promise.resolve({ data: [{ claim_token: `claim-${String(args.p_item_id)}` }], error: null });
          case "persist_multiplix_item_message_snapshot":
            // Fiel ao banco: a RPC grava o texto e devolve a string personalizada. O stub
            // nao a implementava, entao devolvia undefined e o texto enviado era undefined
            // — invisivel enquanto o POST nao validava; o adaptador (F56) valida.
            // MX02/F70: erro TRANSITORIO do RPC injetavel — prova que ele nao e engolido
            // pelo catch da resolucao (que encerraria o item como 'failed').
            if (opts.snapshotRpcError) return Promise.resolve({ data: null, error: new Error("snapshot write failed") });
            return Promise.resolve({ data: String(args.p_personalized_message ?? ""), error: null });
          case "complete_multiplix_item": {
            ctx.completions.push(args);
            const id = String(args.p_item_id).replace(/^item-/, "");
            ctx.remaining = ctx.remaining.filter((r) => r.id !== id);
            return Promise.resolve({ data: true, error: null });
          }
          case "record_multiplix_item_sent": {
            // Espelha o efeito no banco: quem foi enviado sai da fila de
            // 'pending' (sem isso o worker re-seleciona o mesmo destinatario e a
            // rede de seguranca do mock derruba o teste por laco infinito).
            const id = String(args.p_item_id).replace(/^item-/, "");
            ctx.remaining = ctx.remaining.filter((r) => r.id !== id);
            return Promise.resolve({ data: true, error: null });
          }
          case "talkx_recipient_is_suppressed": {
            ctx.suppressionChecks++;
            if (opts.suppressionRpcError) {
              // Auditoria adversarial: erro/invalidacao da RPC de supressao — o
              // worker precisa falhar fechado (nao enviar), nunca liberar envio.
              return Promise.resolve({ data: null, error: new Error("suppression rpc failed") });
            }
            const listed = (opts.suppressedPhones ?? []).includes(String(args.p_phone ?? ""));
            const suppress = opts.suppressOnlyFirstCheck
              ? ctx.suppressionChecks === 1
              : opts.suppressAfterFirstCheck ? ctx.suppressionChecks > 1 || listed : listed;
            return Promise.resolve({ data: suppress, error: null });
          }
          case "get_instance_token":
            // MX07: devolve o token DA instancia pedida (o args fica gravado em
            // rpcCalls — o teste confere se o worker pediu o da conexao selecionada).
            return Promise.resolve({
              data: opts.instanceToken === undefined ? "tok-instancia-teste" : opts.instanceToken,
              error: null,
            });
          case "multiplix_connection_daily_usage": {
            const remaining = opts.dailyRemaining ?? 500;
            return Promise.resolve({ data: { limit: 500, sent: 500 - remaining, remaining }, error: null });
          }
          case "reschedule_multiplix_item": {
            // Fiel ao banco (f32b §7): o reschedule NAO incrementa attempt_count
            // (o claim ja subiu esta tentativa) e devolve dead_lettered em
            // `attempt_count >= 3` — o item vira 'failed' e NUNCA volta a fila.
            // Abaixo do teto ele volta com `next_attempt_at` no futuro; nas duas
            // saidas ele sai da fila DESTA passada (sem isso o stub giraria o
            // laco contra a fila).
            ctx.reschedules.push(args);
            const itemId = String(args.p_item_id).replace(/^item-/, "");
            const row = ctx.remaining.find((r) => r.id === itemId);
            const attempt = row?.attempt_count ?? 0;
            ctx.remaining = ctx.remaining.filter((r) => r.id !== itemId);
            if (attempt >= 3) {
              ctx.deadLettered.push(args);
              return Promise.resolve({ data: { action: "dead_lettered", attempt }, error: null });
            }
            return Promise.resolve({ data: { action: "rescheduled", attempt }, error: null });
          }
          default:
            return Promise.resolve({ data: true, error: null });
        }
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
        return tableBuilder(table, opts, ctx);
      },
      // F65: a URL enviada e ASSINADA pelo mecanismo privado (resolvePrivateBucketUrl
      // -> storage.from(bucket).createSignedUrl). O stub devolve a forma real do
      // Supabase e grava a chamada — o teste prova bucket e path pedidos.
      storage: {
        from(bucket: string) {
          return {
            createSignedUrl(path: string, ttl: number) {
              ctx.signCalls.push({ bucket, path, ttl });
              return Promise.resolve({
                data: {
                  signedUrl: `https://stub.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=sig-teste`,
                },
                error: null,
              });
            },
          };
        },
      },
    },
  };
}

function newCtx(opts: MockOpts): MockCtx {
  const dispatch = opts.dispatch === undefined ? dispatchRow() : opts.dispatch;
  // Sem conexao conectada o worker encerra com 409 antes de chegar no laco;
  // o default do mock e uma conexao viva para os testes do motor de envio.
  if (opts.connection === undefined) {
    opts.connection = { id: "conn-0001", status: "connected", instance_id: "instance-abc" };
  }
  return {
    rpcCalls: [],
    events: [],
    limits: [],
    completions: [],
    reschedules: [],
    deadLettered: [],
    dispatch,
    remaining: [...(opts.recipients ?? [])],
    recipientSelects: 0,
    suppressionChecks: 0,
    signCalls: [],
  };
}

// Stub do fetch para provar que nenhum POST de mensagem sai para o provedor.
function stubProviderFetch() {
  const urls: string[] = [];
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = ((input: any) => {
    urls.push(typeof input === "string" ? input : String(input?.url ?? input));
    return Promise.reject(new Error("provedor nao pode ser chamado neste teste"));
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    urls,
    messagePosts: () =>
      urls.filter((url) => url.includes("/message/") && !url.includes("presence")).length,
    restore: () => { globalThis.fetch = original; },
  };
}

function rpcs(ctx: MockCtx, name: string) {
  return ctx.rpcCalls.filter((call) => call.name === name);
}

/** Roda o handler com o provedor BLOQUEADO (qualquer POST derruba o teste) e
 * devolve o contexto do mock — evita repetir o mesmo try/finally em cada caso. */
async function runWithProviderBlocked(opts: MockOpts): Promise<{ ctx: MockCtx; providerPosts: number }> {
  const ctx = newCtx(opts);
  const provider = stubProviderFetch();
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    return { ctx, providerPosts: provider.messagePosts() };
  } finally {
    provider.restore();
  }
}

/** Provedor respondendo com sucesso (v2 devolve key.id): permite exercitar o
 * caminho de envio concluido sem rede — e o unico jeito de a cota diaria ser
 * consumida, ja que ela so cai no envio que conclui. */
/** PNG 1x1: bytes magicos reais para o prepareMedia (F40) reconhecer o tipo. */
const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

/** Provedor que responde JSON de sucesso E serve bytes quando a URL e a midia do teste. */
/** Bytes magicos de PDF (%PDF-1.4), para o prepareMedia classificar como documento. */
const PDF_MINIMO = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");

/** Bytes magicos de OGG (OggS), o container das notas de voz. */
const OGG_MINIMO = new Uint8Array([
  0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x1e, 0x01, 0x76, 0x6f, 0x72, 0x62, 0x69,
  0x73, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

function stubProviderComMidia(id = "WAMID-TESTE-1") {
  const urls: string[] = [];
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = ((input: any, initArg?: { body?: string }) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    urls.push(url);
    const init = initArg ?? (input?.init as { body?: string } | undefined);
    if (url.includes("/message/") || url.endsWith("/send/media") || url.endsWith("/send/text")) {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      } catch {
        body = {};
      }
      posts.push({ url, body });
    }
    if (url.includes(".ogg")) {
      return Promise.resolve(
        new Response(OGG_MINIMO, { status: 200, headers: { "content-type": "audio/ogg" } }),
      );
    }
    if (url.includes(".pdf")) {
      return Promise.resolve(
        new Response(PDF_MINIMO, { status: 200, headers: { "content-type": "application/pdf" } }),
      );
    }
    if (url.includes("exemplo.test")) {
      return Promise.resolve(
        new Response(PNG_1X1, { status: 200, headers: { "content-type": "image/png" } }),
      );
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ key: { id } }),
    });
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { urls, posts, restore: () => { globalThis.fetch = original; } };
}

function stubProviderSuccess(id = "WAMID-TESTE-1") {
  const urls: string[] = [];
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = ((input: any) => {
    urls.push(typeof input === "string" ? input : String(input?.url ?? input));
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ key: { id } }),
    });
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    urls,
    restore: () => { globalThis.fetch = original; },
  };
}

/** Provedor que responde sucesso e grava o header apikey de CADA chamada (MX07:
 * prova que a credencial que sai na rede e o token da instancia, nao a key global). */
function stubProviderComApiKey(id = "WAMID-TESTE-1") {
  const calls: { url: string; apikey: string | undefined }[] = [];
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = ((input: any, init?: { headers?: Record<string, string> }) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    calls.push({ url, apikey: init?.headers?.apikey });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ key: { id } }),
    });
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { calls, restore: () => { globalThis.fetch = original; } };
}

/** Opcoes de um disparo em 'sending' com a fila toda suprimida: cada item vira
 * 'skipped' sem POST, o que deixa a drenagem do lote observavel sem provedor. */
function batchSendingOpts(phonePrefix: string, length = 25): MockOpts {
  const recipients = Array.from({ length }, (_, i) => recipientRow(i, `${phonePrefix}${String(i).padStart(4, "0")}`));
  return {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: length }),
    recipients,
    suppressedPhones: recipients.map((r) => String(r.destino_e164)),
  };
}

/** Opcoes base de um disparo em 'draft' visto por um JWT (fluxo de start). */
function startRequestOpts(overrides: Partial<MockOpts> = {}): MockOpts {
  return {
    authUser: { id: "user-000" },
    isAdminOrSupervisor: false,
    manageAll: false,
    ownProfileId: "profile-me",
    dispatch: dispatchRow({ status: "draft", created_by: "profile-me" }),
    ...overrides,
  };
}

/** Roda o handler com um POST autenticado por JWT (start/gestao) e devolve ctx + status. */
async function runWithJwt(opts: MockOpts): Promise<{ ctx: MockCtx; status: number }> {
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ bearer: TEST_JWT }), mockDeps(opts, ctx));
  return { ctx, status: res.status };
}

// ---------------------------------------------------------------- autenticação

Deno.test("auth: x-cron-secret correto → passa auth, chega no 404 de dispatch ausente", async () => {
  const opts: MockOpts = { cronVaultResult: TEST_CRON_SECRET, dispatch: null };
  const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 404, `esperado 404 (auth ok), recebido ${res.status}`);
});

Deno.test("auth: x-cron-secret errado → 401", async () => {
  const opts: MockOpts = { cronVaultResult: TEST_CRON_SECRET };
  const res = await handleMultiplixSend(makePost({ cronSecret: "wrong-secret-value" }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: vault RPC falha → fail-closed → 401 (não vaza secret inválido)", async () => {
  // Se o RPC de vault falhar, isCronAuth deve ficar false → nunca autorizar cron
  const opts: MockOpts = { cronVaultError: true };
  const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 401, `esperado 401 (fail-closed), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: sem Authorization e sem x-cron-secret → 401", async () => {
  const opts: MockOpts = {};
  const res = await handleMultiplixSend(makePost({}), mockDeps(opts, newCtx(opts)));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com service-role key correta → passa auth, chega no 404 de dispatch ausente", async () => {
  const opts: MockOpts = { dispatch: null };
  const res = await handleMultiplixSend(makePost({ bearer: TEST_SERVICE_KEY }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 404, `esperado 404 (auth ok via service key), recebido ${res.status}`);
});

Deno.test("auth: Bearer com JWT inválido (getUser retorna error) → 401", async () => {
  const opts: MockOpts = { authUserError: true };
  const res = await handleMultiplixSend(makePost({ bearer: "eyJinvalid.jwt.token" }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: JWT sem admin/supervisor e sem manage_all → 403", async () => {
  const opts: MockOpts = { authUser: { id: "user-001" }, isAdminOrSupervisor: false, manageAll: false };
  const res = await handleMultiplixSend(makePost({ bearer: TEST_JWT }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Forbidden", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth (F07): JWT com admin E supervisor passa — o papel vem do RPC, não de maybeSingle em user_roles", async () => {
  // Regressao: com as duas roles, .in(['admin','supervisor']).maybeSingle()
  // devolvia 2 linhas, o maybeSingle abortava e o admin+supervisor levava 403.
  const opts: MockOpts = {
    authUser: { id: "user-admin-001" },
    isAdminOrSupervisor: true,
    ownProfileId: "profile-me",
    dispatch: null,
  };
  const mock = mockDeps(opts, newCtx(opts));
  const res = await handleMultiplixSend(makePost({ bearer: TEST_JWT }), mock);
  assert(res.status === 404, `esperado 404 (auth ok), recebido ${res.status}`);
});

Deno.test("auth (F06): JWT sem admin/supervisor mas com multiplix.dispatch.manage_all → passa", async () => {
  const opts: MockOpts = {
    authUser: { id: "user-002" },
    isAdminOrSupervisor: false,
    manageAll: true,
    ownProfileId: "profile-me",
    dispatch: null,
  };
  const res = await handleMultiplixSend(makePost({ bearer: TEST_JWT }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 404, `esperado 404 (auth ok via permissao nomeada), recebido ${res.status}`);
});

// ------------------------------------------------------------------ F06 (dono)

Deno.test("F06: admin pausa/cancela disparo de OUTRO dono → 403 (sem manage_all)", async () => {
  const opts: MockOpts = {
    authUser: { id: "user-003" },
    isAdminOrSupervisor: true,
    manageAll: false,
    ownProfileId: "profile-me",
    dispatch: dispatchRow({ status: "sending", created_by: "profile-outro" }),
  };
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(
    makePost({ bearer: TEST_JWT, body: { dispatchId: "00000000-0000-0000-0000-000000000001", action: "pause" } }),
    mockDeps(opts, ctx),
  );
  assert(res.status === 403, `esperado 403 (disparo de outro dono), recebido ${res.status}`);
  assert(rpcs(ctx, "transition_multiplix_dispatch").length === 0, "nao pode transicionar disparo de outro dono");
});

Deno.test("F06: dono do disparo inicia o proprio disparo → permitido", async () => {
  const { ctx, status } = await runWithJwt(startRequestOpts({ authUser: { id: "user-004" }, isAdminOrSupervisor: true }));
  assert(status === 200, `esperado 200, recebido ${status}`);
  const start = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "start");
  assert(start, "esperava a transicao de start do proprio disparo");
});

Deno.test("F06: manage_all inicia disparo de outro dono → permitido", async () => {
  const { ctx, status } = await runWithJwt(startRequestOpts({
    authUser: { id: "user-005" },
    manageAll: true,
    dispatch: dispatchRow({ status: "draft", created_by: "profile-outro" }),
  }));
  assert(status === 200, `esperado 200 (manage_all), recebido ${status}`);
  const start = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "start");
  assert(start, "esperava a transicao de start com manage_all");
});

Deno.test("F06 (bug 01/10/2026): admin COM multiplix.dispatch.manage_all inicia disparo de OUTRO dono → permitido", async () => {
  // Regressao medida: a permissao nomeada era consultada SO quando
  // is_admin_or_supervisor era falso. Um admin que TINHA a permissao nunca
  // era reconhecido — o gate de papel passava, hasManageAll continuava false e
  // o start no disparo alheio voltava 403.
  const { ctx, status } = await runWithJwt(startRequestOpts({
    authUser: { id: "user-006" },
    isAdminOrSupervisor: true,
    manageAll: true,
    dispatch: dispatchRow({ status: "draft", created_by: "profile-outro" }),
  }));
  assert(status === 200, `esperado 200 (admin com manage_all), recebido ${status}`);
  assert(
    rpcs(ctx, "transition_multiplix_dispatch").some((call) => call.args.p_action === "start"),
    "esperava a transicao de start do disparo alheio com manage_all",
  );
});

// ------------------------------------------------------------------- F09 (opt-out)

Deno.test("F09: destinatário na lista negra vira 'skipped' com motivo, sem POST ao provedor", async () => {
  const phone = "5511988887777";
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending" }),
    recipients: [recipientRow(1, phone)],
    suppressedPhones: [phone],
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  assert(providerPosts === 0, `nenhum POST ao provedor era esperado, houve ${providerPosts}`);
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(ctx.completions[0].p_status === "skipped", `status esperado 'skipped', veio ${ctx.completions[0].p_status}`);
  assert(
    ctx.completions[0].p_error_message === "Contato na lista negra (opt-out)",
    `motivo inesperado: ${ctx.completions[0].p_error_message}`,
  );
});

// ------------------------------------------------------------------- F11a (lote)

Deno.test("F11a: uma invocacao processa UM lote (MULTIPLIX_BATCH_SIZE) e devolve a vez ao cron", async () => {
  // Contrato alterado em 01/10/2026: antes o `passLoop: for(;;)` drenava o
  // publico inteiro numa unica invocacao — a edge ficava aberta por horas (e
  // estourava o limite de tempo). Agora cada invocacao processa UM lote e
  // retorna; o cron `multiplix-send-trigger` (a cada 2 min) reinvoca.
  const opts = batchSendingOpts("551190000");
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
  const body = await res.json();
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(body.total === 20, `total esperado 20 (um lote de 25 disponiveis), veio ${body.total}`);
  assert(ctx.completions.length === 20, `esperava 20 conclusoes, recebeu ${ctx.completions.length}`);
  assert(ctx.limits.length === 1, `esperava 1 unica selecao limitada, houve ${ctx.limits.length}`);
  assert(ctx.limits[0] === 20, `lote default deveria ser 20, veio ${JSON.stringify(ctx.limits)}`);
  // Nao afirmamos body.completed aqui: o mock devolve true fixo para
  // complete_multiplix_dispatch_if_drained — quem decide "concluido" e a funcao
  // SQL, coberta pelos testes da F13. O que prova o lote unico e o teto de 20
  // conclusoes acima, com 25 itens disponiveis na fila.
});

Deno.test("F11a: MULTIPLIX_BATCH_SIZE muda o tamanho do lote", async () => {
  const opts = batchSendingOpts("551191111");
  const ctx = newCtx(opts);
  Deno.env.set("MULTIPLIX_BATCH_SIZE", "5");
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    Deno.env.delete("MULTIPLIX_BATCH_SIZE");
  }
  assert(ctx.completions.length === 5, `esperava 5 conclusoes (um lote), recebeu ${ctx.completions.length}`);
  assert(ctx.limits.length === 1, `esperava 1 unica selecao limitada, houve ${ctx.limits.length}`);
  assert(ctx.limits[0] === 5, `lote esperado 5, veio ${JSON.stringify(ctx.limits)}`);
});

// ---------------------------------------------------------- F17 (cota diária)

Deno.test("F17: sem cota diária sobrando o disparo é pausado com motivo 'daily_limit'", async () => {
  const phone = "5511977776666";
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending" }),
    recipients: [recipientRow(1, phone)],
    suppressedPhones: [],
    dailyRemaining: 0,
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  const pause = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "pause");
  assert(pause, "esperava a pausa automatica do disparo");
  assert(pause.args.p_pause_reason === "daily_limit", `motivo esperado 'daily_limit', veio ${pause.args.p_pause_reason}`);
  assert(rpcs(ctx, "claim_multiplix_item").length === 0, "nao deveria reivindicar destinatario sem cota");
  assert(providerPosts === 0, `nenhum POST ao provedor era esperado, houve ${providerPosts}`);
});

Deno.test("F17: com cota sobrando o disparo segue (não pausa por cota)", async () => {
  const phone = "5511966665555";
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending" }),
    recipients: [recipientRow(1, phone)],
    suppressedPhones: [phone],
    dailyRemaining: 10,
  };
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const quotaPause = rpcs(ctx, "transition_multiplix_dispatch")
    .find((call) => call.args.p_action === "pause" && call.args.p_pause_reason === "daily_limit");
  assert(!quotaPause, "nao deveria pausar por cota diaria com espaco disponivel");
  assert(rpcs(ctx, "claim_multiplix_item").length === 1, "esperava reivindicar o destinatario");
});

Deno.test("F17: a cota da conexão é consumida por envio concluído (1 enviado, depois pausa o lote)", async () => {
  // Cota de 1 e dois destinatarios na mesma passada: o primeiro envio conclui e
  // consome a cota; o segundo tem de encontrar dailyRoom <= 0 e virar pausa por
  // daily_limit — sem reivindicar (nao queima destinatario).
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 2 }),
    recipients: [recipientRow(1, "5511944443333"), recipientRow(2, "5511944442222")],
    suppressedPhones: [],
    dailyRemaining: 1,
  };
  const ctx = newCtx(opts);
  const provider = stubProviderSuccess();
  // MX07: o worker agora resolve e passa o instanceToken da conexao — o caminho
  // go (o default do projeto) voltou a ser testavel e e o que este teste exercita.
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
    provider.restore();
  }
  assert(
    rpcs(ctx, "record_multiplix_item_sent").length === 1,
    `esperava 1 envio concluido, houve ${rpcs(ctx, "record_multiplix_item_sent").length}`,
  );
  const pause = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "pause");
  assert(pause, "esperava pausa por cota depois de consumir o unico envio do dia");
  assert(pause.args.p_pause_reason === "daily_limit", `motivo esperado 'daily_limit', veio ${pause.args.p_pause_reason}`);
  assert(
    rpcs(ctx, "claim_multiplix_item").length === 1,
    `esperava 1 reivindicacao (a cota acaba depois dela), houve ${rpcs(ctx, "claim_multiplix_item").length}`,
  );
});

// ------------------------------------------------------ MX07 (token da instancia)
// O worker tem de resolver o token DA instancia selecionada (get_instance_token,
// mesmo padrao do talkx-send) e enviar com ele no header apikey — nunca com a
// key global nem com o token de outra instancia.

Deno.test("MX07: o worker resolve o token da instância selecionada e envia com ele (nunca a key global)", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  const keyAnterior = Deno.env.get("EVOLUTION_API_KEY");
  const tokenEnvAnterior = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
  // Em 'go' a rota de envio e auth=instance: o header apikey tem de ser o token
  // da instancia, resolvido por get_instance_token — a key global e de admin.
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  Deno.env.set("EVOLUTION_API_KEY", "admin-key-teste");
  Deno.env.delete("EVOLUTION_INSTANCE_TOKEN");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550100")],
    instanceToken: "tok-instancia-xyz",
  };
  const ctx = newCtx(opts);
  const provider = stubProviderComApiKey();
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
    if (keyAnterior === undefined) Deno.env.delete("EVOLUTION_API_KEY");
    else Deno.env.set("EVOLUTION_API_KEY", keyAnterior);
    if (tokenEnvAnterior !== undefined) Deno.env.set("EVOLUTION_INSTANCE_TOKEN", tokenEnvAnterior);
  }
  const tokenCalls = rpcs(ctx, "get_instance_token");
  assert(tokenCalls.length === 1, `esperava 1 resolucao de token, houve ${tokenCalls.length}`);
  assert(
    tokenCalls[0].args.p_instance_id === "instance-abc",
    `token resolvido para a instancia errada: ${String(tokenCalls[0].args.p_instance_id)}`,
  );
  // So as chamadas ao Evolution contam: com SUPABASE_URL setada (outros testes da
  // suite setam, env e global) o rate-limiter persistente faz um fetch proprio.
  const chamadasGo = provider.calls.filter((c) =>
    c.url.includes("/send/") || c.url.includes("/message/") || c.url.includes("/chat/")
  );
  const envios = chamadasGo.filter((c) => c.url.endsWith("/send/text"));
  assert(envios.length === 1, `esperava 1 POST /send/text, veio ${JSON.stringify(chamadasGo.map((c) => c.url))}`);
  assert(
    envios[0].apikey === "tok-instancia-xyz",
    `apikey esperada 'tok-instancia-xyz', veio '${envios[0].apikey}'`,
  );
  // Presenca e envio saem com a MESMA identidade: nenhuma chamada leva a key global.
  assert(
    chamadasGo.every((c) => c.apikey === "tok-instancia-xyz"),
    `todas as chamadas ao GO tem de levar o token da instancia: ${JSON.stringify(chamadasGo)}`,
  );
  // Sao 2 presencas: a pre-envio do worker (acima) e a do proprio adaptador no
  // send — antes da correcao so a do adaptador saia (a do worker morria no 400
  // do evoFetch por falta de instanceToken).
  const presencas = chamadasGo.filter((c) => c.url.endsWith("/message/presence"));
  assert(
    presencas.length === 2,
    `a presenca pre-envio tem de sair com a identidade da instancia: ${JSON.stringify(chamadasGo.map((c) => c.url))}`,
  );
  assert(
    presencas.every((c) => c.apikey === "tok-instancia-xyz"),
    `presenca com credencial errada: ${JSON.stringify(presencas)}`,
  );
});

Deno.test("MX07: instância sem token pausa com 'connection_lost' e nenhum POST sai (fail-closed)", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  const nameAnterior = Deno.env.get("EVOLUTION_INSTANCE_NAME");
  const tokenAnterior = Deno.env.get("EVOLUTION_INSTANCE_TOKEN");
  // Instancia NAO-padrao sem token cadastrado: sem fallback de transicao, a
  // unica saida segura e pausar — enviar com a key global seria o defeito do MX07.
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  Deno.env.delete("EVOLUTION_INSTANCE_NAME");
  Deno.env.delete("EVOLUTION_INSTANCE_TOKEN");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550101")],
    instanceToken: null,
  };
  const ctx = newCtx(opts);
  const provider = stubProviderComApiKey();
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
    if (nameAnterior !== undefined) Deno.env.set("EVOLUTION_INSTANCE_NAME", nameAnterior);
    if (tokenAnterior !== undefined) Deno.env.set("EVOLUTION_INSTANCE_TOKEN", tokenAnterior);
  }
  const pause = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "pause");
  assert(pause, "instancia sem token tem de pausar o disparo");
  assert(
    pause.args.p_pause_reason === "connection_lost",
    `motivo esperado 'connection_lost', veio ${String(pause.args.p_pause_reason)}`,
  );
  // Nenhuma chamada ao EVOLUTION pode sair sem o token da instancia (o fetch do
  // rate-limiter vai para o Supabase e nao conta aqui).
  const chamadasGo = provider.calls.filter((c) =>
    c.url.includes("/send/") || c.url.includes("/message/") || c.url.includes("/chat/")
  );
  assert(
    chamadasGo.length === 0,
    `nenhuma chamada ao provedor pode sair sem o token da instancia: ${JSON.stringify(chamadasGo)}`,
  );
  assert(rpcs(ctx, "record_multiplix_item_sent").length === 0, "nada pode ser marcado como enviado");
  // O item ja reivindicado volta para a fila (release), nao some numa quarentena.
  assert(rpcs(ctx, "release_multiplix_item_claim").length === 1, "o item tem de ser devolvido a fila");
});

// ------------------------------------------------------------------- F10 (janela)

Deno.test("F10: start fora da janela não dispara nada (ok:false, sem pausa e sem claim)", async () => {
  // "8h" nao e HH:MM: o helper falha FECHADO (recusa). Antes do laco o worker
  // devolve ok:false com o motivo — o disparo nem sai de 'draft'/'scheduled'.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", send_window_start: "8h", send_window_end: "18h" }),
    recipients: [recipientRow(1, "5511922221111")],
    suppressedPhones: [],
  };
  const ctx = newCtx(opts);
  const provider = stubProviderFetch();
  let body: { ok?: boolean; reason?: string } = {};
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    body = await res.json();
  } finally {
    provider.restore();
  }
  assert(body.ok === false, `esperava ok:false, veio ${JSON.stringify(body)}`);
  assert(body.reason === "outside_send_window", `motivo esperado 'outside_send_window', veio ${body.reason}`);
  assert(rpcs(ctx, "claim_multiplix_item").length === 0, "nao pode reivindicar fora da janela");
  assert(provider.messagePosts() === 0, "nao pode enviar fora da janela");
});

Deno.test("F10: janela que fecha no meio do disparo pausa com motivo 'outside_window'", async () => {
  // O laco refaz a checagem de janela a cada destinatario: se ela fecha durante
  // o disparo, o worker pausa com o motivo que o cron sabe retomar (sem isso o
  // disparo ficava pausado para sempre sem ninguem saber por que).
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending" }),
    recipients: [recipientRow(1, "5511922222222")],
    suppressedPhones: [],
    windowClosesAfterStart: true,
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  const pause = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "pause");
  assert(pause, "esperava pausa quando a janela fecha no meio do disparo");
  assert(pause.args.p_pause_reason === "outside_window", `motivo esperado 'outside_window', veio ${pause.args.p_pause_reason}`);
  assert(rpcs(ctx, "claim_multiplix_item").length === 0, "nao pode reivindicar com a janela fechada");
  assert(providerPosts === 0, "nao pode enviar com a janela fechada");
});

// ------------------------------------------------------------------- F11a (laco)

Deno.test("F11a: passada sem reivindicação encerra o laço (não gira contra a fila)", async () => {
  // Reivindicacao vazia (lease de outro worker) tem de terminar a passada: sem
  // isso o worker re-seleciona a mesma fila indefinidamente contra o banco.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511911110000")],
    claimReturnsNothing: true,
  };
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(
    rpcs(ctx, "claim_multiplix_item").length === 1,
    `esperava 1 tentativa de reivindicacao, houve ${rpcs(ctx, "claim_multiplix_item").length}`,
  );
  assert(
    ctx.recipientSelects === 1,
    `a passada sem reivindicacao deveria encerrar o laco na 1a selecao, houve ${ctx.recipientSelects}`,
  );
});

// --------------------------------------------------- F06 (start) e F09 (janela)

Deno.test("F06: admin sem manage_all inicia disparo de OUTRO dono → 403", async () => {
  const { ctx, status } = await runWithJwt(startRequestOpts({
    authUser: { id: "user-006" },
    isAdminOrSupervisor: true,
    dispatch: dispatchRow({ status: "draft", created_by: "profile-outro" }),
  }));
  assert(status === 403, `esperado 403 (start de disparo de outro dono), recebido ${status}`);
  assert(rpcs(ctx, "transition_multiplix_dispatch").length === 0, "nao pode iniciar disparo de outro dono");
});

Deno.test("F09: opt-out que chega ENTRE o claim e o POST também barra o envio", async () => {
  // Prova que a checagem imediatamente antes do POST existe: a primeira
  // (logo apos o claim) responde 'nao suprimido' e a segunda responde
  // 'suprimido' — o destinatario tem de virar 'skipped' sem POST de mensagem.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending" }),
    recipients: [recipientRow(1, "5511955554444")],
    suppressedPhones: [],
    suppressAfterFirstCheck: true,
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  assert(ctx.suppressionChecks >= 2, `esperava 2 checagens de supressao, houve ${ctx.suppressionChecks}`);
  assert(providerPosts === 0, `nenhum POST /message/ era esperado, houve ${providerPosts}`);
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(ctx.completions[0].p_status === "skipped", `status esperado 'skipped', veio ${ctx.completions[0].p_status}`);
  assert(
    ctx.completions[0].p_error_message === "Contato na lista negra (opt-out)",
    `motivo inesperado: ${ctx.completions[0].p_error_message}`,
  );
});

// ---------------------------------------------------------------------------
// Gaps fechados na auditoria adversarial de 29/09/2026.
// Cada teste abaixo FALHA se o mutante correspondente voltar ao worker — eram
// exatamente os pontos em que a suite ficava verde com o comportamento quebrado
// (27 de 40 mutantes sobreviviam). O id do mutante vive no nome do teste; o
// criterio de morte e por ASSERCAO (ver scripts/db-audit/multiplix-send-mutation.py).
// ---------------------------------------------------------------------------

Deno.test("gap M08: o 1o ponto de supressao barra sozinho (nao basta contar checagens)", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550001")],
    suppressOnlyFirstCheck: true,
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  assert(providerPosts === 0, `supressao do 1o ponto nao pode gerar POST /message/, houve ${providerPosts}`);
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(
    ctx.completions[0].p_status === "skipped",
    `status esperado 'skipped' (barrado no 1o ponto), veio ${ctx.completions[0].p_status}`,
  );
});

Deno.test("gap M13: a cota diaria e consultada com o connection_id da conexao do dispatch", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", whatsapp_connection_id: "conn-0001", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550002")],
  };
  const { ctx } = await runWithProviderBlocked(opts);
  const calls = rpcs(ctx, "multiplix_connection_daily_usage");
  assert(calls.length >= 1, "o worker nao consultou a cota diaria da conexao");
  assert(
    calls[0].args.p_connection_id === "conn-0001",
    `cota consultada com connection_id '${String(calls[0].args.p_connection_id)}' em vez do dispatch`,
  );
});

Deno.test("gap M16/M18: MULTIPLIX_BATCH_SIZE hostil nao fura o teto de 200 nem o default 20", async () => {
  const anterior = Deno.env.get("MULTIPLIX_BATCH_SIZE");
  try {
    Deno.env.set("MULTIPLIX_BATCH_SIZE", "999999999");
    const { ctx: ctxAlto } = await runWithProviderBlocked(batchSendingOpts("551195556"));
    assert(ctxAlto.limits.length >= 1, "o worker nao selecionou lote (nenhum .limit() observado)");
    assert(
      Math.max(...ctxAlto.limits) === 200,
      `teto esperado 200 com MULTIPLIX_BATCH_SIZE=999999999, veio ${Math.max(...ctxAlto.limits)}`,
    );

    Deno.env.set("MULTIPLIX_BATCH_SIZE", "abc");
    const { ctx: ctxHostil } = await runWithProviderBlocked(batchSendingOpts("551195557"));
    assert(
      Math.max(...ctxHostil.limits) === 20,
      `default esperado 20 com MULTIPLIX_BATCH_SIZE invalido, veio ${Math.max(...ctxHostil.limits)}`,
    );
  } finally {
    if (anterior === undefined) Deno.env.delete("MULTIPLIX_BATCH_SIZE");
    else Deno.env.set("MULTIPLIX_BATCH_SIZE", anterior);
  }
});

Deno.test("gap M25: erro na RPC de supressao nao libera envio (fail-closed)", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550003")],
    suppressionRpcError: true,
  };
  const ctx = newCtx(opts);
  const provider = stubProviderFetch();
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    // Fail-closed: supressao ilegivel aborta a passada (500 observavel) em vez de
    // enviar para quem pode ter pedido opt-out.
    assert(res.status === 500, `esperado 500 (fail-closed), recebido ${res.status}`);
    assert(provider.messagePosts() === 0, `supressao ilegivel nao pode gerar POST, houve ${provider.messagePosts()}`);
    const enviados = ctx.completions.filter((c) => c.p_status === "sent");
    assert(enviados.length === 0, "nenhum destinatario pode ser marcado 'sent' com a supressao ilegivel");
  } finally {
    provider.restore();
  }
});

Deno.test("gap M32/MX02: item com midia no BLOCO usa o endpoint de midia (nao sendText)", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  // Sem flavor explicito o evoFetch traduz para EVOLUTION GO e, sem token de
  // instancia, devolve 400 sem chamar o provedor — o POST so e observavel em v2.
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    // MX02: o disparo global aponta para OUTRO arquivo — prova que o endpoint (e a
    // midia) vem do bloco do item, nao de `dispatch.media_url/media_type`.
    dispatch: dispatchRow({
      status: "sending",
      media_type: "document",
      media_url: "https://exemplo.test/global.pdf",
      total_recipients: 1,
    }),
    recipients: [recipientRow(1, "5511955550004")],
    // O ativo vive no bloco de ARQUIVO (`file`) — o mesmo contrato da previa.
    blockType: "file",
    blockContent: { media: { url: "https://exemplo.test/foto.png" } },
  };
  const ctx = newCtx(opts);
  // F56: o envio de midia passa pelo prepareMedia, que BUSCA o arquivo para detectar o
  // tipo real. O stub precisa servir bytes de verdade — com o stub de JSON a midia e
  // recusada como invalida e nenhum POST sai.
  const provider = stubProviderComMidia();
  try {
    await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    const posts = provider.urls.filter((url) => url.includes("/message/"));
    assert(posts.length >= 1, `esperava POST ao provedor, urls observadas: ${JSON.stringify(provider.urls)}`);
    assert(
      posts.some((url) => url.includes("sendMedia")),
      `endpoint de midia esperado no POST, veio: ${JSON.stringify(posts)}`,
    );
    assert(
      posts.every((url) => !url.includes("sendText")),
      `item com midia nao pode usar sendText, veio: ${JSON.stringify(posts)}`,
    );
    const corpoMidia = provider.posts.find((p) => p.url.includes("sendMedia"));
    assert(
      String(corpoMidia?.body.media).includes("foto.png"),
      `a midia tem de ser a do bloco, saiu: ${String(corpoMidia?.body.media)}`,
    );
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

Deno.test("envio bem-sucedido: WAMID do provedor vira 'sent' com external_id registrado", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550005")],
  };
  const ctx = newCtx(opts);
  const provider = stubProviderSuccess("WAMID-TESTE-1");
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const posts = provider.urls.filter((url) => url.includes("/message/sendText/"));
    assert(posts.length === 1, `esperava 1 POST sendText, urls: ${JSON.stringify(provider.urls)}`);
    const registrados = rpcs(ctx, "record_multiplix_item_sent");
    assert(registrados.length === 1, `esperava 1 registro de envio, houve ${registrados.length}`);
    assert(
      registrados[0].args.p_external_id === "WAMID-TESTE-1",
      `external_id inesperado: ${String(registrados[0].args.p_external_id)}`,
    );
    const corpo = await res.json();
    assert(corpo?.sent === 1, `resposta deveria reportar sent=1, veio ${JSON.stringify(corpo)}`);
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

// ------------------------------------------------------------------- F38 (E.164)

Deno.test("F38: destino invalido (possivel LID de 14 digitos) vira 'skipped' no_destination, sem POST", async () => {
  // normalizePhone do kernel recusa 14-15 digitos nus (possivel LID). Antes o
  // `replace(/\\D/g)` da L437 empurrava essa string direto ao provedor; agora o
  // destino cai na classe `no_destination` (F39) e o item nao e enviado.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "12345678901234")],
    suppressedPhones: [],
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  assert(providerPosts === 0, `nenhum POST ao provedor era esperado, houve ${providerPosts}`);
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(
    ctx.completions[0].p_status === "skipped",
    `status esperado 'skipped' (no_destination), veio ${ctx.completions[0].p_status}`,
  );
  assert(
    ctx.completions[0].p_error_message === "Sem destino de WhatsApp",
    `motivo inesperado: ${ctx.completions[0].p_error_message}`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// MX06 — variável não resolvida bloqueia o envio (skipped, NUNCA POST com lacuna)
// O validate (multiplix-dispatch/inspect.ts) já classifica campo ausente como
// `exclusao`; o worker honra o MESMO contrato consumindo missing/unknown do
// personalize. Antes do MX06 ele lia só .text: "Ola {{empresa}}" com snapshot
// nulo saía como "Ola ".
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("MX06: {{empresa}} sem company_name_snapshot vira 'skipped' missing_variable — zero POST, zero snapshot", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "Ola {{empresa}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550200", { company_name_snapshot: null })],
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  assert(providerPosts === 0, `nenhum POST ao provedor era esperado, houve ${providerPosts}`);
  assert(
    rpcs(ctx, "persist_multiplix_item_message_snapshot").length === 0,
    "mensagem incompleta nao pode ser congelada em snapshot",
  );
  assert(
    rpcs(ctx, "mark_multiplix_item_dispatch_started").length === 0,
    "o envio ao provedor nao pode nem comecar com variavel pendente",
  );
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(ctx.completions[0].p_status === "skipped", `status esperado 'skipped', veio ${ctx.completions[0].p_status}`);
  assert(
    ctx.completions[0].p_error_message === "missing_variable:empresa",
    `motivo inesperado: ${ctx.completions[0].p_error_message}`,
  );
});

Deno.test("MX06: placeholder desconhecido (typo {{empressa}}) vira 'skipped' unknown_variable — zero POST", async () => {
  // typo nao e builtin, nao e campo customizado, nao e link -> `unknown` do
  // kernel. Antes saia "[empressa]" para o cliente.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "Ola {{empressa}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550201")],
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  assert(providerPosts === 0, `nenhum POST ao provedor era esperado, houve ${providerPosts}`);
  assert(
    rpcs(ctx, "persist_multiplix_item_message_snapshot").length === 0,
    "mensagem com placeholder desconhecido nao pode ser congelada",
  );
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(ctx.completions[0].p_status === "skipped", `status esperado 'skipped', veio ${ctx.completions[0].p_status}`);
  assert(
    ctx.completions[0].p_error_message === "unknown_variable:empressa",
    `motivo inesperado: ${ctx.completions[0].p_error_message}`,
  );
});

Deno.test("MX06: o motivo lista TODAS as chaves pendentes, ordenadas (missing + unknown)", async () => {
  // Deterministico: independente da ordem no template, o motivo sai ordenado —
  // e cada chave carrega o prefixo da sua classe (missing vs unknown).
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "{{cargo}} de {{empresa}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550202", { company_name_snapshot: null })],
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  assert(providerPosts === 0, `nenhum POST ao provedor era esperado, houve ${providerPosts}`);
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(
    ctx.completions[0].p_error_message === "missing_variable:empresa;unknown_variable:cargo",
    `motivo inesperado: ${ctx.completions[0].p_error_message}`,
  );
});

Deno.test("MX06: builtin presente envia byte a byte o texto do kernel ({{empresa}} com snapshot)", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "Ola {{empresa}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550203", { company_name_snapshot: "Acme Ltda" })],
  };
  const ctx = newCtx(opts);
  const provider = stubProviderComMidia();
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const esperado = personalize("Ola {{empresa}}", { company: "Acme Ltda" }, {}, "America/Sao_Paulo").text;
    const textos = provider.posts.filter((p) => p.url.includes("sendText"));
    assert(textos.length === 1, `esperava 1 POST sendText, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
    // MX06/juiz: alem do oraculo do kernel (criterio 2 pede igualdade byte a
    // byte com o kernel), o payload tem de casar com o literal esperado — assim
    // o teste nao depende de recalcular o mesmo codigo que esta sob teste.
    assert(
      textos[0].body.text === "Ola Acme Ltda",
      `payload literal divergente: '${String(textos[0].body.text)}' !== 'Ola Acme Ltda'`,
    );
    assert(
      textos[0].body.text === esperado,
      `payload diverge do kernel: '${String(textos[0].body.text)}' !== '${esperado}'`,
    );
    assert(rpcs(ctx, "record_multiplix_item_sent").length === 1, "o envio resolvido tem de ser registrado");
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

Deno.test("MX06: campo customizado do variables_snapshot resolve e envia byte a byte ({{cargo}})", async () => {
  // O validate alimenta personalize com as strings de variables_snapshot — o
  // worker usa o MESMO insumo, senao um campo aprovado viraria [cargo]/skip.
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "Ola {{cargo}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550204", { variables_snapshot: { cargo: "Diretor" } })],
  };
  const ctx = newCtx(opts);
  const provider = stubProviderComMidia();
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const esperado = personalize("Ola {{cargo}}", { company: "Empresa 1" }, { cargo: "Diretor" }, "America/Sao_Paulo").text;
    const textos = provider.posts.filter((p) => p.url.includes("sendText"));
    assert(textos.length === 1, `esperava 1 POST sendText, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
    // MX06/juiz: oraculo do kernel + literal, para o teste nao ser tautologico.
    assert(
      textos[0].body.text === "Ola Diretor",
      `payload literal divergente: '${String(textos[0].body.text)}' !== 'Ola Diretor'`,
    );
    assert(
      textos[0].body.text === esperado,
      `payload diverge do kernel: '${String(textos[0].body.text)}' !== '${esperado}'`,
    );
    assert(rpcs(ctx, "record_multiplix_item_sent").length === 1, "o envio resolvido tem de ser registrado");
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

Deno.test("MX06: default explicito {{empresa|padrao}} com snapshot nulo ENVIA (nao entra em missing)", async () => {
  // `{{chave|padrao}}`: o kernel nao inclui a chave em missing/unknown — o valor
  // padrao e aprovado pelo contrato do validate e o envio segue normal.
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "Ola {{empresa|Empresa Parceira}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550205", { company_name_snapshot: null })],
  };
  const ctx = newCtx(opts);
  const provider = stubProviderComMidia();
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const textos = provider.posts.filter((p) => p.url.includes("sendText"));
    assert(textos.length === 1, `esperava 1 POST sendText (default explicito), veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
    assert(
      textos[0].body.text === "Ola Empresa Parceira",
      `payload inesperado: '${String(textos[0].body.text)}'`,
    );
    assert(rpcs(ctx, "record_multiplix_item_sent").length === 1, "o envio com default tem de ser registrado");
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

Deno.test("MX06: mensagem congelada (personalized_message) sai como esta, mesmo com variavel pendente no template", async () => {
  // Snapshot ja aprovado no confirm: o worker nao repersonaliza nem revalida —
  // o texto congelado e a verdade do que foi revisado.
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "Ola {{empresa}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550206", { company_name_snapshot: null })],
    // MX02: o snapshot congelado e do ITEM (multiplix_delivery_items), nao do recipient.
    itemPersonalizedMessage: "Texto congelado",
  };
  const ctx = newCtx(opts);
  const provider = stubProviderComMidia();
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const textos = provider.posts.filter((p) => p.url.includes("sendText"));
    assert(textos.length === 1, `esperava 1 POST sendText, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
    assert(
      textos[0].body.text === "Texto congelado",
      `o congelado tem de sair como esta: '${String(textos[0].body.text)}'`,
    );
    assert(rpcs(ctx, "record_multiplix_item_sent").length === 1, "o envio congelado tem de ser registrado");
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

Deno.test("gap M12/F17: a cota diaria e consumida por envio (remaining=1 -> 1 envio e pausa)", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 2 }),
    recipients: [recipientRow(1, "5511955550006"), recipientRow(2, "5511955550007")],
    dailyRemaining: 1,
  };
  const ctx = newCtx(opts);
  const provider = stubProviderSuccess();
  try {
    await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    const envios = rpcs(ctx, "record_multiplix_item_sent");
    assert(envios.length === 1, `cota de 1 deveria permitir 1 envio, houve ${envios.length}`);
    // F56: o envio manda PRESENCA antes da mensagem. A presenca nao pode contar como
    // envio — senao a cota pareceria consumida duas vezes.
    const posts = provider.urls.filter((url) => url.includes("/message/") && !url.includes("presence"));
    assert(posts.length === 1, `esperava 1 POST ao provedor, houve ${posts.length}`);
    const pausas = rpcs(ctx, "transition_multiplix_dispatch").filter((c) => c.args.p_action === "pause");
    assert(pausas.length === 1, `esperava 1 pausa por cota esgotada, houve ${pausas.length}`);
    assert(
      pausas[0].args.p_pause_reason === "daily_limit",
      `motivo da pausa esperado 'daily_limit', veio '${String(pausas[0].args.p_pause_reason)}'`,
    );
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

Deno.test("F56/MX02: documento sai com o fileName, a url e a legenda do BLOCO (o PDF chega com nome)", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    // MX02: o disparo aponta para OUTRO arquivo (imagem sem nome). Se o worker
    // ainda olhasse `dispatch.media_url/media_type`, sairia a imagem global — as
    // asserções abaixo separam os dois caminhos.
    dispatch: dispatchRow({
      status: "sending",
      media_type: "image",
      media_url: "https://exemplo.test/global.png",
      total_recipients: 1,
    }),
    recipients: [recipientRow(1, "5511955550008")],
    // F33: url/caption/nome do arquivo vivem no content do bloco, e sao a unica
    // fonte deles — a URL assinada do bucket nao preserva o nome.
    blockType: "file",
    blockContent: {
      text: "Segue o contrato da {{empresa}}",
      media: { url: "https://exemplo.test/contrato.pdf", caption: "Segue o contrato da {{empresa}}", file_name: "Contrato Assinado.pdf" },
    },
  };
  const ctx = newCtx(opts);
  const provider = stubProviderComMidia();
  try {
    await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    const midia = provider.posts.filter((p) => p.url.includes("sendMedia"));
    assert(midia.length === 1, `esperava 1 POST de midia, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
    assert(
      midia[0].body.fileName === "Contrato Assinado.pdf",
      `o documento tem de sair com o nome do bloco, saiu: ${String(midia[0].body.fileName)}`,
    );
    assert(
      midia[0].body.mediatype === "document",
      `tipo real (detectado nos bytes) esperado document, veio ${String(midia[0].body.mediatype)}`,
    );
    assert(
      String(midia[0].body.media).includes("contrato.pdf"),
      `a midia tem de ser a do bloco, saiu: ${String(midia[0].body.media)}`,
    );
    assert(
      midia[0].body.caption === "Segue o contrato da Empresa 1",
      `a legenda tem de ser o texto do bloco personalizado, saiu: ${String(midia[0].body.caption)}`,
    );
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

Deno.test("F56/MX02: audio do BLOCO sai como PTT e avisa presenca 'recording'", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550009")],
    // MX02: o audio e do BLOCO (`audio_recorded`), nao mais do disparo global.
    blockType: "audio_recorded",
    blockContent: { media: { url: "https://exemplo.test/nota.ogg" } },
  };
  const ctx = newCtx(opts);
  const provider = stubProviderComMidia();
  try {
    await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    const presenca = provider.posts.find((p) => p.url.includes("presence"));
    assert(presenca !== undefined, `esperava POST de presenca, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
    // O Evolution GO nao expressa "gravando" como presence:"recording": translateV2ToGo
    // converte para { state: "composing", isAudio: true }. A assercao aceita as duas formas
    // — o que importa e a INTENCAO (o destinatario ve que e audio), nao o dialeto da vez.
    const avisaGravacao = presenca.body.isAudio === true || presenca.body.presence === "recording";
    assert(
      avisaGravacao,
      `nota de voz tem de avisar gravacao, veio: ${JSON.stringify(presenca.body)}`,
    );
    const audio = provider.posts.find((p) => p.url.includes("audio") || p.url.includes("sendWhatsAppAudio"));
    assert(audio !== undefined, `esperava POST de audio/PTT, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// F61 — o operador le TEXTO; o codigo cru vai para a trilha de eventos
// ─────────────────────────────────────────────────────────────────────────────

/** Provedor que RECUSA: devolve o corpo CRU (JSON do provedor) com status 400. */
function stubProviderRejecting(body: unknown, status = 400) {
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = ((input: any) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    // A chamada de presenca nao e a mensagem: quem recusa e o POST da mensagem.
    if (url.includes("presence")) {
      return Promise.resolve(new Response("{}", { status: 200 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    );
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { restore: () => { globalThis.fetch = original; } };
}

Deno.test("F61: erro do provedor vira texto legivel — nunca JSON cru — e o codigo vai para os eventos", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    recipients: [recipientRow(0, "5511999990000")],
  };
  const ctx = newCtx(opts);
  // Corpo REAL do provedor: e isto que o operador via no campo de diagnostico.
  const provider = stubProviderRejecting({ status: 400, error: { code: "400", message: "number not exists" } });
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);

    const completions = rpcs(ctx, "complete_multiplix_item");
    assert(completions.length >= 1, "esperava ao menos um complete_multiplix_item");
    const p_error_message = String(completions[0].args.p_error_message ?? "");

    // O ponto do F61: o campo que a TELA mostra nao pode ser o corpo do provedor.
    assert(
      !p_error_message.includes("{") && !p_error_message.includes("number not exists"),
      `error_message vazou o corpo do provedor: ${p_error_message}`,
    );
    assert(
      p_error_message.includes("Número não existe no WhatsApp"),
      `error_message nao esta legivel para o operador: ${p_error_message}`,
    );

    // Segunda metade: o codigo CRU fica na trilha de eventos, para quem depura.
    const falha = ctx.events.find((e: Record<string, unknown>) => e.kind === "item_failed");
    assert(falha !== undefined, "esperava um evento item_failed com o codigo do provedor");
    const payload = falha.payload as Record<string, unknown>;
    assert(payload.error_code === "number_not_exists", `error_code inesperado: ${String(payload.error_code)}`);
    assert(payload.error_class === "permanent", `error_class inesperado: ${String(payload.error_class)}`);
    assert(payload.provider_status === 400, `provider_status inesperado: ${String(payload.provider_status)}`);

    // O corpo do provedor NAO entra no evento: pode carregar dado de cliente.
    const bruto = JSON.stringify(payload);
    assert(!bruto.includes("number not exists"), "o evento carregou o corpo bruto do provedor");
  } finally {
    provider.restore();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// F60 (gatilho) — o erro PERMANENTE nao fica no item: marca a CONEXAO em risco
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("F60: erro PERMANENTE no item marca a conexao em risco (o gatilho do worker)", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    recipients: [recipientRow(0, "5511999990000")],
    connection: { id: "conn-0001", status: "connected", instance_id: "inst-1" },
  };
  const ctx = newCtx(opts);
  const provider = stubProviderRejecting({ status: 400, error: { code: "400", message: "number not exists" } });
  try {
    await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    const risco = rpcs(ctx, "register_multiplix_connection_failure");
    assert(risco.length === 1, `esperava UMA marcacao de risco, veio ${risco.length}`);
    assert(
      risco[0].args.p_error_class === "permanent",
      `p_error_class inesperado: ${String(risco[0].args.p_error_class)}`,
    );
    assert(
      risco[0].args.p_connection_id === "conn-0001",
      `marcou a conexao errada: ${String(risco[0].args.p_connection_id)}`,
    );
    // Sem sinal de banimento: quem decide o limiar das tres e a funcao, nao o worker.
    assert(risco[0].args.p_signal === null, `o worker nao deveria mandar sinal: ${String(risco[0].args.p_signal)}`);
  } finally {
    provider.restore();
  }
});

Deno.test("F60: erro do item que NAO e permanente nao marca risco (nao pausa por qualquer coisa)", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    recipients: [recipientRow(0, "5511999990000")],
    connection: { id: "conn-0001", status: "connected", instance_id: "inst-1" },
  };
  const ctx = newCtx(opts);
  // 503 = indisponibilidade temporaria do provedor: o item falha, mas a conexao esta bem.
  const provider = stubProviderRejecting({ status: 503, error: { code: "503", message: "service unavailable" } }, 503);
  try {
    await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    const risco = rpcs(ctx, "register_multiplix_connection_failure");
    assert(
      risco.length === 0,
      `erro transitorio NAO pode pausar a conexao (marcou ${risco.length}x — pausaria disparo bom)`,
    );
  } finally {
    provider.restore();
  }
});

// -----------------------------------------------------------------------------
// MX05 - rejeicao TRANSITORIA do provedor (429) volta para a fila com backoff
// limitado; nunca vira 'failed' terminal.
// O kernel (errors.ts) ja classifica (429 -> transient/rate_limited) e ja tem o
// backoff com teto; o defeito era o CONSUMIDOR: o ramo de resposta nao-OK
// concluia o item como 'failed' e `reschedule_multiplix_item` so era chamado
// quando nenhum POST tinha saido (Probe429: failed=1, rescheduleCalls=0).
// Um 5xx continua em `outcome_unknown` (o POST e ambiguo; reenviar cego pode
// duplicar mensagem) - por isso a guarda abaixo.
// -----------------------------------------------------------------------------

Deno.test("MX05: 429 do provedor reagenda o item com backoff limitado (nunca 'failed' terminal)", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550701")],
  };
  const ctx = newCtx(opts);
  const antes = Date.now();
  const provider = stubProviderRejecting({ error: { code: "429", message: "too many requests" } }, 429);
  let corpo: { sent?: number; failed?: number; outcome_unknown?: number } = {};
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    corpo = await res.json();
  } finally {
    provider.restore();
  }

  const reagendamentos = rpcs(ctx, "reschedule_multiplix_item");
  assert(reagendamentos.length === 1, `esperava 1 reagendamento do item, houve ${reagendamentos.length}`);
  const args = reagendamentos[0].args;
  assert(args.p_item_id === "item-recipient-1", `item_id inesperado: ${String(args.p_item_id)}`);
  assert(
    args.p_claim_token === "claim-item-recipient-1",
    `claim_token inesperado: ${String(args.p_claim_token)}`,
  );
  // Backoff COM TETO do kernel: a 1a falha espera 30 s (nao retry imediato).
  const retryAfter = Date.parse(String(args.p_retry_after));
  assert(Number.isFinite(retryAfter), `p_retry_after invalido: ${String(args.p_retry_after)}`);
  const esperaMs = retryAfter - antes;
  assert(
    esperaMs >= 29_000 && esperaMs <= 31_000,
    `p_retry_after fora da 1a janela de 30 s: ${String(args.p_retry_after)} (${esperaMs}ms)`,
  );

  // O ponto do MX05: rejeicao temporaria NAO conclui o item como falha terminal.
  assert(
    rpcs(ctx, "complete_multiplix_item").length === 0,
    "429 transitorio NAO pode concluir o item ('failed') - a retentativa do kernel tem de acontecer",
  );
  // Nem marca a conexao em risco: isso e para erro PERMANENTE (F60).
  assert(
    rpcs(ctx, "register_multiplix_connection_failure").length === 0,
    "429 transitorio nao pode marcar a conexao em risco",
  );
  // O codigo cru continua indo para a trilha de eventos, com a classe transitoria.
  const evento = ctx.events.find((e: Record<string, unknown>) => String(e.kind).startsWith("item_"));
  assert(evento !== undefined, "esperava um evento do item na trilha");
  const payload = evento.payload as Record<string, unknown>;
  assert(payload.error_class === "transient", `error_class inesperado: ${String(payload.error_class)}`);
  assert(payload.error_code === "rate_limited", `error_code inesperado: ${String(payload.error_code)}`);
  assert(payload.provider_status === 429, `provider_status inesperado: ${String(payload.provider_status)}`);
  // E o item nao conta como falha na resposta do worker.
  assert(corpo.failed === 0, `o reagendamento nao pode contar como falha: ${JSON.stringify(corpo)}`);
});

Deno.test("MX05/guarda: erro PERMANENTE continua indo para dead letter (nao vira retentativa)", async () => {
  // A correcao do MX05 nao pode transformar TODO erro do provedor em retry:
  // numero inexistente/opt-out sao permanentes e NUNCA reententam.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550702")],
  };
  const ctx = newCtx(opts);
  const provider = stubProviderRejecting({ status: 400, error: { code: "400", message: "number not exists" } }, 400);
  let corpo: { failed?: number } = {};
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    corpo = await res.json();
  } finally {
    provider.restore();
  }
  assert(
    rpcs(ctx, "reschedule_multiplix_item").length === 0,
    "erro permanente NAO pode ser reagendado (reententaria quem nunca vai receber)",
  );
  const completions = rpcs(ctx, "complete_multiplix_item");
  assert(completions.length === 1, `esperava 1 conclusao, houve ${completions.length}`);
  assert(completions[0].args.p_status === "failed", `status esperado 'failed', veio ${String(completions[0].args.p_status)}`);
  // O item concluido como 'failed' tem de contar na resposta do worker —
  // antes do conserto a conclusao acontecia mas failed saia 0.
  assert(corpo.failed === 1, `a falha permanente tem de contar na resposta: ${JSON.stringify(corpo)}`);
  assert(
    rpcs(ctx, "register_multiplix_connection_failure").length === 1,
    "erro permanente continua marcando o risco da conexao (F60)",
  );
});

Deno.test("MX05/guarda: 5xx continua outcome_unknown (reenviar cego duplicaria mensagem)", async () => {
  // A protecao de idempotencia do POST ambiguo NAO entra na retentativa: o
  // 5xx segue pelo caminho de resultado desconhecido.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550703")],
  };
  const ctx = newCtx(opts);
  const provider = stubProviderRejecting({ status: 503, error: { code: "503", message: "service unavailable" } }, 503);
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    provider.restore();
  }
  assert(rpcs(ctx, "reschedule_multiplix_item").length === 0, "5xx nao pode virar retentativa cega");
  const completions = rpcs(ctx, "complete_multiplix_item");
  assert(completions.length === 1, `esperava 1 conclusao, houve ${completions.length}`);
  assert(
    completions[0].args.p_status === "outcome_unknown",
    `status esperado 'outcome_unknown', veio ${String(completions[0].args.p_status)}`,
  );
});

Deno.test("MX05: transitorio que esgota as tentativas vira dead letter pela RPC (teto respeitado)", async () => {
  // Na 3a tentativa a propria RPC transforma o reagendamento em dead letter (o
  // worker informa o retry_after, nao decide o teto) - o item nao reententa
  // sem fim.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550704")],
  };
  opts.recipients![0].attempt_count = 3;
  const ctx = newCtx(opts);
  const provider = stubProviderRejecting({ error: { code: "429", message: "too many requests" } }, 429);
  let corpo: { sent?: number; failed?: number } = {};
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    corpo = await res.json();
  } finally {
    provider.restore();
  }
  assert(rpcs(ctx, "reschedule_multiplix_item").length === 1, "a RPC de reagendamento continua sendo a autoridade do teto");
  assert(corpo.failed === 1, `o dead letter da RPC conta como falha: ${JSON.stringify(corpo)}`);
});

Deno.test("MX05: dead_lettered da RPC vira item_failed na trilha (nao mero reagendamento)", async () => {
  // Quando a RPC esgota as tentativas ela devolve action='dead_lettered' e o
  // item ja esta 'failed' no banco. Registrar 'item_rescheduled' esconderia a
  // morte do item numa trilha que so deveria mostrar fila — a auditoria tem de
  // enxergar a falha.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550705")],
  };
  opts.recipients![0].attempt_count = 3;
  const ctx = newCtx(opts);
  const provider = stubProviderRejecting({ error: { code: "429", message: "too many requests" } }, 429);
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    provider.restore();
  }

  const reagendamentos = ctx.events.filter(
    (e: Record<string, unknown>) => e.kind === "item_rescheduled" && e.item_id === "item-recipient-1",
  );
  assert(
    reagendamentos.length === 0,
    "dead_lettered NAO pode ser auditado como item_rescheduled (o item morreu, nao voltou a fila)",
  );
  const falha = ctx.events.find(
    (e: Record<string, unknown>) => e.kind === "item_failed" && e.item_id === "item-recipient-1",
  );
  assert(falha !== undefined, "esperava um evento item_failed para o dead_lettered da RPC");
  const payload = falha.payload as Record<string, unknown>;
  assert(
    payload.action === "dead_lettered",
    `payload.action esperado 'dead_lettered', veio ${String(payload.action)}`,
  );
  assert(payload.error_class === "transient", `error_class inesperado: ${String(payload.error_class)}`);
  assert(payload.provider_status === 429, `provider_status inesperado: ${String(payload.provider_status)}`);
});

Deno.test("MX05: decisao dead_letter (sem retryAfter do kernel) nao agenda retry imediato", async () => {
  // attempt_count = 3 -> a tentativa que falha e a 4a: planRetry devolve
  // dead_letter SEM retryAfter. O fallback do worker tem de ser o 1o degrau do
  // backoff (30 s) — `new Date()` agendaria o retry para AGORA, o que e
  // proibido; quem aposenta o item continua sendo a RPC.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550706")],
  };
  opts.recipients![0].attempt_count = 3;
  const ctx = newCtx(opts);
  const antes = Date.now();
  const provider = stubProviderRejecting({ error: { code: "429", message: "too many requests" } }, 429);
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    provider.restore();
  }

  const reagendamentos = rpcs(ctx, "reschedule_multiplix_item");
  assert(reagendamentos.length === 1, `esperava 1 chamada a reschedule_multiplix_item, houve ${reagendamentos.length}`);
  const retryAfter = Date.parse(String(reagendamentos[0].args.p_retry_after));
  assert(Number.isFinite(retryAfter), `p_retry_after invalido: ${String(reagendamentos[0].args.p_retry_after)}`);
  const esperaMs = retryAfter - antes;
  assert(esperaMs > 1_000, `retry quase imediato (${esperaMs}ms) — o fallback nao pode ser 'agora'`);
  assert(
    esperaMs >= 29_000 && esperaMs <= 31_000,
    `p_retry_after fora do 1o degrau de 30 s: ${String(reagendamentos[0].args.p_retry_after)} (${esperaMs}ms)`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// MX02 (item 46/P1) — o worker envia o conteudo do BLOCO do item, e nao mais o
// template/midia GLOBAIS do disparo. A previa (F48) e o worker compartilham o
// resolvedor `_shared/multiplix-content.ts`; estes testes provam a paridade.
// ─────────────────────────────────────────────────────────────────────────────

/** Provedor de sucesso que registra os corpos enviados (texto e midia). */
async function runComClienteV2(opts: MockOpts) {
  const ctx = newCtx(opts);
  const provider = stubProviderComMidia();
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    return { ctx, provider, body };
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
}

Deno.test("MX02: o texto enviado e o do BLOCO do item, nao o template global do disparo", async () => {
  // Caso medido na auditoria: template global "GLOBAL {{empresa}}" x bloco
  // "BLOCO CORRETO {{empresa}}" — o worker mandava "GLOBAL Empresa 1".
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "GLOBAL {{empresa}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550010")],
    blockContent: { text: "BLOCO CORRETO {{empresa}}" },
  };
  const { provider } = await runComClienteV2(opts);
  const envios = provider.posts.filter((p) => p.url.includes("sendText"));
  assert(envios.length === 1, `esperava 1 POST de texto, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  assert(
    envios[0].body.text === "BLOCO CORRETO Empresa 1",
    `o texto tem de sair do bloco; saiu: ${String(envios[0].body.text)}`,
  );
});

Deno.test("MX02: o `variables_snapshot` do item entra na personalizacao (previa == envio)", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550011")],
    blockContent: { text: "Ola {{empresa}} — falar com {{cargo}}" },
    variablesSnapshot: { cargo: "Diretor" },
  };
  const { provider } = await runComClienteV2(opts);
  const envios = provider.posts.filter((p) => p.url.includes("sendText"));
  assert(envios.length === 1, `esperava 1 POST de texto, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  assert(
    envios[0].body.text === "Ola Empresa 1 — falar com Diretor",
    `variavel do item nao entrou no texto; saiu: ${String(envios[0].body.text)}`,
  );
});

Deno.test("MX02: o snapshot do ITEM prevalece e nao e regravado", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "GLOBAL {{empresa}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550012")],
    blockContent: { text: "BLOCO CORRETO {{empresa}}" },
    itemPersonalizedMessage: "Mensagem congelada do item (bloco 2)",
  };
  const { ctx, provider } = await runComClienteV2(opts);
  const envios = provider.posts.filter((p) => p.url.includes("sendText"));
  assert(envios.length === 1, `esperava 1 POST de texto, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  assert(
    envios[0].body.text === "Mensagem congelada do item (bloco 2)",
    `o snapshot do item tem de prevalecer; saiu: ${String(envios[0].body.text)}`,
  );
  assert(
    rpcs(ctx, "persist_multiplix_item_message_snapshot").length === 0,
    "snapshot ja gravado nao pode ser regravado",
  );
});

Deno.test("MX02/F69: bloco de voz sem ativo renderizado SEGURA o item (nao manda o template global)", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "GLOBAL {{empresa}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550013")],
    blockType: "voice_ai",
    blockContent: { voice: { script: "Roteiro da {{empresa}}" } },
  };
  const { ctx, provider } = await runComClienteV2(opts);
  assert(
    provider.posts.length === 0,
    `bloco de voz pendente nao pode gerar POST, houve ${JSON.stringify(provider.posts.map((p) => p.url))}`,
  );
  const reschedules = ctx.reschedules;
  assert(reschedules.length === 1, `esperava 1 devolucao a fila, houve ${reschedules.length}`);
  assert(
    String(reschedules[0].p_error_message).includes("multiplix_block_pending_media"),
    `codigo nomeado esperado, veio: ${String(reschedules[0].p_error_message)}`,
  );
  assert(rpcs(ctx, "record_multiplix_item_sent").length === 0, "nada pode ser marcado como enviado");
});

Deno.test("MX02: bloco sem texto e sem midia nao vira POST (devolve o item com codigo nomeado)", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "GLOBAL {{empresa}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550014")],
    blockContent: {},
  };
  const { ctx, provider } = await runComClienteV2(opts);
  assert(provider.posts.length === 0, `bloco vazio nao pode gerar POST, houve ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  const reschedules = ctx.reschedules;
  assert(reschedules.length === 1, `esperava 1 devolucao a fila, houve ${reschedules.length}`);
  assert(
    String(reschedules[0].p_error_message).includes("multiplix_block_empty_content"),
    `codigo nomeado esperado, veio: ${String(reschedules[0].p_error_message)}`,
  );
});

Deno.test("MX02: payload do worker == resolucao da previa para o MESMO bloco e destinatario", async () => {
  const recipient = recipientRow(1, "5511955550015");
  const content = {
    text: "Segue o contrato da {{empresa}}",
    media: { url: "https://exemplo.test/contrato.pdf", caption: "Segue o contrato da {{empresa}}", file_name: "Contrato Assinado.pdf" },
  };
  const block = {
    id: "block-1",
    block_order: 0,
    block_type: "file",
    content,
    personalization_mode: null,
    content_version: 1,
    asset_id: null,
  };
  // A MESMA funcao que `handlePreview` chama para montar a previa (F48).
  const previa = resolveBlockContent(block, recipient, "America/Sao_Paulo");

  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipient],
    blockType: "file",
    blockContent: content,
  };
  const { provider } = await runComClienteV2(opts);
  const midia = provider.posts.filter((p) => p.url.includes("sendMedia"));
  assert(midia.length === 1, `esperava 1 POST de midia, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  assert(
    midia[0].body.fileName === previa.asset?.file_name,
    `nome do arquivo divergente da previa: envio=${String(midia[0].body.fileName)} previa=${String(previa.asset?.file_name)}`,
  );
  assert(
    String(midia[0].body.media).includes(String(previa.asset?.url)),
    `midia divergente da previa: envio=${String(midia[0].body.media)} previa=${String(previa.asset?.url)}`,
  );
  assert(
    midia[0].body.caption === previa.text,
    `texto divergente da previa: envio=${String(midia[0].body.caption)} previa=${previa.text}`,
  );
});

Deno.test("MX02/F70: excecao na resolucao do bloco conclui SO o item como 'failed' e o lote continua", async () => {
  // Prova do defeito corrigido: a resolucao do bloco rodava FORA de try/catch —
  // uma excecao ali subia ao catch do handler, devolvia 500 e o item nem virava
  // 'failed'. Aqui o `variables_snapshot` do item 1 lanca ao ser percorrido pelo
  // resolvedor; o item 2 e normal e TEM de ser enviado na mesma passada.
  const quebrado = recipientRow(1, "5511955550020");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (quebrado as any).variables_snapshot = new Proxy({}, {
    ownKeys() {
      throw new Error("variables_snapshot quebrado");
    },
  });
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "GLOBAL {{empresa}}", total_recipients: 2 }),
    recipients: [quebrado, recipientRow(2, "5511955550021")],
    blockContent: { text: "BLOCO CORRETO {{empresa}}" },
  };
  const { ctx, provider } = await runComClienteV2(opts); // ja afirma resposta 200
  const falhas = ctx.completions.filter((c) => String(c.p_item_id) === "item-recipient-1");
  assert(falhas.length === 1, `esperava 1 conclusao do item 1, houve ${falhas.length}`);
  assert(falhas[0].p_status === "failed", `item 1 tinha de virar 'failed', veio ${String(falhas[0].p_status)}`);
  assert(
    String(falhas[0].p_error_message).includes("multiplix_block_resolution_failed"),
    `mensagem sem o codigo nomeado: ${String(falhas[0].p_error_message)}`,
  );
  assert(
    String(falhas[0].p_error_message).includes("variables_snapshot quebrado"),
    `mensagem sem o texto do erro original: ${String(falhas[0].p_error_message)}`,
  );
  const envios = provider.posts.filter((p) => p.url.includes("sendText"));
  assert(envios.length === 1, `esperava 1 POST de texto (so o item 2), veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  assert(envios[0].body.number === "5511955550021", `o POST tinha de ser do item 2; foi para ${String(envios[0].body.number)}`);
  assert(envios[0].body.text === "BLOCO CORRETO Empresa 2", `texto do item 2 divergente: ${String(envios[0].body.text)}`);
});

Deno.test("MX02/F70: falha do RPC de snapshot NAO conclui o item como 'failed' (erro transitorio, retomavel)", async () => {
  // A gravacao do snapshot e I/O (RPC), nao resolucao deterministica: uma falha
  // TRANSITORIA ali tem de preservar o comportamento anterior a F70 — o erro sobe com
  // o codigo proprio `multiplix_message_snapshot_failed` (o handler devolve 500 e o
  // lease vence, permitindo retomada), NUNCA encerrar o item como 'failed' com o
  // codigo enganoso do catch de resolucao (`multiplix_block_resolution_failed`).
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "GLOBAL {{empresa}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550024")],
    blockContent: { text: "BLOCO CORRETO {{empresa}}" },
    snapshotRpcError: true,
  };
  const ctx = newCtx(opts);
  const provider = stubProviderComMidia();
  // O codigo do erro nao aparece no corpo da resposta (o handler devolve 500 generico),
  // entao a prova vem do log estruturado do proprio modulo.
  const erros: string[] = [];
  const consoleErrorOriginal = console.error;
  console.error = (...args: unknown[]) => { erros.push(args.map((a) => String(a)).join(" ")); };
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  let status = 0;
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    status = res.status;
  } finally {
    console.error = consoleErrorOriginal;
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }

  // 1) O item NAO pode ser encerrado: para o banco ele continua reivindicado e o lease
  // vence (retomavel). Este e o assert que o codigo com a regressao viola.
  const concluidos = ctx.completions.filter((c) => String(c.p_item_id) === "item-recipient-1");
  assert(
    concluidos.length === 0,
    `item NAO pode ser concluido por falha transitoria do snapshot: ${JSON.stringify(concluidos)}`,
  );
  assert(
    !ctx.completions.some((c) => String(c.p_status) === "failed"),
    `nenhum item pode virar 'failed' aqui: ${JSON.stringify(ctx.completions)}`,
  );
  // 2) Comportamento anterior preservado: o erro derruba a invocacao (500) em vez de
  // encerrar o item — o lease vence e o item volta para a fila.
  assert(status === 500, `esperado 500 (retomavel), recebido ${status}`);
  // 3) O codigo de erro e o proprio do snapshot, nunca o do catch de resolucao.
  const log = erros.join("\n");
  assert(
    log.includes("multiplix_message_snapshot_failed"),
    `o erro do snapshot tinha de subir com o codigo proprio; log: ${log}`,
  );
  assert(
    !log.includes("multiplix_block_resolution_failed"),
    `o catch da resolucao engoliu a falha do snapshot; log: ${log}`,
  );
  const tentativas = rpcs(ctx, "persist_multiplix_item_message_snapshot");
  assert(tentativas.length === 1, `o snapshot tinha de ser tentado 1 vez, houve ${tentativas.length}`);
  assert(
    provider.posts.filter((p) => p.url.includes("/message/")).length === 0,
    "nenhum POST de mensagem pode sair sem o snapshot gravado",
  );
  // Vermelho medido: com o index.ts do cherry-pick (RPC dentro do try), o log traz
  // `multiplix_block_resolution_failed`, o item e concluido 'failed' e a resposta e 200.
});

Deno.test("MX02: o snapshot da mensagem e gravado NO ITEM, uma vez, antes do POST", async () => {
  // A mensagem enviada ao provedor tem de ser a MESMA gravada em
  // `multiplix_delivery_items.personalized_message` — o texto do BLOCO ja
  // personalizado, nunca o template global.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", message_template: "GLOBAL {{empresa}}", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550022")],
    blockContent: { text: "BLOCO CORRETO {{empresa}}" },
  };
  const { ctx, provider } = await runComClienteV2(opts);
  const snapshots = rpcs(ctx, "persist_multiplix_item_message_snapshot");
  assert(snapshots.length === 1, `esperava 1 gravacao de snapshot, houve ${snapshots.length}`);
  assert(snapshots[0].args.p_item_id === "item-recipient-1", `snapshot no item errado: ${String(snapshots[0].args.p_item_id)}`);
  assert(
    typeof snapshots[0].args.p_claim_token === "string" && (snapshots[0].args.p_claim_token as string).length > 0,
    "snapshot tem de levar o claim_token do lease em maos",
  );
  assert(
    snapshots[0].args.p_personalized_message === "BLOCO CORRETO Empresa 1",
    `snapshot gravou texto divergente do bloco: ${String(snapshots[0].args.p_personalized_message)}`,
  );
  const envios = provider.posts.filter((p) => p.url.includes("sendText"));
  assert(envios.length === 1, `esperava 1 POST de texto, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  assert(envios[0].body.text === snapshots[0].args.p_personalized_message, "o POST tem de levar o MESMO texto gravado no item");
});

Deno.test("MX02/F69: o reschedule de `multiplix_block_pending_media` respeita o teto de tentativas", async () => {
  // attempt_count 2 + claim (que incrementa, f32b §2) = 3a tentativa: o
  // reschedule responde dead_lettered (f32b §7) e o item vira 'failed' — nunca
  // volta a fila nem gira de novo nesta passada.
  const item = recipientRow(1, "5511955550023");
  item.attempt_count = 2;
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [item],
    blockType: "voice_ai",
    blockContent: { voice: { script: "Roteiro da {{empresa}}" } },
  };
  const { ctx, provider, body } = await runComClienteV2(opts);
  assert(ctx.reschedules.length === 1, `esperava 1 reschedule, houve ${ctx.reschedules.length}`);
  assert(
    String(ctx.reschedules[0].p_error_message).includes("multiplix_block_pending_media"),
    `codigo nomeado esperado, veio: ${String(ctx.reschedules[0].p_error_message)}`,
  );
  assert(ctx.deadLettered.length === 1, `3a tentativa tinha de dead-letter, deadLettered=${ctx.deadLettered.length}`);
  assert(rpcs(ctx, "claim_multiplix_item").length === 1, "o item foi reivindicado uma unica vez (sem giro)");
  assert(provider.posts.length === 0, `nenhum POST esperado, houve ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  assert(body.failed === 1, `body.failed esperado 1, veio ${JSON.stringify(body)}`);
});

Deno.test("MX02: o reschedule de `multiplix_block_empty_content` respeita o teto de tentativas", async () => {
  // Mesmo desenho do teste de voz pendente, com bloco sem texto e sem midia:
  // attempt_count 2 + claim = 3a tentativa -> dead_lettered, sem reenvio a fila.
  const item = recipientRow(1, "5511955550024");
  item.attempt_count = 2;
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [item],
    blockContent: {},
  };
  const { ctx, provider, body } = await runComClienteV2(opts);
  assert(ctx.reschedules.length === 1, `esperava 1 reschedule, houve ${ctx.reschedules.length}`);
  assert(
    String(ctx.reschedules[0].p_error_message).includes("multiplix_block_empty_content"),
    `codigo nomeado esperado, veio: ${String(ctx.reschedules[0].p_error_message)}`,
  );
  assert(ctx.deadLettered.length === 1, `3a tentativa tinha de dead-letter, deadLettered=${ctx.deadLettered.length}`);
  assert(rpcs(ctx, "claim_multiplix_item").length === 1, "o item foi reivindicado uma unica vez (sem giro)");
  assert(provider.posts.length === 0, `nenhum POST esperado, houve ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  assert(body.failed === 1, `body.failed esperado 1, veio ${JSON.stringify(body)}`);
});

Deno.test("MX02/F69: abaixo do teto o item volta a fila com o backoff da tentativa", async () => {
  // attempt_count 1 + claim = 2a tentativa (< 3): reschedule devolve
  // `rescheduled` e o item sai da fila desta passada com next_attempt_at ~120s
  // a frente (backoff da 2a tentativa: [30s, 120s, 600s]).
  const item = recipientRow(1, "5511955550025");
  item.attempt_count = 1;
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [item],
    blockContent: {},
  };
  const antes = Date.now();
  const { ctx, provider } = await runComClienteV2(opts);
  assert(ctx.deadLettered.length === 0, `abaixo do teto nao pode dead-letter, deadLettered=${ctx.deadLettered.length}`);
  assert(ctx.reschedules.length === 1, `esperava 1 reschedule, houve ${ctx.reschedules.length}`);
  assert(
    String(ctx.reschedules[0].p_error_message).includes("multiplix_block_empty_content"),
    `codigo nomeado esperado, veio: ${String(ctx.reschedules[0].p_error_message)}`,
  );
  const retryAfter = Date.parse(String(ctx.reschedules[0].p_retry_after));
  assert(Number.isFinite(retryAfter), `p_retry_after invalido: ${String(ctx.reschedules[0].p_retry_after)}`);
  const delta = retryAfter - antes;
  assert(
    delta >= 110_000 && delta <= 130_000,
    `backoff da 2a tentativa tinha de ser ~120s, veio ${delta}ms`,
  );
  assert(provider.posts.length === 0, `nenhum POST esperado, houve ${JSON.stringify(provider.posts.map((p) => p.url))}`);
});

// ---------------------------------------------------------------------------
// t_4fe1 (F65) — bloco voice_ai com ativo JA renderizado ENVIA o audio: a URL
// sai de multiplix_voice_assets.caminho, assinada pelo mecanismo privado
// existente (resolvePrivateBucketUrl, bucket multiplix-voice), UMA vez — sem
// reschedule e sem dead-letter. Antes o resolvedor devolvia url:null para todo
// voice_ai e o item pronto girava na fila ate morrer.
// ---------------------------------------------------------------------------

Deno.test("F65: voice_ai personalizado (voice_asset_id do item) envia o audio assinado UMA vez, sem reschedule/dead_letter", async () => {
  const supabaseUrlAnterior = Deno.env.get("SUPABASE_URL");
  Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
  try {
    const opts: MockOpts = {
      cronVaultResult: TEST_CRON_SECRET,
      dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
      recipients: [recipientRow(1, "5511955550030")],
      blockType: "voice_ai",
      blockContent: { voice: { script: "Roteiro da {{empresa}}", voice_id: "voz-1" } },
      // Modo personalizado: o ativo e identificado pelo voice_asset_id do ITEM.
      itemVoiceAssetId: "va-item-1",
      voiceAssets: { "va-item-1": { caminho: "comercial/voz-item.ogg", invalidated_at: null } },
    };
    const { ctx, provider, body } = await runComClienteV2(opts);

    const assinaturas = ctx.signCalls.filter((c) => c.bucket === "multiplix-voice");
    assert(
      assinaturas.length === 1,
      `esperava 1 assinatura no bucket privado multiplix-voice, houve ${JSON.stringify(ctx.signCalls)}`,
    );
    assert(
      assinaturas[0].path === "comercial/voz-item.ogg",
      `o path assinado tem de ser o caminho do ativo: ${assinaturas[0].path}`,
    );
    const audios = provider.posts.filter((p) => p.url.includes("sendWhatsAppAudio"));
    assert(audios.length === 1, `esperava 1 POST de audio, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
    assert(
      String(audios[0].body.audio).includes("/object/sign/multiplix-voice/comercial/voz-item.ogg"),
      `o audio enviado tem de ser a URL ASSINADA do ativo, saiu: ${String(audios[0].body.audio)}`,
    );
    assert(rpcs(ctx, "record_multiplix_item_sent").length === 1, "o envio concluido tem de ser registrado");
    assert(body.sent === 1, `body.sent esperado 1, veio ${JSON.stringify(body)}`);
    assert(
      ctx.reschedules.length === 0,
      `ativo pronto nao pode voltar a fila, reschedules=${JSON.stringify(ctx.reschedules)}`,
    );
    assert(ctx.deadLettered.length === 0, `ativo pronto nao pode dead-letter, deadLettered=${ctx.deadLettered.length}`);
    assert(
      ctx.completions.every((c) => c.p_status !== "failed"),
      `nenhuma conclusao 'failed' esperada: ${JSON.stringify(ctx.completions)}`,
    );
  } finally {
    if (supabaseUrlAnterior === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", supabaseUrlAnterior);
  }
});

Deno.test("F65: voice_ai same_audio usa o asset_id do BLOCO (nao do item) e envia o audio assinado", async () => {
  const supabaseUrlAnterior = Deno.env.get("SUPABASE_URL");
  Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
  try {
    const opts: MockOpts = {
      cronVaultResult: TEST_CRON_SECRET,
      dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
      recipients: [recipientRow(1, "5511955550031")],
      blockType: "voice_ai",
      blockContent: { voice: { script: "Roteiro compartilhado", voice_id: "voz-1" } },
      // same_audio: UM ativo para o disparo inteiro — o identificador mora no
      // BLOCO (asset_id), nao no item (que aqui nem tem voice_asset_id).
      blockPersonalizationMode: "same_audio",
      blockAssetId: "va-shared-1",
      voiceAssets: { "va-shared-1": { caminho: "comercial/voz-compartilhada.ogg", invalidated_at: null } },
    };
    const { ctx, provider, body } = await runComClienteV2(opts);

    const assinaturas = ctx.signCalls.filter((c) => c.bucket === "multiplix-voice");
    assert(
      assinaturas.length === 1,
      `esperava 1 assinatura no bucket privado multiplix-voice, houve ${JSON.stringify(ctx.signCalls)}`,
    );
    assert(
      assinaturas[0].path === "comercial/voz-compartilhada.ogg",
      `same_audio tem de assinar o caminho do ativo DO BLOCO: ${assinaturas[0].path}`,
    );
    const audios = provider.posts.filter((p) => p.url.includes("sendWhatsAppAudio"));
    assert(audios.length === 1, `esperava 1 POST de audio, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
    assert(
      String(audios[0].body.audio).includes("/object/sign/multiplix-voice/comercial/voz-compartilhada.ogg"),
      `o audio enviado tem de ser a URL ASSINADA do ativo compartilhado: ${String(audios[0].body.audio)}`,
    );
    assert(body.sent === 1, `body.sent esperado 1, veio ${JSON.stringify(body)}`);
    assert(ctx.reschedules.length === 0, `ativo pronto nao pode voltar a fila: ${JSON.stringify(ctx.reschedules)}`);
    assert(ctx.deadLettered.length === 0, `ativo pronto nao pode dead-letter: deadLettered=${ctx.deadLettered.length}`);
  } finally {
    if (supabaseUrlAnterior === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", supabaseUrlAnterior);
  }
});

Deno.test("F65: voice_asset_id apontando ativo INVALIDADO segue pendente (multiplix_block_pending_media, zero POST)", async () => {
  // A invalidacao (F45: roteiro mudou, ativo regerado) devolve o item a fila com
  // o MESMO codigo do "sem ativo" — a ausencia REAL de ativo continua pendente.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550032")],
    blockType: "voice_ai",
    blockContent: { voice: { script: "Roteiro da {{empresa}}", voice_id: "voz-1" } },
    itemVoiceAssetId: "va-item-1",
    voiceAssets: { "va-item-1": { caminho: "comercial/voz-velha.ogg", invalidated_at: "2026-10-01T00:00:00Z" } },
  };
  const { ctx, provider } = await runComClienteV2(opts);
  assert(provider.posts.length === 0, `nenhum POST esperado, houve ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  assert(ctx.reschedules.length === 1, `esperava 1 reschedule, houve ${ctx.reschedules.length}`);
  assert(
    String(ctx.reschedules[0].p_error_message).includes("multiplix_block_pending_media"),
    `codigo nomeado esperado, veio: ${String(ctx.reschedules[0].p_error_message)}`,
  );
  assert(ctx.deadLettered.length === 0, `abaixo do teto nao pode dead-letter, deadLettered=${ctx.deadLettered.length}`);
});
