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
  // Cores usadas em ChartConfig hoje no projeto (grep): hsl(var(--primary)),
  // hsl(var(--success)), hsl(var(--destructive)) em AIStatsWidget. O teste cobre
  // também os formatos citados no cartão (#fff e oklch), que passam intactos.
  it('mantém intactas as cores reais do design system', () => {
    const css = renderStyle('chart-1', {
      score: { label: 'Sentimento', color: 'hsl(var(--primary))' },
      positive: { label: 'Positivo', color: 'hsl(var(--success))' },
      hex: { label: 'Hex', color: '#fff' },
      modern: { label: 'oklch', color: 'oklch(0.7 0.15 250)' },
    });

    expect(css).toContain('--color-score: hsl(var(--primary));');
    expect(css).toContain('--color-positive: hsl(var(--success));');
    expect(css).toContain('--color-hex: #fff;');
    expect(css).toContain('--color-modern: oklch(0.7 0.15 250);');
    expect(css).toContain('[data-chart=chart-1]');
  });

  it('não deixa o id com aspas quebrar o seletor de atributo', () => {
    const css = renderStyle('chart"]}body{color:red}', {
      a: { label: 'a', color: 'hsl(var(--primary))' },
    });

    expect(css).not.toContain('"]}');
    expect(css).not.toContain('{color:red}');
    expect(css).toContain('[data-chart=chartbodycolorred]');
  });

  it('não deixa a chave do config injetar regra CSS', () => {
    const css = renderStyle('c', {
      ';}body{display:none}': { label: 'a', color: 'hsl(var(--primary))' },
    });

    expect(css).not.toContain('body{display:none}');
    expect(css).not.toContain(';}');
    expect(css).toContain('--color-bodydisplaynone:');
  });

  it('não deixa o valor da cor escapar com url(javascript:)', () => {
    const css = renderStyle('c', {
      a: { label: 'a', color: 'url(javascript:alert(1))}</style><script>alert(1)</script>' },
    });

    expect(css).not.toContain('<script>');
    expect(css).not.toContain('</style>');
    expect(css).not.toContain('javascript:');
  });
});

