/**
 * X055 — Prancha de referência TalkXKit: smoke E2E.
 *
 * Requer `VITE_TALKX_KIT=1` no ambiente de build (já definido no CI via
 * `e2e-talkx.yml` para runs de E2E). Em DEV a trava abre automaticamente.
 */

import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1672, height: 941 } });

const FORCED_STATES = [
  { state: 'empty', title: 'Nenhuma campanha encontrada' },
  { state: 'loading', title: 'Carregando (Skeleton)' },
  { state: 'error', title: 'Não foi possível carregar as campanhas' },
  { state: 'crm', title: 'CRM 360 indisponível' },
  { state: 'wa', title: 'Conexão WhatsApp desconectada' },
  { state: 'perm', title: 'Você não tem permissão para acessar Campanhas' },
] as const;

test('TalkXKit — prancha principal renderiza e exibe todas as seções', async ({ page }) => {
  await page.goto('/?view=talkx-kit');

  const prancha = page.getByTestId('talkx-kit');
  await expect(prancha).toBeVisible({ timeout: 10_000 });

  // Seções obrigatórias
  await expect(page.getByTestId('talkx-kit-estados')).toBeVisible();
  await expect(page.getByTestId('talkx-kit-modais')).toBeVisible();
  await expect(page.getByTestId('talkx-kit-filtros')).toBeVisible();
  await expect(page.getByTestId('talkx-kit-kpi')).toBeVisible();
  await expect(page.getByTestId('talkx-kit-tabela')).toBeVisible();

  // 6 cards de estado presentes
  for (const { state } of FORCED_STATES) {
    await expect(page.getByTestId(`talkx-kit-estado-${state}`)).toBeVisible();
  }

  // Screenshot completo da prancha (anexado ao relatório)
  await page.screenshot({
    path: 'e2e/__screenshots__/talkx-kit-full-linux.png',
    fullPage: false,
  });
});

for (const { state, title } of FORCED_STATES) {
  test(`TalkXKit — estado forçado "${state}" exibe título correto`, async ({ page }) => {
    await page.goto(`/?view=talkx-kit&talkxState=${state}`);

    const forcado = page.getByTestId('talkx-kit-forcado');
    await expect(forcado).toBeVisible({ timeout: 10_000 });

    const titulo = page.getByTestId('talkx-kit-forcado-titulo');
    await expect(titulo).toBeVisible();
    await expect(titulo).toContainText(title);

    // Trilha de breadcrumb ainda visível
    await expect(page.getByTestId('talkx-kit-trilha')).toBeVisible();
  });
}
