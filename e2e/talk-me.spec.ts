import { expect, test, type Page, type Route } from '@playwright/test';

import {
  bloquearRedeReal,
  json,
  mockAppShell,
  querObjetoUnico,
  type Registro,
} from './fixtures/mapa-mocks';
import { FAKE_USER_ID, installFakeSession } from './fixtures/talkx-demo';

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1440, height: 900 },
});
test.setTimeout(120_000);

const QUEUE_ID = 'e2e10000-0000-4000-8000-000000000001';
const PHOTO =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect width=%2240%22 height=%2240%22 rx=%2220%22 fill=%22%232563eb%22/%3E%3Ctext x=%2220%22 y=%2225%22 text-anchor=%22middle%22 font-size=%2213%22 fill=%22white%22%3EAA%3C/text%3E%3C/svg%3E';

type Scenario = 'filled' | 'empty' | 'query-error';

type WaitingRow = {
  contact_id: string;
  contact_name: string;
  avatar_url: string | null;
  company: string;
  job_title: string;
  queue_id: string;
  queue_name: string;
  queue_color: string;
  waiting_since: string;
  pending_message_count: number;
  last_message_id: string;
  last_message_content: string;
  last_message_type: string;
  last_message_media_url: null;
  last_message_caption: null;
  last_message_at: string;
  total_count: number;
  queue_position: number;
};

const CONTACT_FIXTURES = [
  {
    id: 'e2e10000-0000-4000-8000-000000000101',
    name: 'Ana Antiga Sintetica',
    phone: '5511900001101',
    avatar_url: PHOTO,
    company: 'Aurora Testes Ltda',
    job_title: 'Analista de Qualidade',
    waitMinutes: 45,
    messageId: 'e2e10000-0000-4000-8000-000000000201',
    message: 'Mensagem sintetica da Ana para validar a ordem da fila.',
  },
  {
    id: 'e2e10000-0000-4000-8000-000000000102',
    name: 'Bruno Navegacao Sintetico',
    phone: '5511900001102',
    avatar_url: null,
    company: 'Boreal Laboratorio',
    job_title: 'Coordenador de Testes',
    waitMinutes: 20,
    messageId: 'e2e10000-0000-4000-8000-000000000202',
    message: 'Mensagem sintetica do Bruno para validar a navegacao.',
  },
  {
    id: 'e2e10000-0000-4000-8000-000000000103',
    name: 'Carla Busca Sintetica',
    phone: '5511900001103',
    avatar_url: null,
    company: 'Cosmos Homologacao',
    job_title: 'Especialista de Suporte',
    waitMinutes: 5,
    messageId: 'e2e10000-0000-4000-8000-000000000203',
    message: 'Mensagem sintetica da Carla para validar a busca e o aceite.',
  },
] as const;

function objectBody(route: Route): Record<string, unknown> {
  const body: unknown = route.request().postDataJSON();
  return typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
}

function waitingRows(): WaitingRow[] {
  const now = Date.now();
  return CONTACT_FIXTURES.map((contact, index) => {
    const timestamp = new Date(now - contact.waitMinutes * 60_000).toISOString();
    return {
      contact_id: contact.id,
      contact_name: contact.name,
      avatar_url: contact.avatar_url,
      company: contact.company,
      job_title: contact.job_title,
      queue_id: QUEUE_ID,
      queue_name: 'Suporte E2E',
      queue_color: '#2563EB',
      waiting_since: timestamp,
      pending_message_count: 1,
      last_message_id: contact.messageId,
      last_message_content: contact.message,
      last_message_type: 'text',
      last_message_media_url: null,
      last_message_caption: null,
      last_message_at: timestamp,
      total_count: CONTACT_FIXTURES.length,
      queue_position: index + 1,
    };
  });
}

function inboxContacts(claimedContactId: string | null) {
  const now = new Date().toISOString();
  return CONTACT_FIXTURES.map((contact) => ({
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    avatar_url: contact.avatar_url,
    company: contact.company,
    job_title: contact.job_title,
    queue_id: QUEUE_ID,
    assigned_to: contact.id === claimedContactId ? FAKE_USER_ID : null,
    conversation_status: contact.id === claimedContactId ? 'open' : 'waiting',
    channel_type: 'whatsapp',
    contact_type: 'cliente',
    group_category: null,
    deleted_at: null,
    tags: [],
    notes: null,
    created_at: now,
    updated_at: now,
    conversation_sla: null,
  }));
}

