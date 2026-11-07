import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { SUPABASE_URL, SUPABASE_STORAGE_KEY } from './supabase-env';

/**
 * Backend fake do Talk X para E2E determinístico (plano V4, etapa X003).
 *
 * `mockTalkXBackend(page, tela)` carrega `e2e/fixtures/talkx-demo/<tela>.json`
 * e intercepta, via `page.route`, as chamadas do módulo:
 *   - `rest/v1/talkx_*`            → GET devolve a fixture da tela; escrita → 403
 *   - `rest/v1/rpc/talkx_*`        → escrita não prevista (403)
 *   - `functions/v1/talkx-*        → escrita não prevista (403)
 *
 * Qualquer escrita não prevista é bloqueada com o corpo `{ "message": "escrita não prevista" }`
 * — o demo nunca grava nem envia nada em produção. Criadores (`get_team_profiles`)
 * e contatos (insights) respondem vazios para o demo não ler produção.
 *
 * Contrato de crescimento (X003/X004): a fixture cresce junto com cada etapa de
 * tela — a etapa que cria uma tabela/RPC Talk X acrescenta a resposta dela no
 * JSON da tela correspondente. Enquanto a tela não tem fixture, o arquivo é `{}`
 * e a régua a PULA (não captura, não falha). Referenciar uma fixtura `{}` lança
 * `FixtureVaziaError` em vez de renderizar uma tela vazia em silêncio
 * (ver e2e/README.md e docs/talkx/v4/etapas/F00-regua-e-governanca.md).
 *
 * `mockTalkXVisual(page, tela)` (etapa X004) soma ao backend fake uma sessão
 * Supabase falsa (injetada no localStorage, deslogada — sem secrets) e o mock dos
 * endpoints de identidade (`profiles`, `user_roles`, `user_has_permission`), para o
 * spec visual renderizar as telas sem login real e rodar em workflow de PR.
 */

export const ESCRITA_NAO_PREVISTA = 'escrita não prevista';

export type TalkXDemoData = Record<string, unknown[]>;

const here = import.meta.dirname;
const demoDir = join(here, 'talkx-demo');
const cache = new Map<string, TalkXDemoData>();

/**
 * Erro do contrato de crescimento (plano V4, X003/X004): uma fixture de tela só
 * existe quando tem dados. Referenciar uma fixture vazia (`{}`) é erro — nunca
 * uma tela renderizada em branco "sem aviso".
 */
export class FixtureVaziaError extends Error {
  constructor(tela: string) {
    super(
      `fixture vazia para a tela "${tela}" ({}): nenhuma tabela/RPC Talk X foi mockada. ` +
        'O contrato de crescimento exige que a fixture da tela nasça na etapa daquela tela — ' +
        `popule e2e/fixtures/talkx-demo/${tela}.json antes de referenciá-la. ` +
        'A régua só cobre telas com fixture real (docs/talkx/v4/etapas/F00-regua-e-governanca.md).',
    );
    this.name = 'FixtureVaziaError';
  }
}

export function loadDemoData(tela: string): TalkXDemoData {
  if (!cache.has(tela)) {
    const file = join(demoDir, `${tela}.json`);
    const data = JSON.parse(readFileSync(file, 'utf8')) as TalkXDemoData;
    // Guard anti-vazio (X003): sem isto, `data[table] ?? []` faria a tela
    // renderizar vazia sem erro. Uma fixture {} aborta o teste em vez de passar.
    if (Object.keys(data).length === 0) throw new FixtureVaziaError(tela);
    cache.set(tela, data);
  }
  return cache.get(tela)!;
}

function fixtures(): { slug: string; dados: boolean }[] {
  return readdirSync(demoDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort()
    .map((slug) => {
      const data = JSON.parse(readFileSync(join(demoDir, `${slug}.json`), 'utf8')) as TalkXDemoData;
      return { slug, dados: Object.keys(data).length > 0 };
    });
}

/** Slugs (`NN-nome`) das fixtures que têm dados reais — hoje só a tela 01. */
export function fixturesComDados(): string[] {
  return fixtures()
    .filter((f) => f.dados)
    .map((f) => f.slug);
}

/** Slugs (`NN-nome`) das fixtures ainda vazias (`{}`), não populadas. */
export function fixturesVazias(): string[] {
  return fixtures()
    .filter((f) => !f.dados)
    .map((f) => f.slug);
}

/**
 * Slug da fixture real da tela `nn`, ou `undefined` quando ela ainda é `{}`
 * (não populada). A régua usa isto para PULAR telas sem fixture — a ausência
 * não é falha, é "ainda não é a etapa desta tela".
 */
export function fixtureDaTela(nn: string): string | undefined {
  return fixturesComDados().find((slug) => slug.startsWith(`${nn}-`));
}

function writeBlocked(route: Route) {
  return route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ message: ESCRITA_NAO_PREVISTA }),
  });
}

