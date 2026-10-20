/**
 * Contrato do tamanho tipográfico por densidade.
 *
 * O hook useDensity aplica data-density no <html>. Cada modo precisa fornecer
 * um tamanho concreto ao consumidor herdável, sem depender de tokens ausentes.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/accessibility.css', 'utf8');

function densityTextSize(selector: string): string | undefined {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = css
    .match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1]
    ?.match(/--density-text-size:\s*([^;]+);/)?.[1];

  return declaration?.trim();
}

describe('accessibility.css — tamanho do texto por densidade', () => {
  it('fornece tamanhos concretos e progressivos para todos os modos', () => {
    const comfortable = densityTextSize(':root, [data-density="comfortable"]');
    const compact = densityTextSize('[data-density="compact"]');
    const dense = densityTextSize('[data-density="dense"]');

    expect(comfortable).toBe('1rem');
    expect(compact).toBe('0.875rem');
    expect(dense).toBe('0.75rem');
  });

  it('preserva 1rem no modo padrão e só altera tipografia herdada', () => {
    expect(densityTextSize(':root, [data-density="comfortable"]')).toBe('1rem');
    expect(css).toMatch(
      /\[data-density\]\s+#root\s*\{[^}]*font-size:\s*var\(--density-text-size\)\s*;/,
    );

    const consumer = css.match(/\[data-density\]\s+#root\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(consumer).not.toContain('!important');
  });
});
