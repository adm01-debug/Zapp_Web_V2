import type { Page } from '@playwright/test';

/**
 * Modal de boas-vindas ("Bem-vindo, <nome>!") que monta DEPOIS do carregamento
 * do app: `role="dialog" aria-label="Boas-vindas"`, `div.fixed.inset-0.z-[9999]`.
 *
 * Achado medido em 02/10 nos specs de contatos (e antes no catalogo): ele cobre
 * a tela e **intercepta o ponteiro**. O sintoma no Playwright e' enganoso --
 * o alvo resolve, esta visivel, habilitado e estavel, e o `click` mesmo assim
 * nunca completa, porque a checagem de hit-target espera o overlay sair. Sem
 * dispensar, o teste estoura no timeout com uma mensagem que nao cita a causa.
 *
 * ARMADILHA (custou duas rodadas): o modal NAO esta no DOM logo apos o `goto`.
 * Uma versao anterior perguntava "existe botao Pular tour?" e, como ainda nao
 * existia, saia sem fazer nada -- o overlay aparecia em seguida e engolia o
 * clique seguinte. Por isso aqui se ESPERA o modal aparecer antes de decidir.
 *
 * Ele reaparece a cada sessao nova (a dispensa nao persiste para o usuario de
 * QA), entao a espera e' necessaria em toda entrada de tela autenticada.
 * MEDIDO: hoje o Escape TAMBEM fecha (o componente ganhou handler de teclado),
 * mas clicar no botao e' o que o usuario faria e nao depende de foco.
 */
export const OVERLAY_ONBOARDING = 'div.fixed.inset-0.z-\\[9999\\]';

export async function dispensarOnboarding(
  page: Page,
  { timeout = 12_000 }: { timeout?: number } = {},
): Promise<void> {
  const modal = page.getByRole('dialog', { name: 'Boas-vindas' });

  // Espera o modal aparecer; se nunca vier, segue (custo unico, limitado).
  await modal.waitFor({ state: 'visible', timeout }).catch(() => {});
  if ((await modal.count()) === 0) return;

  const pular = page.getByRole('button', { name: /pular tour/i });
  if ((await pular.count()) > 0) {
    await pular.first().click();
  } else {
    // Fallback: o X ("Fechar") fecha pelo mesmo caminho (onClose).
    await page.getByRole('button', { name: /^fechar$/i }).first().click().catch(() => {});
  }

  await modal.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await page
    .locator(OVERLAY_ONBOARDING)
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => {});
}
