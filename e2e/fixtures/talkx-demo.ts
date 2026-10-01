import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Route } from '@playwright/test';

/**
 * Backend fake do Talk X para E2E determinístico (plano V4, etapa X003).
 *
 * `mockTalkXBackend(page, tela)` carrega `e2e/fixtures/talkx-demo/<tela>.json`
 * e intercepta, via `page.route`, as chamadas do módulo:
 *   - `rest/v1/talkx_*`            → GET devolve a fixture da tela; escrita → 403
 *   - `rest/v1/rpc/talkx_*`        → escrita não prevista (403)
 *   - `functions/v1/talkx-*`       → escrita não prevista (403)
 *
 * Qualquer escrita não prevista é bloqueada com o corpo `{ "message": "escrita não prevista" }`
 * — o demo nunca grava nem envia nada em produção. Criadores (`get_team_profiles`)
 * e contatos (insights) respondem vazios para o demo não ler produção.
 *
 * A fixture cresce junto com cada etapa de tela: a etapa que cria uma tabela/RPC
 * Talk X acrescenta a resposta dela no JSON da tela correspondente (ver e2e/README.md).
 *
 * `mockTalkXVisual(page, tela)` (etapa X004) soma ao backend fake uma sessão
 * Supabase falsa (injetada no localStorage, deslogada — sem secrets) e o mock dos
 * endpoints de identidade (`profiles`, `user_roles`, `user_has_permission`), para o
 * spec visual renderizar as telas sem login real e rodar em workflow de PR.
 */

export const ESCRITA_NAO_PREVISTA = 'escrita não prevista';

export type TalkXDemoData = Record<string, unknown[]>;

const here = import.meta.dirname;
const cache = new Map<string, TalkXDemoData>();

export function loadDemoData(tela: string): TalkXDemoData {
  if (!cache.has(tela)) {
    const file = join(here, 'talkx-demo', `${tela}.json`);
    cache.set(tela, JSON.parse(readFileSync(file, 'utf8')) as TalkXDemoData);
  }
  return cache.get(tela)!;
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

  // RPCs talkx_* e edge functions talkx-*: o demo nunca dispara envio/escrita.
  await page.route(/\/rest\/v1\/rpc\/talkx_[a-z_]+/, writeBlocked);
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
const AUTH_STORAGE_KEY = 'sb-tnnnlkbymytvtqngbbqh-auth-token';
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
    iss: 'https://tnnnlkbymytvtqngbbqh.supabase.co/auth/v1',
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
  // Perfil do usuário fake (AuthService.fetchProfile → profiles.maybeSingle()).
  await page.route(/\/rest\/v1\/profiles/, (route) => {
    if (!isRead(route.request().method())) return writeBlocked(route);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user_id: FAKE_USER_ID,
        name: 'Visual Talk X',
        email: FAKE_EMAIL,
        role: 'admin',
      }),
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
  await page.route(/\/rest\/v1\/(?!talkx_|rpc|profiles|user_roles|contacts)[a-z_]+/, (route) =>
    isRead(route.request().method()) ? emptyJson(route) : writeBlocked(route),
  );
}
