/** E100-2 · contraste do inbox, medido no NAVEGADOR REAL.
 *
 * O teste de a11y do banner (`EvolutionDisconnectBanner.a11y.test.tsx`) roda em jsdom, que nao tem
 * layout e portanto nao calcula contraste — a regra `color-contrast` fica de fora por limitacao
 * tecnica. Resultado: o banner era testado em tudo, menos no que falhava.
 *
 * Medicao de 2026-10-02 (antes do fix): 4 violacoes `color-contrast` (serious), todas no banner de
 * conexao desconectada — branco sobre `bg-destructive` do tema padrao (RGB 239,67,67) = 3.78:1, e o
 * botao com fundo translucido = 3.00:1. Depois do fix: zero.
 */
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

interface Violacao {
  id: string;
  impact: string;
  nodes: { target: string[]; html: string }[];
}

test.describe('inbox · contraste e nome acessivel (camada que o jsdom nao alcanca)', () => {
  test('nenhuma violacao de color-contrast ou button-name', async ({ page }) => {
    await page.goto('/?view=inbox');
    // A faixa entra com `framer-motion` (opacity 0 -> 1). O axe medindo DURANTE o fade enxerga a cor
    // misturada com o fundo e acusa contraste que nao existe no estado final — foi o que deixou este
    // teste intermitente (1 violacao em algumas execucoes, zero em outras). Esperar a opacidade
    // assentar torna a medicao deterministica.
    await page.waitForFunction(
      () => {
        const faixa = document.querySelector('[aria-label="Status das conexões do WhatsApp"]');
        return faixa !== null && getComputedStyle(faixa as Element).opacity === '1';
      },
      undefined,
      { timeout: 20_000 }
    );
    await page.waitForTimeout(500); // margem para o resto da tela assentar

    await page.addScriptTag({ path: AXE });
    const violacoes = await page.evaluate(async (): Promise<Violacao[]> => {
      const axe = (
        window as unknown as {
          axe: {
            run: (
              c: unknown,
              o: unknown
            ) => Promise<{ violations: Violacao[] }>;
          };
        }
      ).axe;
      const r = await axe.run(document.body, {
        runOnly: { type: 'rule', values: ['color-contrast', 'button-name'] },
      });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes }));
    });

    const resumo = violacoes.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} no(s)`).join(' | ');
    expect(violacoes, `violacoes de a11y no inbox: ${resumo}`).toHaveLength(0);
  });
});