function emptyJson(route: Route) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
}

const isRead = (m: string) => m === 'GET' || m === 'HEAD';

type DemoCampaign = {
  status?: string;
  started_at?: string | null;
};

type DemoRecipient = {
  contact_id?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
};

function inWindow(value: string | null | undefined, from: number, to: number): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= from && time < to;
}

/**
 * Resposta mínima fiel à RPC `talkx_overview_stats` consumida pela Visão geral.
 * Os números saem da própria fixture e respeitam a janela pedida pelo cliente;
 * assim o demo não consulta o banco nem inventa o KPI que pretende validar.
 */
function overviewStatsFromFixture(data: TalkXDemoData, body: unknown) {
  const params = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const from = Date.parse(String(params.p_from ?? '2020-01-01T00:00:00.000Z'));
  const to = Date.parse(String(params.p_to ?? '2100-01-01T00:00:00.000Z'));
  const campaigns = (data.talkx_campaigns ?? []) as DemoCampaign[];
  const recipients = (data.talkx_recipients ?? []) as DemoRecipient[];
  const currentCampaigns = campaigns.filter((campaign) => inWindow(campaign.started_at, from, to));
  const sent = recipients.filter((recipient) => inWindow(recipient.sent_at, from, to));
  const delivered = recipients.filter((recipient) => inWindow(recipient.delivered_at, from, to));
  const contactsReached = new Set(sent.map((recipient) => recipient.contact_id).filter(Boolean)).size;
  const active = campaigns.filter((campaign) =>
    campaign.status === 'sending' || campaign.status === 'scheduled' || campaign.status === 'paused'
  ).length;

  return {
    current: {
      campaigns_sent: currentCampaigns.length,
      completed: currentCampaigns.filter((campaign) => campaign.status === 'completed').length,
      contacts_reached: contactsReached,
      sent: sent.length,
      delivery_rate_pct: sent.length > 0 ? Number(((delivered.length / sent.length) * 100).toFixed(1)) : 0,
    },
    previous: null,
    active,
    daily: [],
  };
}

export async function mockTalkXBackend(page: Page, tela: string) {
  const data = loadDemoData(tela);

  // Tabelas talkx_*: GET devolve a fixture; escrita é bloqueada.
  await page.route(/\/rest\/v1\/talkx_[a-z_]+/, (route) => {
    if (!isRead(route.request().method())) return writeBlocked(route);
    const table = route.request().url().match(/\/rest\/v1\/(talkx_[a-z_]+)/)?.[1];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data[table ?? ''] ?? []),
    });
  });

  // A Visão geral lê seus KPIs por RPC. Ela é uma leitura determinística da
  // fixture; as demais RPCs talkx_* continuam bloqueadas como escrita imprevista.
  await page.route(/\/rest\/v1\/rpc\/talkx_[a-z_]+/, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/talkx_overview_stats') && route.request().method() === 'POST') {
      let body: unknown = {};
      try { body = route.request().postDataJSON(); } catch { /* corpo inválido usa a janela padrão */ }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overviewStatsFromFixture(data, body)),
      });
    }
    return writeBlocked(route);
  });
  await page.route(/\/functions\/v1\/talkx-[a-z-]+/, writeBlocked);

  // Criadores (get_team_profiles) e contatos (insights) respondem vazios para o
  // demo não ler produção. RPCs são POST no Supabase; contatos é GET/HEAD.
  await page.route(/\/rest\/v1\/rpc\/get_team_profiles/, (route) =>
    route.request().method() === 'POST' ? emptyJson(route) : writeBlocked(route),
  );
  await page.route(/\/rest\/v1\/contacts/, (route) =>
    isRead(route.request().method()) ? emptyJson(route) : writeBlocked(route),
  );
}

// ---------------------------------------------------------------------------
// Sessão falsa + mock de identidade (X004, spec visual deslogado)
// ---------------------------------------------------------------------------

