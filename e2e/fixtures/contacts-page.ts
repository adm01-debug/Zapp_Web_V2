import { expect, type Page } from '@playwright/test';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-env';
import { dispensarOnboarding } from './onboarding';
// Mesmos valores públicos de e2e/fixtures/e2e-contact.ts (URL do projeto + anon key).
/** Ordem canônica das abas (CONTACT_TYPES em src/utils/whatsappFileTypes.ts). */
export const CONTACT_TAB_LABELS = [
  'Todos', 'Cliente', 'Fornecedor', 'Transportadora', 'Colaborador', 'Prestador de Serviço', 'Parceiro',
] as const;

/** Abre `?view=contacts` e espera os KPIs e as abas carregarem. */
export async function gotoContacts(page: Page) {
  await page.goto('/?view=contacts');
  // O overlay de boas-vindas intercepta o ponteiro e faz o clique morrer em
  // silencio (alvo visivel, estavel, e mesmo assim o click nao completa).
  await dispensarOnboarding(page);
  // No mobile o banner também tem um <h1> "Contatos"; o da página fica dentro do <main>.
  await expect(
    page.getByRole('main', { name: 'Conteúdo principal' }).getByRole('heading', { level: 1, name: 'Contatos' }),
  ).toBeAttached({ timeout: 20_000 });
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
