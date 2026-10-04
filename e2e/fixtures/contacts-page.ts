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

/**
 * Token da sessao lido do storageState do projeto "setup".
 *
 * Existe porque `accessToken(page)` depende da pagina VIVA: quando um teste estoura
 * por timeout ou o worker e cancelado, a pagina ja morreu e a limpeza nao consegue
 * nem consultar. Lendo do arquivo, a limpeza sobrevive ao que matou o teste.
 */
export async function accessTokenDoStorageState(): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const raw = JSON.parse(await readFile('e2e/.auth/user.json', 'utf8'));
  for (const origem of raw.origins ?? []) {
    for (const item of origem.localStorage ?? []) {
      if (!String(item.name).includes('auth-token')) continue;
      const valor = JSON.parse(item.value);
      if (valor?.access_token) return valor.access_token as string;
    }
  }
  throw new Error('storageState sem access_token: rode o projeto "setup" antes');
}

/**
 * Limpeza que NAO depende da pagina viva (etapa E97).
 *
 * O `cleanup` antigo fazia `liveContactsByPhone(page, phone).catch(() => [])`: como a
 * consulta usa `page.request`, ela falhava junto com a pagina, o erro era engolido e
 * o contato ficava — sem nenhum sinal. Comprovado em 2026-10-02: pagina fechada antes
 * do `finally` deixou 2 contatos `[E2E] RODAPE EDIT` no banco.
 *
 * Aqui nao existe `catch` que engole: se a limpeza falhar, o teste fica VERMELHO.
 * Falha de limpeza tem de ser visivel, nao silenciosa.
 */
export async function limparContatosPorTelefone(
  ctx: import('@playwright/test').APIRequestContext,
  telefones: string[],
): Promise<void> {
  if (telefones.length === 0) return;
  {
    const token = await accessTokenDoStorageState();
    const h = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    for (const phone of telefones) {
      const res = await ctx.get(
        `${SUPABASE_URL}/rest/v1/contacts?select=id&phone=eq.${phone}&deleted_at=is.null`,
        { headers: h },
      );
      if (!res.ok()) throw new Error(`limpeza E97: consulta de contacts falhou HTTP ${res.status()}`);
      for (const linha of (await res.json()) as { id: string }[]) {
        const del = await ctx.post(`${SUPABASE_URL}/rest/v1/rpc/delete_contact`, {
          headers: h,
          data: { p_id: linha.id },
        });
        if (!del.ok()) throw new Error(`limpeza E97: delete_contact falhou HTTP ${del.status()}`);
      }
    }
  }
}