export const FAKE_USER_ID = '00000000-0000-4000-8000-000000000001';
const FAKE_EMAIL = 'visual@test.local';
const AUTH_STORAGE_KEY = SUPABASE_STORAGE_KEY;
const FAKE_EXP = 4102444800; // 2100-01-01T00:00:00Z — nunca expira no teste

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function fakeJwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.ZmFrZS1zaWduYXR1cmU`;
}

// O GoTrue lê esta chave do localStorage em `getSession()` e valida apenas o
// `expires_at` (não assina/decodifica o token localmente). A estrutura imita o
// `Session` do @supabase/supabase-js para o app (ProtectedRoute, useUserRole,
// fetchProfile) ver um usuário autenticado.
const FAKE_SESSION = {
  access_token: fakeJwt({
    sub: FAKE_USER_ID,
    email: FAKE_EMAIL,
    role: 'authenticated',
    aud: 'authenticated',
    exp: FAKE_EXP,
    iat: 0,
    iss: SUPABASE_URL + '/auth/v1',
  }),
  refresh_token: 'fake-refresh-token',
  expires_at: FAKE_EXP,
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: FAKE_EMAIL,
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    phone: '',
    confirmed_at: '2026-01-01T00:00:00.000Z',
    last_sign_in_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    is_anonymous: false,
  },
};

export async function installFakeSession(page: Page) {
  await page.addInitScript(
    ({ storageKey, session, themeKey, onboardingKey }) => {
      localStorage.setItem(storageKey, JSON.stringify(session));
      localStorage.setItem(themeKey, 'dark');
      // Marca o onboarding como concluído para o WelcomeModal não abrir e
      // bloquear os cliques do spec visual (useOnboarding lê este flag antes
      // de consultar user_settings).
      localStorage.setItem(`${onboardingKey}_${session.user.id}`, 'true');
    },
    {
      storageKey: AUTH_STORAGE_KEY,
      session: FAKE_SESSION,
      themeKey: 'theme',
      onboardingKey: 'onboarding_completed',
    },
  );
}

export async function mockTalkXAuth(page: Page) {
  // Perfil do usuário fake. PostgREST devolve ARRAY num select de tabela — e o
  // `.maybeSingle()` do cliente desembrulha sozinho quando volta 1 linha
  // (`data = data[0]`), então array serve para os dois formatos de leitura.
  // Responder objeto quebra quem LISTA `profiles` sem filtro de id (passo 1 do
  // wizard de campanha, V25: `.select('id,name,email').eq('is_active', true)`):
  // o array vira objeto, `(ed.owners ?? []).map` estoura TypeError a tela cai
  // no error boundary ("Erro ao carregar Campanhas") em vez de renderizar.
  await page.route(/\/rest\/v1\/profiles/, (route) => {
    if (!isRead(route.request().method())) return writeBlocked(route);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: FAKE_USER_ID,
          user_id: FAKE_USER_ID,
          name: 'Visual Talk X',
          email: FAKE_EMAIL,
          role: 'admin',
        },
      ]),
    });
  });

  // Papéis do usuário fake (RoleService.fetchUserRoles → user_roles.select('role')).
  await page.route(/\/rest\/v1\/user_roles/, (route) => {
    if (!isRead(route.request().method())) return writeBlocked(route);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ role: 'admin' }]),
    });
  });

  // Permissão nomeada (RoleService.checkPermission → rpc/user_has_permission).
  await page.route(/\/rest\/v1\/rpc\/user_has_permission/, (route) => {
    if (route.request().method() !== 'POST') return writeBlocked(route);
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
  });

  // O shell exige o bootstrap antes de liberar rotas protegidas. As duas
  // fixtures que usam esta identidade (Talk X e Email) compartilham a resposta.
  await page.route(/\/rest\/v1\/rpc\/app_bootstrap/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      profile: { id: FAKE_USER_ID, name: 'Visual Talk X' },
      roles: ['admin'],
      permissions: [],
      role_permissions: [],
      global_settings: [],
      user_settings: { onboarding_completed: true },
      departments: [],
      unread_notifications: 0,
      fetched_at: '2026-10-01T12:00:00.000Z',
    }),
  }));
  await page.route(/\/rest\/v1\/user_settings/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ onboarding_completed: true }]),
  }));

  // GoTrue auth: JWT com assinatura falsa não passa na validação do servidor local;
  // mocamos /auth/v1/user e /auth/v1/token para o app não receber 403 bad_jwt.
  await page.route(/\/auth\/v1\/user/, (route) =>
    isRead(route.request().method())
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_SESSION.user) })
      : writeBlocked(route),
  );
  await page.route(/\/auth\/v1\/token/, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_SESSION) })
      : writeBlocked(route),
  );
}

/**
 * Sessão falsa + identidade + dados do Talk X. As demais tabelas do app shell
 * (notificações, contadores, etc.) respondem vazias — o spec visual nunca toca
 * o banco de produção.
 */
export async function mockTalkXVisual(page: Page, tela: string) {
  await installFakeSession(page);
  await mockTalkXAuth(page);
  await mockTalkXBackend(page, tela);

  // Catch-all para as leituras do app shell não interceptadas acima.
  await page.route(/\/rest\/v1\/(?!talkx_|rpc|profiles|user_roles|contacts|user_settings)[a-z_]+/, (route) =>
    isRead(route.request().method()) ? emptyJson(route) : writeBlocked(route),
  );
}
