import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  SentimentIndicator,
  SentimentEmoji,
  SentimentBar,
  getSentimentFromScore,
} from '../SentimentIndicator';

describe('SentimentIndicator — faixas de sentimento', () => {
  it('classifica a nota pelas faixas documentadas (70/45/25)', () => {
    expect(getSentimentFromScore(100)).toBe('positive');
    expect(getSentimentFromScore(70)).toBe('positive');
    expect(getSentimentFromScore(69)).toBe('neutral');
    expect(getSentimentFromScore(45)).toBe('neutral');
    expect(getSentimentFromScore(44)).toBe('negative');
    expect(getSentimentFromScore(25)).toBe('negative');
    expect(getSentimentFromScore(24)).toBe('critical');
    expect(getSentimentFromScore(0)).toBe('critical');
  });

  it('mostra o rótulo e a porcentagem quando showLabel e score são passados', () => {
    render(<SentimentIndicator sentiment="positive" score={85} showLabel />);
    expect(screen.getByText('Positivo')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('usa o rótulo do próprio nível (crítico não vira positivo)', () => {
    render(<SentimentIndicator sentiment="critical" showLabel />);
    expect(screen.getByText('Crítico')).toBeInTheDocument();
    expect(screen.queryByText('Positivo')).not.toBeInTheDocument();
  });

  it('no modo compacto mostra o emoji do nível', () => {
    render(<SentimentIndicator sentiment="negative" compact />);
    expect(screen.getByText('😟')).toBeInTheDocument();
  });

  it('SentimentEmoji marca crítico como pulsante e positivo não', () => {
    const { rerender } = render(<SentimentEmoji sentiment="critical" animated={false} />);
    expect(screen.getByText('😠')).toHaveClass('animate-pulse');
    rerender(<SentimentEmoji sentiment="positive" animated={false} />);
    expect(screen.getByText('😊')).not.toHaveClass('animate-pulse');
  });

  it('SentimentBar deriva o nível da nota e exibe o percentual', () => {
    render(<SentimentBar score={10} />);
    expect(screen.getByText('10%')).toBeInTheDocument();
  });
});