function inboxMessages() {
  const rows = waitingRows();
  return rows.map((row) => ({
    id: row.last_message_id,
    contact_id: row.contact_id,
    sender: 'contact',
    content: row.last_message_content,
    message_type: 'text',
    media_url: null,
    caption: null,
    is_read: false,
    is_deleted: false,
    external_id: `talk-me-${row.contact_id}`,
    status: 'sent',
    status_updated_at: null,
    created_at: row.last_message_at,
    updated_at: row.last_message_at,
  }));
}

async function installSessionForConfiguredSupabase(page: Page): Promise<void> {
  await installFakeSession(page);
  await page.addInitScript(() => {
    const officialKey = 'sb-tnnnlkbymytvtqngbbqh-auth-token';
    const session = localStorage.getItem(officialKey);
    if (!session) return;
    localStorage.setItem('sb-127-auth-token', session);
    localStorage.setItem('sb-localhost-auth-token', session);
  });
}

async function mockTalkMe(page: Page, registro: Registro, scenario: Scenario): Promise<void> {
  let claimedContactId: string | null = null;

  // page.route não intercepta WebSocket. Mantemos o canal Realtime mudo para a
  // fixture nunca abrir socket no projeto oficial nem depender do banco local.
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => undefined);
  await bloquearRedeReal(page, registro);
  await mockAppShell(page, registro);
  await installSessionForConfiguredSupabase(page);

  // O shell atual hidrata perfil e papeis pela RPC única de bootstrap. O
  // catch-all compartilhado responde null; aqui devolvemos o contrato completo
  // para a rota protegida sair de "Verificando permissões" deterministicamente.
  await page.route(/\/rest\/v1\/rpc\/app_bootstrap/, (route) => json(route, {
    profile: { id: FAKE_USER_ID, name: 'Atendente E2E' },
    roles: ['admin'],
    permissions: [],
    role_permissions: [],
    global_settings: [],
    user_settings: null,
    departments: [],
    unread_notifications: 0,
    fetched_at: '2026-10-20T12:00:00.000Z',
  }));
  await page.route(/\/rest\/v1\/user_settings/, (route) => json(
    route,
    querObjetoUnico(route) ? { onboarding_completed: true } : [{ onboarding_completed: true }],
  ));

  await page.route(/\/rest\/v1\/feature_flags/, (route) => json(route, [{
    key: 'inbox.talk-me',
    enabled: true,
    description: 'Fixture sintetica do TALK ME',
    updated_at: '2026-10-20T12:00:00.000Z',
  }]));

  await page.route(/\/rest\/v1\/contacts/, (route) => {
    if (route.request().method() !== 'GET') return json(route, []);
    return json(route, scenario === 'filled' ? inboxContacts(claimedContactId) : []);
  });
  await page.route(/\/rest\/v1\/messages/, (route) => {
    if (route.request().method() === 'GET') {
      return json(route, scenario === 'filled' ? inboxMessages() : []);
    }
    return json(route, []);
  });

  await page.route(/\/rest\/v1\/rpc\/talk_me_list_queues/, (route) => json(route, [{
    queue_id: QUEUE_ID,
    queue_name: 'Suporte E2E',
    queue_color: '#2563EB',
    waiting_count: scenario === 'filled' ? 3 : 0,
    oldest_waiting_at: scenario === 'filled' ? waitingRows()[0].waiting_since : null,
  }]));

  await page.route(/\/rest\/v1\/rpc\/talk_me_list_waiting/, (route) => {
    if (scenario === 'query-error') {
      return json(route, { code: 'E2E_QUERY_ERROR', message: 'falha sintetica controlada' }, 500);
    }
    if (scenario === 'empty') return json(route, []);

    const search = String(objectBody(route).p_search ?? '').trim().toLocaleLowerCase('pt-BR');
    const filtered = waitingRows().filter((row) =>
      !search || [row.contact_name, row.company, row.job_title, row.last_message_content]
        .some((value) => value.toLocaleLowerCase('pt-BR').includes(search)),
    );
    return json(route, filtered.map((row, index) => ({
      ...row,
      total_count: filtered.length,
      queue_position: index + 1,
    })));
  });

  await page.route(/\/rest\/v1\/rpc\/talk_me_claim/, (route) => {
    const contactId = String(objectBody(route).p_contact_id ?? '');
    claimedContactId = contactId;
    return json(route, [{
      contact_id: contactId,
      queue_id: QUEUE_ID,
      assigned_to: FAKE_USER_ID,
      conversation_status: 'open',
      claimed_at: new Date().toISOString(),
    }]);
  });
  await page.route(/\/rest\/v1\/rpc\/talk_me_list_pending_messages/, (route) => json(route, []));
}

