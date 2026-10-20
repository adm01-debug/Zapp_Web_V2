import { test, expect, type Page } from '@playwright/test';

// Mesmos valores de e2e/fixtures/e2e-contact.ts — duplicados aqui porque o
// runner do Playwright não resolve o alias "@/" do bundler.
const SUPABASE_URL = 'https://tnnnlkbymytvtqngbbqh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRubm5sa2J5bXl0dnRxbmdiYnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MjU0MDEsImV4cCI6MjEwMzMwMTQwMX0.4kDVowXzo3yBVboLOFn1bsij-vBKncJXVoPot3iknC0';

const FIXTURE_CONTACT_ID = '04dff4dc-c6b1-4283-ac22-bd8639804759';
// Email exclusivo do fixture E2E; não deve coincidir com nenhum contato real.
const FIXTURE_EMAIL = 'e2e-dup-guard@promobrindes.com.br';
// Telefone exclusivo do fixture E2E; sufixo "88776655" não deve existir em outro contato.
const FIXTURE_PHONE = '11988776655';

async function getAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { access_token?: string };
        if (parsed.access_token) return parsed.access_token;
      } catch { /* ignora entrada inválida */ }
    }
    return null;
  });
  if (!token) throw new Error('Sessão Supabase não encontrada no localStorage');
  return token;
}

// Garante que o contato fixture tenha o FIXTURE_EMAIL cadastrado.
// Usa return=representation para detectar falha silenciosa de RLS (0 linhas → array vazio).
async function ensureFixtureEmail(page: Page): Promise<void> {
  const accessToken = await getAccessToken(page);
  const res = await page.request.patch(
    `${SUPABASE_URL}/rest/v1/contacts?id=eq.${FIXTURE_CONTACT_ID}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      data: { email: FIXTURE_EMAIL },
    },
  );
  if (!res.ok()) {
    throw new Error(
      `ensureFixtureEmail falhou: HTTP ${res.status()} ${
        await res.text().catch(() => '')
      }`,
    );
  }
  const rows = await res.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      `ensureFixtureEmail: PATCH retornou 0 linhas — RLS bloqueou ou contato ${FIXTURE_CONTACT_ID} não existe. ` +
      'Verifique que o usuário E2E tem permissão UPDATE em contacts.',
    );
  }
}

// Garante que o contato fixture tenha o FIXTURE_PHONE cadastrado.
// Usa return=representation para detectar falha silenciosa de RLS (0 linhas → array vazio).
async function ensureFixturePhone(page: Page): Promise<void> {
  const accessToken = await getAccessToken(page);
  const res = await page.request.patch(
    `${SUPABASE_URL}/rest/v1/contacts?id=eq.${FIXTURE_CONTACT_ID}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      data: { phone: FIXTURE_PHONE },
    },
  );
  if (!res.ok()) {
    throw new Error(
      `ensureFixturePhone falhou: HTTP ${res.status()} ${
        await res.text().catch(() => '')
      }`,
    );
  }
  const rows = await res.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      `ensureFixturePhone: PATCH retornou 0 linhas — RLS bloqueou ou contato ${FIXTURE_CONTACT_ID} não existe. ` +
      'Verifique que o usuário E2E tem permissão UPDATE em contacts.',
    );
  }
}

test.describe('Formulário de contato — aviso de email duplicado', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureFixtureEmail(page);
  });

  test('exibe aviso quando email já está cadastrado em outro contato', async ({ page }) => {
    // Navega para a view de Contatos via atalho de sidebar (data-tour="contacts")
    await page.locator('[data-tour="contacts"]').click();

    // Abre o diálogo "Adicionar Contato"
    await page.getByRole('button', { name: /novo contato/i }).click();

    // Digita o email do fixture (já existe no banco) no campo de email do formulário
    await page
      .getByRole('dialog', { name: /adicionar contato/i })
      .getByLabel(/email/i)
      .fill(FIXTURE_EMAIL);

    // O aviso aparece após o debounce de 500 ms + round-trip ao banco.
    // 8 s cobre debounce (500 ms) + latência de rede + render em CI.
    await expect(
      page.getByRole('alert').filter({ hasText: /email já cadastrado/i }),
    ).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Formulário de contato — aviso de telefone duplicado', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureFixturePhone(page);
  });

  test('exibe aviso quando telefone já está cadastrado em outro contato', async ({ page }) => {
    // Navega para a view de Contatos via atalho de sidebar (data-tour="contacts")
    await page.locator('[data-tour="contacts"]').click();

    // Abre o diálogo "Adicionar Contato"
    await page.getByRole('button', { name: /novo contato/i }).click();

    // Digita o telefone do fixture (já existe no banco) no campo phone do formulário.
    // O sufixo "88776655" (últimos 8 dígitos de FIXTURE_PHONE) é único no banco.
    await page
      .getByRole('dialog', { name: /adicionar contato/i })
      .getByLabel(/telefone/i)
      .fill(FIXTURE_PHONE);

    // O aviso aparece após o debounce de 500 ms + round-trip ao banco.
    // 8 s cobre debounce (500 ms) + latência de rede + render em CI.
    await expect(
      page.getByRole('alert').filter({ hasText: /possível duplicata/i }),
    ).toBeVisible({ timeout: 8000 });
  });
});
