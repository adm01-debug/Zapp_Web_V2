import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// SL-165: o chip "Ativo" do tile de IA da Visão Geral existia no mockup
// (etapa 74 do plano Navy) mas foi omitido por falta de fonte do provedor.
// `useActiveAIProvider` é a fonte real (`ai_providers`); sem provedor ativo o
// chip não pode aparecer afirmando um status que o dado não sustenta.
const h = vi.hoisted(() => ({ provider: vi.fn() }));

vi.mock('@/hooks/analytics/useActiveAIProvider', () => ({
  useActiveAIProvider: () => h.provider(),
}));

import { AIToolsCard } from '../overview/AIToolsCard';

beforeEach(() => {
  h.provider.mockReset();
  h.provider.mockReturnValue({ data: null });
});

function renderCard() {
  return render(<MemoryRouter><AIToolsCard onSeeAll={vi.fn()} /></MemoryRouter>);
}

describe('AIToolsCard', () => {
  it('renderiza os 4 mini-tiles das features reais de AIQuickAccess', () => {
    renderCard();
    expect(screen.getAllByTestId('ai-tile')).toHaveLength(4);
    expect(screen.getByText('Sugestões de Resposta')).toBeInTheDocument();
    expect(screen.getByText('Análise de Conversa')).toBeInTheDocument();
    expect(screen.getByText('Alertas de Sentimento')).toBeInTheDocument();
    expect(screen.getByText('Transcrição de Áudio')).toBeInTheDocument();
  });

  it('descrição real das features (não hardcoded)', () => {
    renderCard();
    expect(screen.getByText('IA gera respostas personalizadas para cada conversa')).toBeInTheDocument();
  });
});

describe('AIToolsCard — chip "Ativo" do provedor (SL-165)', () => {
  it('com provedor ativo real, mostra o chip "Ativo"', () => {
    h.provider.mockReturnValue({ data: { name: 'Provedor X', model: 'modelo-x', description: null } });
    renderCard();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('sem provedor ativo (null), o chip é omitido', () => {
    h.provider.mockReturnValue({ data: null });
    renderCard();
    expect(screen.queryByText('Ativo')).not.toBeInTheDocument();
  });

  it('enquanto a consulta carrega (data undefined), o chip também não aparece', () => {
    h.provider.mockReturnValue({ data: undefined });
    renderCard();
    expect(screen.queryByText('Ativo')).not.toBeInTheDocument();
  });
});
