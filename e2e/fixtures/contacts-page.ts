import { expect, type Page } from '@playwright/test';

// Mesmos valores públicos de e2e/fixtures/e2e-contact.ts (URL do projeto + anon key).
const SUPABASE_URL = 'https://tnnnlkbymytvtqngbbqh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRubm5sa2J5bXl0dnRxbmdiYnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MjU0MDEsImV4cCI6MjEwMzMwMTQwMX0.4kDVowXzo3yBVboLOFn1bsij-vBKncJXVoPot3iknC0';

/** Ordem canônica das abas (CONTACT_TYPES em src/utils/whatsappFileTypes.ts). */
export const CONTACT_TAB_LABELS = [
  'Todos', 'Cliente', 'Fornecedor', 'Transportadora', 'Colaborador', 'Prestador de Serviço', 'Parceiro',
] as const;

/** Abre `?view=contacts` e espera os KPIs e as abas carregarem. */
export async function gotoContacts(page: Page) {
  await page.goto('/?view=contacts');
  await expect(page.getByRole('heading', { level: 1, name: 'Contatos' })).toBeAttached();
  await expect(page.getByTestId('kpi-card').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('tab', { name: /Todos/ })).toBeVisible();
  await expect(page.getByText('Carregando contatos', { exact: false })).toHaveCount(0, { timeout: 20_000 });
}

/** "1.234" (pt-BR) → 1234. */
export function parseCount(text: string | null): number {
  return Number((text ?? '').replace(/\D/g, '') || '0');
}

export function contactCards(page: Page) {
  return page.getByTestId('contact-card');
}

async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? '') as { access_token?: string };
        if (parsed.access_token) return parsed.access_token;
      } catch {
        // entrada que não é o storage do supabase-js
      }
    }
    return null;
  });
  if (!token) throw new Error('Sessão Supabase não encontrada no localStorage');
  return token;
}

async function headers(page: Page) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${await accessToken(page)}`,
    'Content-Type': 'application/json',
  };
}

/** Linhas VIVAS (`deleted_at IS NULL`) de `contacts` com este telefone, vistas pelo usuário logado. */
export async function liveContactsByPhone(page: Page, phone: string): Promise<{ id: string; name: string }[]> {
  const res = await page.request.get(
    `${SUPABASE_URL}/rest/v1/contacts?select=id,name&phone=eq.${phone}&deleted_at=is.null`,
    { headers: await headers(page) },
  );
  if (!res.ok()) throw new Error(`consulta de contacts falhou: HTTP ${res.status()}`);
  return res.json();
}

/** Limpeza best-effort pela mesma RPC de soft-delete que a UI usa. */
export async function softDeleteContact(page: Page, id: string) {
  await page.request.post(`${SUPABASE_URL}/rest/v1/rpc/delete_contact`, {
    headers: await headers(page),
    data: { p_id: id },
  });
}
