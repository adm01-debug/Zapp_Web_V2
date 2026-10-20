import { test, expect, type Page } from '@playwright/test';
import { E2E_FIXTURE_CONTACT_ID, E2E_FIXTURE_CONTACT_DISPLAY_NAME } from './fixtures/e2e-contact';
import { SUPABASE_URL } from './fixtures/supabase-env';

// L08 — ponta a ponta de "abrir o e-mail do contato" (C03).
//
// Plano: docs/plans/PLANO_EMAIL_LINK_CONTATO_14_ETAPAS_2026-10-07.md (E06–E10).
//
// O teste roda o app REAL contra o BANCO LOCAL do conjunto do cartão
// (`zapp-e2e-local`). A SEMEADURA (conta Gmail, conversa e mensagens) é feita
// por REST com a SERVICE_ROLE_KEY **do conjunto local** — as policies finais
// bloqueiam INSERT em `gmail_accounts`/`email_threads`/`email_messages` para
// `authenticated` (só a Edge Function, que usa service role, cria esse dado em
// produção). Nada toca produção: se a URL não for 127.0.0.1/localhost o spec se
// auto-pula. A SERVICE_ROLE_KEY sai de `zapp-db-local env` (só existe no local).
//
// Fluxo exercitado (igual ao EmailChatInbox.contato.test.tsx, agora no app real):
//  - painel de detalhes do contato no inbox → tile "E-mail";
//  - contato SEM e-mail   → tile desabilitado;
//  - contato COM e-mail + conta Gmail + conversa → abre ?emailThread e limpa emailContact;
//  - contato COM e-mail + conta Gmail sem conversa → abre o compositor com o destinatário;
//  - contato COM e-mail SEM conta Gmail → tela de conectar e parâmetros preservados;
//  - Voltar/avançar depois de consumir → não reabre emailContact.

const CONTATO_EMAIL = 'e2e.l08.contato@example.com';
const CONTA_EMAIL = 'e2e.l08.conta@example.com';
const THREAD_MARK = 'e2e-l08-thread';
const MSG_MARK = 'e2e-l08-msg';
const ASSUNTO = '[E2E] Conversa do contato L08';
const CORPO = 'corpo-semeado-l08';
const MSG_SETUP = '[E2E L08 setup] mensagem para abrir a conversa';

const API_URL = process.env.API_URL ?? SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY ?? '';

const HOST_LOCAL = (() => {
  try {
    return ['127.0.0.1', 'localhost', '::1'].includes(new URL(API_URL).hostname);
  } catch {
    return false;
  }
})();

const IS_LOCAL =
  process.env.ZAPP_E2E_LOCAL === '1' &&
  HOST_LOCAL &&
  SERVICE_ROLE_KEY.length > 0 &&
  /^http:\/\/(127\.0\.0\.1|localhost):/.test(SUPABASE_URL);

test.skip(
  !IS_LOCAL,
  'Só roda sob `zapp-e2e-local` com `zapp-db-local env` exportado (banco local). Escrever no Supabase fora do conjunto local é proibido.',
);

async function getSession(page: Page): Promise<{ accessToken: string; userId: string }> {
  const session = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { access_token?: string; user?: { id?: string } };
        if (parsed.access_token) return { access_token: parsed.access_token, user_id: parsed.user?.id ?? null };
      } catch {
        // entrada que não é do supabase-js
      }
    }
    return null;
  });
  if (!session?.access_token || !session.user_id) {
    throw new Error(
      'Sessão do Supabase não encontrada no localStorage — o project "setup" (e2e/auth.setup.ts) ' +
        'precisa ter logado no GoTrue LOCAL antes (o projeto autenticado depende dele).',
    );
  }
  return { accessToken: session.access_token, userId: session.user_id };
}

