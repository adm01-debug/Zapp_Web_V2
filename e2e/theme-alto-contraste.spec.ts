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
 *
 * A TELA DE ABERTURA (`#root-loading`) entra no MESMO arquivo de propósito: o projeto
 * `chromium-theme` é o único deslogado do job de PR do `ci.yml` cujo `testMatch` é um nome
 * de arquivo único, e `playwright.config.ts` está fora dos arquivos deste cartão. Aqui a
 * abertura também é assunto de tema: a prova mede as cores dela CONTRA os tokens do
 * sistema (`--background`/`--foreground`/`--muted-foreground`) nos dois modos.
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

/**
 * Tela de abertura (`#root-loading`, no `index.html`): a V2 não tinha nenhuma, então até o
 * bundle inicial (~340 KB) baixar e o React montar o usuário via o fundo vazio. A prova é
 * em navegador real e MEDE as cores renderizadas — nada é conferido por string de CSS.
 */

/** WCAG 2.x: luminância relativa de uma cor `rgb(r, g, b)`. */
function luminanciaRelativa(rgb: string): number {
  const numeros = rgb.match(/\d+(?:\.\d+)?/g);
  if (!numeros || numeros.length < 3) throw new Error(`cor não reconhecida: ${rgb}`);
  const [r, g, b] = numeros.slice(0, 3).map((n) => Number(n) / 255);
  const canal = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razaoDeContraste(frente: string, fundo: string): number {
  const a = luminanciaRelativa(frente);
  const b = luminanciaRelativa(fundo);
  const [claro, escuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * Segura o JS inicial para que a tela de abertura seja observada no estado de espera.
 * O atraso é generoso de propósito: o teste mede as cores da abertura antes de o React
 * montar, então ele precisa continuar na tela durante a medição.
 */
async function segurarJsInicial(page: Page): Promise<void> {
  await page.route('**/src/main.tsx', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await route.continue();
  });
}

/** Valor REAL de um token, lido do documento já com o CSS do app carregado. */
async function tokenRenderizado(page: Page, token: string): Promise<string> {
  return page.evaluate((nome) => {
    const sonda = document.createElement('div');
    sonda.style.backgroundColor = `hsl(var(${nome}))`;
    document.body.appendChild(sonda);
    const cor = getComputedStyle(sonda).backgroundColor;
    sonda.remove();
    return cor;
  }, token);
}

test.describe('tela de abertura (#root-loading)', () => {
  test('aparece antes do React e sai quando o app monta', async ({ page }) => {
    await segurarJsInicial(page);
    // `commit` volta assim que a navegação começa: o JS inicial ainda está preso no
    // route acima, então a abertura está garantidamente na tela para ser observada.
    await page.goto('/', { waitUntil: 'commit' });

    const abertura = page.locator('#root-loading');
    await expect(abertura, 'antes do React a abertura tem de estar na tela').toBeVisible();
    await expect(abertura.getByRole('status')).toHaveText('Carregando…');

    // O app monta (ou o watchdog de 8 s escreve o erro) e o observador tira a abertura.
    await expect(abertura).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  for (const tema of ['light', 'dark'] as const) {
    test(`no modo ${tema} a abertura usa as cores do tema`, async ({ page }) => {
      await page.addInitScript((modo) => window.localStorage.setItem('theme', modo), tema);
      await segurarJsInicial(page);
      await page.goto('/', { waitUntil: 'commit' });

      const abertura = page.locator('#root-loading');
      await expect(abertura).toBeVisible();
      if (tema === 'dark') {
        await expect(page.locator('html')).toHaveClass(/\bdark\b/);
      } else {
        await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
      }

      const medido = await page.evaluate(() => {
        const caixa = document.getElementById('root-loading');
        const status = caixa?.querySelector('[role="status"]');
        return {
          fundo: caixa ? getComputedStyle(caixa).backgroundColor : '',
          texto: caixa ? getComputedStyle(caixa).color : '',
          textoStatus: status ? getComputedStyle(status).color : '',
        };
      });

      // Com o app montado os tokens do sistema já estão no documento: a comparação é
      // entre a cor PINTADA na abertura e o valor REAL de cada token.
      await expect(abertura).toBeHidden({ timeout: 30_000 });
      const fundoDoTema = await tokenRenderizado(page, '--background');
      const textoDoTema = await tokenRenderizado(page, '--foreground');
      const statusDoTema = await tokenRenderizado(page, '--muted-foreground');

      expect(medido.fundo, 'o fundo da abertura tem de ser o token --background').toBe(fundoDoTema);
      expect(medido.texto, 'o texto da abertura tem de ser o token --foreground').toBe(textoDoTema);
      expect(medido.textoStatus, 'o "Carregando…" tem de ser o token --muted-foreground').toBe(
        statusDoTema,
      );
      expect(
        razaoDeContraste(medido.textoStatus, medido.fundo),
        'o "Carregando…" precisa de contraste WCAG AA (4.5:1) com o fundo',
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
