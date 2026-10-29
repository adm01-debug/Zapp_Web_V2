import { expect, type Page } from '@playwright/test';

import { dispensarOnboarding } from './onboarding';

/**
 * Abre `?view=connections` e espera a tela de Conexões montar de verdade.
 *
 * Mesmo padrão de `gotoContacts` (fixtures/contacts-page.ts): navega, dispensa
 * o overlay de onboarding (que intercepta o ponteiro) e espera o título da
 * página e o fim do esqueleto de carregamento. O banco é o do conjunto local
 * (R1): nenhum e2e autenticado toca produção.
 */
export async function gotoConexoes(page: Page) {
  await page.goto('/?view=connections');
  await dispensarOnboarding(page);
  await expect(
    page
      .getByRole('main', { name: 'Conteúdo principal' })
      .getByRole('heading', { level: 1, name: 'Conexões WhatsApp' }),
  ).toBeAttached({ timeout: 20_000 });
  // Nunca deixa o esqueleto preso "passar" como tela pronta.
  await expect(page.getByText('Carregando conexões...', { exact: false })).toHaveCount(0, {
    timeout: 20_000,
  });
}
