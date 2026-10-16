import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SENTIMENT_VALUES } from '@/lib/ai-vocabulary';
import { SentimentIndicator, SentimentEmoji, getSentimentFromScore } from '../SentimentIndicator';

/**
 * Item L2: o `SentimentIndicator` indexava `sentimentConfig[sentiment]` com o
 * valor CRU. Ligado ao valor canônico do banco ('critico') o `config` ficava
 * indefinido e o componente quebrava ao ler `config.icon`. Agora o valor cru
 * passa pelo mapeador e desconhecido cai em neutro — nunca quebra.
 */
describe('SentimentIndicator com o vocabulário do banco', () => {
  it('desenha o rótulo do valor canônico (pt-BR), sem quebrar', () => {
    const rotulos: Record<string, string> = {
      positivo: 'Positivo',
      neutro: 'Neutro',
      negativo: 'Negativo',
      critico: 'Crítico',
    };
    for (const value of SENTIMENT_VALUES) {
      const { unmount } = render(<SentimentIndicator sentiment={value} showLabel />);
      expect(screen.getByText(rotulos[value]), value).toBeTruthy();
      unmount();
    }
  });

  it('valor desconhecido/ausente cai no neutro em vez de estourar', () => {
    const { unmount } = render(<SentimentIndicator sentiment="muito_positivo" showLabel />);
    expect(screen.getByText('Neutro')).toBeTruthy();
    unmount();

    render(<SentimentIndicator sentiment={null} showLabel />);
    expect(screen.getByText('Neutro')).toBeTruthy();
  });

  it('SentimentEmoji também aceita o valor cru do banco', () => {
    const { unmount } = render(<SentimentEmoji sentiment="critico" animated={false} />);
    expect(screen.getByText('😠')).toBeTruthy();
    unmount();

    render(<SentimentEmoji sentiment="xpto" animated={false} />);
    expect(screen.getByText('😐')).toBeTruthy();
  });

  it('a barra por pontuação continua igual (regressão)', () => {
    expect(getSentimentFromScore(80)).toBe('positive');
    expect(getSentimentFromScore(50)).toBe('neutral');
    expect(getSentimentFromScore(30)).toBe('negative');
    expect(getSentimentFromScore(10)).toBe('critical');
  });
});
