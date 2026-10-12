import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ChartStyle } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';

function renderStyle(id: string, config: ChartConfig): string {
  const { container } = render(<ChartStyle id={id} config={config} />);
  return container.querySelector('style')?.innerHTML ?? '';
}

describe('ChartStyle', () => {
  it('mantém as cores reais do design system (hsl(var(--...)))', () => {
    const css = renderStyle('chart-1', {
      score: { label: 'Sentimento', color: 'hsl(var(--primary))' },
      positive: { label: 'Positivo', color: 'hsl(var(--success))' },
    });

    expect(css).toContain('--color-score: hsl(var(--primary));');
    expect(css).toContain('--color-positive: hsl(var(--success));');
    expect(css).toContain('[data-chart=chart-1]');
  });

  it('não deixa o id do gráfico quebrar o seletor de atributo', () => {
    const css = renderStyle('chart"]}body{color:red}', {
      a: { label: 'a', color: 'hsl(var(--primary))' },
    });

    expect(css).not.toContain('"]}');
    expect(css).not.toContain('{color:red}');
    expect(css).toContain('[data-chart=chartbodycolorred]');
  });

  it('não deixa a chave do config injetar regra CSS', () => {
    const css = renderStyle('c', {
      'a:b}; body{background:url(x)': { label: 'a', color: 'hsl(var(--primary))' },
    });

    expect(css).not.toContain('body{');
    expect(css).not.toContain('url(');
    expect(css).toContain('--color-abbodybackgroundurlx:');
  });

  it('não deixa o valor da cor escapar da propriedade', () => {
    const css = renderStyle('c', {
      a: { label: 'a', color: 'hsl(var(--primary))}</style><script>alert(1)</script>' },
    });

    expect(css).not.toContain('<script>');
    expect(css).not.toContain('</style>');
  });
});
