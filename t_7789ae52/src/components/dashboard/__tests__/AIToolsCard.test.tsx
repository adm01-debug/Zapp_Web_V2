import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AIToolsCard } from '../overview/AIToolsCard';

describe('AIToolsCard', () => {
  it('renderiza os 4 mini-tiles das features reais de AIQuickAccess', () => {
    render(<MemoryRouter><AIToolsCard onSeeAll={vi.fn()} /></MemoryRouter>);
    expect(screen.getAllByTestId('ai-tile')).toHaveLength(4);
    expect(screen.getByText('Sugestões de Resposta')).toBeInTheDocument();
    expect(screen.getByText('Análise de Conversa')).toBeInTheDocument();
    expect(screen.getByText('Alertas de Sentimento')).toBeInTheDocument();
    expect(screen.getByText('Transcrição de Áudio')).toBeInTheDocument();
  });

  it('descrição real das features (não hardcoded)', () => {
    render(<MemoryRouter><AIToolsCard onSeeAll={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('IA gera respostas personalizadas para cada conversa')).toBeInTheDocument();
  });
});
