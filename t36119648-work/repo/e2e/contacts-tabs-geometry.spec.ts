import { test, expect } from '@playwright/test';
import { CONTACT_TAB_LABELS, gotoContacts } from './fixtures/contacts-page';

/**
 * Etapa 28 do PLANO_CONTATOS_100_ETAPAS_2026-09-29.md:
 * "Medir em browser (Playwright local contra `npm run preview`, receita do
 *  Apêndice E do plano Navy) a barra de 7 abas em 1366px de conteúdo: cabe sem
 *  scroll? Registrar número. — DoD: `scrollWidth` da `[role=tablist]` anotado".
 *
 * Roda no projeto `chromium-authenticated` (mesmo `storageState` de
 * `contacts-view.spec.ts`), que é a única forma de alcançar `?view=contacts`:
 * `ProtectedRoute` redireciona para `/auth` sem sessão (ver src/routes/AppRoutes.tsx:50).
 *
 * O DoD pede o número REGISTRADO, não um gate: a medida vai para a anotação
 * (`scrollWidth`) e para o stdout do CI. Promover para asserção de "não
 * estourou" é o passo seguinte natural, depois que o número tiver baseline.
 */
test.describe('Contatos — geometria da barra de abas (etapa 28)', () => {
  test('barra de 7 abas em 1366px de conteúdo: mede o scrollWidth da tablist', async ({ page }, testInfo) => {
    await gotoContacts(page);

    // O plano fala de "1366px de CONTEÚDO", não de viewport: a largura da
    // viewport no app inclui sidebar + gutters. Fixar o container da tablist em
    // 1366px torna a medida reproduzível em qualquer viewport do runner —
    // inclusive no mobile (etapa 89), onde o layout real é mais estreito.
    const metrics = await page.evaluate((labels) => {
      const tablist = document.querySelector('[role=tablist]');
      if (!tablist) throw new Error('tablist não encontrada');
      const container = tablist.parentElement as HTMLElement;
      container.style.width = '1366px';

      const tabs = Array.from(tablist.querySelectorAll('[role=tab]'));
      const widths = tabs.map((t) => +t.getBoundingClientRect().width.toFixed(2));
      const gap = parseFloat(getComputedStyle(tablist).columnGap || '0');

      return {
        containerWidth: +container.getBoundingClientRect().width.toFixed(2),
        scrollWidth: tablist.scrollWidth,
        clientWidth: tablist.clientWidth,
        overflowPx: tablist.scrollWidth - tablist.clientWidth,
        tabCount: tabs.length,
        abreviaturas: tabs.map((t) => (t.textContent ?? '').trim().replace(/\s+/g, ' ')),
        larguras: widths,
        somaDasAbas: +widths.reduce((a, w) => a + w, 0).toFixed(2),
        gaps: gap * Math.max(tabs.length - 1, 0),
        esperado: labels.length,
      };
    }, CONTACT_TAB_LABELS);

    // Estrutura: a barra continua sendo a das 7 abas canônicas.
    expect(metrics.tabCount).toBe(metrics.esperado);

    // DoD: número anotado + visível no log do runner.
    testInfo.annotations.push({
      type: 'scrollWidth',
      description:
        `[role=tablist] scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth} ` +
        `overflow=${metrics.overflowPx}px em 1366px de conteúdo ` +
        `(soma das abas ${metrics.somaDasAbas}px + gaps ${metrics.gaps}px)`,
    });
    await testInfo.attach('abas-1366px.json', {
      body: JSON.stringify(metrics, null, 2),
      contentType: 'application/json',
    });
    // warn (e não log): a regra de lint do repo só permite warn/error no console; a
    // saída continua aparecendo no stdout do CI para registrar o número do DoD.
    console.warn('[etapa 28] scrollWidth da [role=tablist] @1366px =', metrics.scrollWidth, 'px', JSON.stringify(metrics));
  });
});
