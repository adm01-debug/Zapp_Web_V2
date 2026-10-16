/**
 * SL-175 · o MiniSparkline da cadeia de gamificação do Dashboard.
 *
 * `GamificationEffects` era o único consumidor do wrapper `@deprecated`
 * `MiniSparkline` de src/components/dashboard, que só traduzia `isPositive` no
 * `color` do canônico `metrics/MiniSparkline` (com `height={20}`) e ignorava o
 * `delay` que o cartão passava. Este teste fixa o que a tela mostrava — a cor
 * pela intenção do indicador e a altura — para a migração para o canônico não
 * mudar nada do que o usuário vê.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ArrowUpRight } from 'lucide-react';
import { StatCardWithGamification } from '../GamificationEffects';

function card(overrides: Partial<Parameters<typeof StatCardWithGamification>[0]> = {}) {
  return (
    <StatCardWithGamification
      title="Mensagens respondidas"
      value="120"
      change="+12%"
      changeType="positive"
      sparklineData={[1, 4, 2, 6]}
      icon={ArrowUpRight}
      gradient="from-primary to-primary-glow"
      index={0}
      {...overrides}
    />
  );
}

/** O ícone do cartão também é um <svg> — o sparkline é identificado pela linha. */
function sparkline(container: HTMLElement): SVGElement {
  const linha = container.querySelector('polyline');
  if (!linha) throw new Error('o sparkline não apareceu na tela');
  return linha as SVGElement;
}

describe('StatCardWithGamification · sparkline canônico', () => {
  it('desenha a linha na cor de sucesso quando a tendência é positiva', () => {
    const { container } = render(card({ changeType: 'positive' }));

    expect(sparkline(container).getAttribute('stroke')).toBe('hsl(var(--success))');
  });

  it('desenha a linha na cor destrutiva quando a tendência é negativa', () => {
    const { container } = render(card({ changeType: 'negative' }));

    expect(sparkline(container).getAttribute('stroke')).toBe('hsl(var(--destructive))');
  });

  it('inverte a cor pelo indicador quando invertTrend reduzir a métrica', () => {
    const { container } = render(card({ changeType: 'negative', invertTrend: true }));

    expect(sparkline(container).getAttribute('stroke')).toBe('hsl(var(--success))');
  });

  it('mantém a altura de 20px que o wrapper usava', () => {
    const { container } = render(card());

    const svg = sparkline(container).ownerSVGElement;
    expect(svg?.getAttribute('viewBox')).toBe('0 0 100 20');
    expect(svg?.style.height).toBe('20px');
  });

  it('não renderiza sparkline com menos de dois pontos', () => {
    const { container } = render(card({ sparklineData: [3] }));

    expect(container.querySelector('polyline')).toBeNull();
  });
});