/** REST no conjunto LOCAL com service role (bypassa RLS). Base da semeadura. */
async function restAdmin(
  method: string,
  path: string,
  data?: unknown,
  extra: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${API_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...extra,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

/** Apaga tudo o que este spec semeia e zera o e-mail do contato fixo. */
async function limparSemeadura() {
  await restAdmin('DELETE', `email_messages?gmail_message_id=like.${MSG_MARK}%`);
  await restAdmin('DELETE', `email_threads?gmail_thread_id=like.${THREAD_MARK}%`);
  await restAdmin('DELETE', `gmail_accounts?email_address=eq.${CONTA_EMAIL}`);
  await restAdmin('DELETE', `messages?content=eq.${encodeURIComponent(MSG_SETUP)}`);
  await restAdmin('PATCH', `contacts?id=eq.${E2E_FIXTURE_CONTACT_ID}`, { email: null }, {
    Prefer: 'return=minimal',
  });
}

/** Ativa/desativa o e-mail do contato fixo. */
async function definirEmailDoContato(email: string | null) {
  const res = await restAdmin(
    'PATCH',
    `contacts?id=eq.${E2E_FIXTURE_CONTACT_ID}`,
    { email },
    { Prefer: 'return=representation' },
  );
  expect(res.ok, `PATCH contacts falhou: HTTP ${res.status} ${await res.text().catch(() => '')}`).toBeTruthy();
}

/** Cria uma conta Gmail local para o usuário logado e devolve o id. */
async function criarContaGmail(userId: string): Promise<string> {
  const res = await restAdmin(
    'POST',
    'gmail_accounts',
    { user_id: userId, email_address: CONTA_EMAIL, is_active: true, sync_status: 'synced' },
    { Prefer: 'return=representation' },
  );
  const corpo = await res.text();
  expect(res.ok, `INSERT gmail_accounts falhou: HTTP ${res.status} ${corpo}`).toBeTruthy();
  const rows = JSON.parse(corpo) as Array<{ id: string }>;
  return rows[0].id;
}

/** Associa a conta a uma conversa de e-mail do contato fixo (com uma mensagem). */
async function criarConversaDoContato(accountId: string): Promise<void> {
  const res = await restAdmin(
    'POST',
    'email_threads',
    {
      gmail_account_id: accountId,
      gmail_thread_id: THREAD_MARK,
      contact_id: E2E_FIXTURE_CONTACT_ID,
      subject: ASSUNTO,
      snippet: CORPO,
      label_ids: ['INBOX'],
      message_count: 1,
      is_unread: false,
      last_message_at: new Date().toISOString(),
    },
    { Prefer: 'return=representation' },
  );
  const corpoThread = await res.text();
  expect(res.ok, `INSERT email_threads falhou: HTTP ${res.status} ${corpoThread}`).toBeTruthy();
  const threadId = (JSON.parse(corpoThread) as Array<{ id: string }>)[0].id;

  const msgRes = await restAdmin(
    'POST',
    'email_messages',
    {
      thread_id: threadId,
      gmail_message_id: `${MSG_MARK}-1`,
      gmail_account_id: accountId,
      from_address: CONTATO_EMAIL,
      from_name: 'Contato E2E L08',
      to_addresses: [CONTA_EMAIL],
      subject: ASSUNTO,
      body_text: CORPO,
      snippet: CORPO,
      internal_date: new Date().toISOString(),
      direction: 'inbound',
    },
    { Prefer: 'return=minimal' },
  );
  expect(msgRes.ok, `INSERT email_messages falhou: HTTP ${msgRes.status} ${await msgRes.text().catch(() => '')}`).toBeTruthy();
}

/**
 * Abre a conversa do contato fixo no inbox SEM depender de `ensureFixtureConversationOpen`
 * (que grava `sender: 'contact'`, reprovado pelo trigger de proveniência r2_db_022:
 * de usuário autenticado só passa `sender: 'agent'`). Grava uma mensagem do agente
 * marcada com MSG_SETUP para o contato aparecer na janela do inbox.
 */
async function garantirConversaAberta() {
  await restAdmin('POST', 'rpc/set_conversation_status', {
    p_contact_id: E2E_FIXTURE_CONTACT_ID,
    p_status: 'open',
  });
  const res = await restAdmin(
    'POST',
    'messages',
    { contact_id: E2E_FIXTURE_CONTACT_ID, sender: 'agent', content: MSG_SETUP, message_type: 'text' },
    { Prefer: 'return=minimal' },
  );
  expect(res.ok, `INSERT messages (setup) falhou: HTTP ${res.status} ${await res.text().catch(() => '')}`).toBeTruthy();
}

/** Abre o painel de detalhes do contato fixo no inbox e espera o tile de e-mail. */
async function abrirPainelDoContato(page: Page) {
  await page.goto('/');
  await garantirConversaAberta();
  await page.reload();
  await expect(page.getByTestId('status-chip-all')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('status-chip-all').click();
  await page
    .getByTestId('conversation-item')
    .filter({ hasText: E2E_FIXTURE_CONTACT_DISPLAY_NAME })
    .first()
    .click();
  await expect(page.getByTestId('contact-panel')).toBeVisible({ timeout: 20_000 });
}

function tileEmail(page: Page) {
  return page
    .getByTestId('contact-panel')
    .locator('button[data-testid="contact-action-tile"][aria-label="E-mail"]');
}

test.describe('Abrir o e-mail do contato a partir do painel (C03) — ponta a ponta', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    await limparSemeadura();
  });

  test('contato sem e-mail: o tile "E-mail" fica desabilitado', async ({ page }) => {
    await page.goto('/');
    await limparSemeadura();
    await abrirPainelDoContato(page);

    const tile = tileEmail(page);
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await expect(tile).toBeDisabled();
    // Não navega para o e-mail, continua no inbox (a raiz sem view também é inbox).
    await expect(page).not.toHaveURL(/view=email-chat/);
  });

  test('com conta Gmail e conversa do contato: abre a conversa e limpa emailContact', async ({ page }) => {
    await page.goto('/');
    await limparSemeadura();
    const { userId } = await getSession(page);
    await definirEmailDoContato(CONTATO_EMAIL);
    const accountId = await criarContaGmail(userId);
    await criarConversaDoContato(accountId);
    await abrirPainelDoContato(page);

    await tileEmail(page).click();

    await expect(page).toHaveURL(/view=email-chat/, { timeout: 20_000 });
    // Consome a intenção: ganha emailThread e perde emailContact/emailTo.
    await expect(page).toHaveURL(/emailThread=/, { timeout: 20_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('emailContact')).toBeNull();
    expect(url.searchParams.get('emailTo')).toBeNull();
    await expect(page.getByText(ASSUNTO).first()).toBeVisible({ timeout: 20_000 });
  });

  test('com conta Gmail e sem conversa: abre o compositor com o destinatário do contato', async ({ page }) => {
    await page.goto('/');
    await limparSemeadura();
    const { userId } = await getSession(page);
    await definirEmailDoContato(CONTATO_EMAIL);
    await criarContaGmail(userId); // conta ativa, porém sem thread do contato
    await abrirPainelDoContato(page);

    await tileEmail(page).click();

    await expect(page).toHaveURL(/view=email-chat/, { timeout: 20_000 });
    const destinatarios = page.getByLabel('Destinatários');
    await expect(destinatarios).toBeVisible({ timeout: 20_000 });
    await expect(destinatarios).toHaveValue(CONTATO_EMAIL);
    const url = new URL(page.url());
    expect(url.searchParams.get('emailContact')).toBeNull();
    expect(url.searchParams.get('emailTo')).toBeNull();
    expect(url.searchParams.get('emailThread')).toBeNull();
  });

  test('sem conta Gmail: mostra a tela de conectar e preserva o pedido', async ({ page }) => {
    await page.goto('/');
    await limparSemeadura();
    await definirEmailDoContato(CONTATO_EMAIL);
    await abrirPainelDoContato(page);

    await tileEmail(page).click();

    await expect(page).toHaveURL(/view=email-chat/, { timeout: 20_000 });
    await expect(page.getByText('Conecte seu Gmail ao ZAPP')).toBeVisible({ timeout: 20_000 });
    // O pedido fica guardado para quando a conta aparecer.
    const url = new URL(page.url());
    expect(url.searchParams.get('emailContact')).toBe(E2E_FIXTURE_CONTACT_ID);
    expect(url.searchParams.get('emailTo')).toBe(CONTATO_EMAIL);
  });

  test('Voltar depois de consumir não reabre a intenção de contato', async ({ page }) => {
    await page.goto('/');
    await limparSemeadura();
    const { userId } = await getSession(page);
    await definirEmailDoContato(CONTATO_EMAIL);
    const accountId = await criarContaGmail(userId);
    await criarConversaDoContato(accountId);
    await abrirPainelDoContato(page);

    await tileEmail(page).click();
    await expect(page).toHaveURL(/emailThread=/, { timeout: 20_000 });

    await page.goBack();
    await expect(page).not.toHaveURL(/view=email-chat/);

    await page.goForward();
    await expect(page).toHaveURL(/view=email-chat/, { timeout: 20_000 });
    const url = new URL(page.url());
    // A intenção de contato já foi consumida (replace): voltar não a reaplica.
    expect(url.searchParams.get('emailContact')).toBeNull();
    expect(url.searchParams.get('emailTo')).toBeNull();
    await expect(page.getByText(ASSUNTO).first()).toBeVisible({ timeout: 20_000 });
  });
});
