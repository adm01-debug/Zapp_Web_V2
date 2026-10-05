/**
 * Contrato do tamanho tipográfico por densidade.
 *
 * O hook useDensity aplica data-density no <html> e accessibility.css define
 * --density-text-size para cada modo. O token precisa alimentar um consumidor
 * real sem sobrescrever componentes que já declaram sua própria escala.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/accessibility.css', 'utf8');

describe('accessibility.css — tamanho do texto por densidade', () => {
  it('aplica --density-text-size à tipografia herdada da aplicação', () => {
    expect(css).toMatch(
      /\[data-density\]\s+#root\s*\{[^}]*font-size:\s*var\(--density-text-size\)\s*;/,
    );
  });

  it('mantém o consumidor fora de uma regra global com !important', () => {
    const consumer = css.match(/\[data-density\]\s+#root\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(consumer).not.toContain('!important');
  });
});
