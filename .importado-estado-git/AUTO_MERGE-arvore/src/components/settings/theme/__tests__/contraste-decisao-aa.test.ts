/**
 * SK04 (BACKLOG_VERIFICADO, item 499) — contraste: as duas metades da decisão.
 *
 * O cartão manda conferir se o defeito do SK04 ainda existe. Ele não é um defeito vivo: é um
 * par de decisões já registradas e já cumpridas pela base. Este arquivo prende a metade que
 * estava SEM guarda de execução — a outra metade já tem duas.
 *
 *   1. PRECEDÊNCIA (`#1416`, viva) — o alto contraste vence o preset: com a classe
 *      `.high-contrast` no `<html>`, `applyThemePreset` não pode deixar cor INLINE (estilo
 *      inline venceria a classe). Prendido por
 *      `src/components/theme/__tests__/HighContrastTokens.test.tsx` e, em navegador real,
 *      por `e2e/theme-alto-contraste.spec.ts` (projeto `chromium-theme`, roda no CI).
 *
 *   2. AJUSTE GLOBAL AA REVERTIDO (`#1435` → `#1458`) — o `#1435` punha um ajustador
 *      (`coresComContrasteAA`) entre o preset e o `<html>`: a primária da skin corporativa
 *      ia de `221 83% 53%` para `34%` no claro e `93%` no escuro, para fechar AA nos pares
 *      COMPOSTOS. O `#1458` desfez isso por decisão explícita do dono do produto —
 *      "a cor da skin aprovada vale mais que o AA daqueles 6 pares" — e a exigência de ≥3:1
 *      dos pares sólidos (§68 de `presets.test.ts`) continua valendo.
 *
 * Por que ele existe: `tokens-sync.test.ts` compara ARQUIVO com ARQUIVO (`corporate` ×
 * `tokens.css`). Um ajustador que rode só em tempo de execução — exatamente a forma do
 * `#1435` — passa por ele sem acender nada (medido: 150 testes verdes com o ajustador de
 * volta no caminho) e a skin aprovada mudaria de cor em silêncio. Aqui a leitura é do
 * `<html>` depois da função real: o preset tem de chegar lá como ele é.
 *
 * As expectativas NÃO são literais deste arquivo: saem do código de produção — o catálogo
 * (`getPresetById('corporate')`) e a folha aprovada (`src/styles/tokens.css`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyThemePreset, getPresetById, CSS_VARS_TO_APPLY } from '../presets';

const TOKENS_CSS = readFileSync(resolve(__dirname, '../../../../styles/tokens.css'), 'utf8');

/** Tokens de um bloco (`:root` ou `.dark`) da folha aprovada, com chaves balanceadas. */
function tokensDoBloco(seletor: ':root {' | '.dark {'): Record<string, string> {
  const inicio = TOKENS_CSS.indexOf(seletor);
  if (inicio < 0) throw new Error(`bloco ${seletor} ausente em tokens.css`);
  const abre = TOKENS_CSS.indexOf('{', inicio);
  let nivel = 0;
  let fim = -1;
  for (let i = abre; i < TOKENS_CSS.length; i++) {
    if (TOKENS_CSS[i] === '{') nivel += 1;
    else if (TOKENS_CSS[i] === '}') {
      nivel -= 1;
      if (nivel === 0) {
        fim = i;
        break;
      }
    }
  }
  if (fim < 0) throw new Error(`bloco ${seletor} sem fechamento em tokens.css`);
  const vars: Record<string, string> = {};
  for (const m of Array.from(TOKENS_CSS.slice(abre + 1, fim).matchAll(/--([\w-]+):\s*([^;]+);/g))) {
    vars[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  }
  return vars;
}

const APROVADO_NO_CSS = {
  light: tokensDoBloco(':root {')['primary'],
  dark: tokensDoBloco('.dark {')['primary'],
} as const;

const corporate = getPresetById('corporate')!;

describe('SK04 — a skin aprovada vale mais que o ajuste global AA (decisão do #1458)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('style');
    document.documentElement.className = '';
  });

  it.each(['light', 'dark'] as const)(
    'no tema %s a primária chega ao <html> com o valor aprovado (catálogo = folha de tokens)',
    (mode) => {
      // O esperado sai do código de produção: catálogo do preset e folha aprovada. Um ajustador
      // de contraste global em tempo de execução muda o que chega ao `<html>` sem mexer em nenhum
      // dos dois — é isso que este teste acusa.
      expect(corporate[mode].primary, `catálogo × tokens.css (${mode})`).toBe(APROVADO_NO_CSS[mode]);

      applyThemePreset('corporate', mode, { persistCache: false });

      expect(
        document.documentElement.style.getPropertyValue('--primary'),
        `o preset tem de chegar ao <html> como ele é (${mode})`,
      ).toBe(APROVADO_NO_CSS[mode]);
    },
  );

  it.each(['light', 'dark'] as const)(
    'no tema %s nenhuma variável sai do preset: não há ajustador no caminho',
    (mode) => {
      applyThemePreset('corporate', mode, { persistCache: false });

      const divergentes = CSS_VARS_TO_APPLY.filter(
        (chave) =>
          document.documentElement.style.getPropertyValue(`--${chave}`) !== corporate[mode][chave],
      );
      expect(
        divergentes,
        'o DOM tem de receber o preset como ele é; ajuste de contraste global exige decisão nova',
      ).toEqual([]);
    },
  );

  it('a decisão não desmancha o alto contraste: com `.high-contrast` a cor não fica inline', () => {
    document.documentElement.classList.add('high-contrast');
    applyThemePreset('corporate', 'light', { persistCache: false });

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
  });
});