async function openTalkMe(page: Page): Promise<void> {
  await page.goto('/');
  const button = page.locator([
    '[data-testid="talk-me-button"]:visible',
    '[data-testid="talk-me-button-empty"]:visible',
    '[data-testid="talk-me-button-mobile"]:visible',
  ].join(', '));
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click();
  await expect(page.getByRole('dialog', { name: /TALK ME/i })).toBeVisible();
}

test.describe('TALK ME — fila e aceite', () => {
  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as Window & { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = 60_000;
      sessionStorage.removeItem('zapp:talk-me:selected-queue');
    });
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  test('abre, revisa a fila sem aceitar, busca e abre somente o contato aceito', async ({ page }) => {
    await mockTalkMe(page, registro, 'filled');
    await openTalkMe(page);

    const dialog = page.getByRole('dialog', { name: /TALK ME/i });
    const department = dialog.getByRole('combobox', { name: 'Departamento' });
    await expect(department).toContainText('Suporte E2E');
    await expect(dialog.getByText('3 aguardando em Suporte E2E')).toBeVisible();

    const oldest = dialog.getByRole('button', { name: CONTACT_FIXTURES[0].name, exact: true });
    await expect(oldest).toBeVisible();
    await expect(oldest.locator('img')).toHaveAttribute('src', PHOTO);
    await expect(oldest).toContainText(CONTACT_FIXTURES[0].company);
    await expect(oldest).toContainText(CONTACT_FIXTURES[0].job_title);
    await expect(oldest).toContainText('Aguardando há 45 minutos');
    await expect(oldest).toContainText('#1');

    await dialog.getByRole('button', { name: 'Próximo atendimento' }).click();
    await expect(dialog.getByRole('button', { name: CONTACT_FIXTURES[1].name, exact: true })).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('heading', { name: CONTACT_FIXTURES[1].name, exact: true })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Atendimento anterior' }).click();
    await expect(oldest).toBeVisible();

    const search = dialog.getByRole('textbox', { name: 'Buscar na fila TALK ME' });
    await search.fill('Carla Busca');
    const waitingStrip = dialog.getByTestId('talk-me-waiting-strip');
    await expect(waitingStrip.getByRole('button', { name: /Selecionar Carla Busca Sintetica/ })).toBeVisible();
    await expect(waitingStrip.getByRole('button', { name: /^Selecionar / })).toHaveCount(1);
    await expect(dialog.getByText('1 aguardando em Suporte E2E')).toBeVisible();

    await dialog.getByRole('button', { name: 'Aceitar e conversar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: CONTACT_FIXTURES[2].name, exact: true })).toBeVisible();
  });

  test('distingue departamento sem contatos de uma falha de consulta', async ({ page }) => {
    await mockTalkMe(page, registro, 'empty');
    await openTalkMe(page);

    const dialog = page.getByRole('dialog', { name: /TALK ME/i });
    await expect(dialog.getByRole('heading', { name: 'Tudo em dia' })).toBeVisible();
    await expect(dialog.getByText('Não há contatos aguardando aceite neste departamento.')).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
  });

  test('mostra erro de consulta sem apresentar a fila como vazia', async ({ page }) => {
    await mockTalkMe(page, registro, 'query-error');
    await openTalkMe(page);

    const dialog = page.getByRole('dialog', { name: /TALK ME/i });
    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText('Fila temporariamente indisponível');
    await expect(alert).toContainText('Não foi possível carregar os atendimentos.');
    await expect(dialog.getByRole('heading', { name: 'Tudo em dia' })).toHaveCount(0);
  });
});
