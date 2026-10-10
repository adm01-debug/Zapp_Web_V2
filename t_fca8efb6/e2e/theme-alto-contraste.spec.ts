import { test, expect, type Page } from '@playwright/test';

/**
 * Ordem/origem das variáveis de tema: o ALTO CONTRASTE tem de vencer o preset.
 *
 * `applyThemePreset` (e o boot inline do `index.html`) escreve os tokens de cor INLINE no
 * `<html>`; o alto contraste define os dele por CLASSE (`.high-contrast`, em
 * `src/styles/accessibility.css`). Estilo inline vence classe — então, com um preset
 * aplicado, ligar o alto contraste não mudava nada. Esta é a prova em navegador real: os
 * valores são lidos de `getComputedStyle(document.documentElement)`, não de suposição.
 *
 * Roda no projeto `chromium-theme` (sem `setup`, sem secrets): a tela deslogada já monta o
 * `ThemeInitializer` e o `HighContrastProvider`, que é onde o defeito vive.
 */

/** Paleta de alto contraste no tema claro — `src/styles/accessibility.css:4-25`. */
const HC_PRIMARY_CLARO = '258 100% 45%';
const HC_BACKGROUND_CLARO = '0 0% 100%';

async function ligarAltoContraste(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.setItem('highContrast', 'true'));
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bhigh-contrast\b/);
}

test.describe('alto contraste vence o preset (ordem das variáveis)', () => {
  test('os tokens do alto contraste chegam ao <html>', async ({ page }) => {
    await ligarAltoContraste(page);

    const lido = await page.evaluate(() => {
      const estilo = getComputedStyle(document.documentElement);
      return {
        primary: estilo.getPropertyValue('--primary').trim(),
        background: estilo.getPropertyValue('--background').trim(),
        inlinePrimary: document.documentElement.style.getPropertyValue('--primary').trim(),
      };
    });

    expect(lido.primary, 'o token de cor do alto contraste tem de vencer o preset').toBe(
      HC_PRIMARY_CLARO,
    );
    expect(lido.background).toBe(HC_BACKGROUND_CLARO);
    // A origem: com o alto contraste ligado, o preset NÃO pode deixar a cor dele inline,
    // senão volta a vencer a classe na próxima pintura.
    expect(lido.inlinePrimary, 'o preset não pode escrever cor inline com o HC ligado').toBe('');
  });

  test('no boot o alto contraste já entra pintado, sem cor de preset inline', async ({ page }) => {
    // O boot inline do `index.html` escreve o cache do preset antes do React existir. Com o
    // alto contraste ligado ele NÃO pode escrever cor (senão o primeiro quadro pinta com a
    // paleta do preset e só depois corrige). O observador começa antes de qualquer script
    // da página, então registra o estado no momento em que ele acontece.
    await page.addInitScript(() => {
      const registros: string[] = [];
      (window as unknown as { __hcRegistros: string[] }).__hcRegistros = registros;
      const instantaneo = () => {
        const root = document.documentElement;
        if (!root) return;
        registros.push(
          `${root.classList.contains('high-contrast') ? 'hc' : '-'}|${root.style
            .getPropertyValue('--primary')
            .trim()}`,
        );
      };
      // Observa o `document` (o `<html>` ainda não existe no document_start — observar o
      // elemento direto lançaria e a lista ficaria vazia, dando verde falso).
      new MutationObserver(instantaneo).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
      instantaneo();
    });

    await page.goto('/');
    await page.evaluate(() => window.localStorage.setItem('highContrast', 'true'));
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\bhigh-contrast\b/);

    const registros = await page.evaluate(
      () => (window as unknown as { __hcRegistros: string[] }).__hcRegistros,
    );

    const comCorInline = registros.filter((linha) => linha.startsWith('hc|') && !linha.endsWith('|'));
    expect(
      comCorInline,
      'nenhum instante pode ter alto contraste ligado com cor de preset inline',
    ).toEqual([]);
  });

  test('desligar o alto contraste devolve os tokens do preset', async ({ page }) => {
    await ligarAltoContraste(page);

    await page.evaluate(() => window.localStorage.setItem('highContrast', 'false'));
    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/\bhigh-contrast\b/);

    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    );

    expect(primary, 'sem alto contraste o preset volta a mandar').not.toBe(HC_PRIMARY_CLARO);
    expect(primary, 'e o token não pode ficar vazio').not.toBe('');
  });
});
