import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Cartão t_90dcdcc8, item 5: os três botões de ícone do card de fluxo
// (editar/duplicar/excluir) não tinham nome acessível — só o ícone.
// Prova: renderiza o componente REAL com um fluxo e exige os nomes.

const flow = {
  id: 'flow-1',
  name: 'Boas-vindas',
  description: 'Fluxo de entrada',
  is_active: true,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
  nodes: [],
  edges: [],
  variables: {},
  execution_count: 3,
  trigger_type: 'keyword',
  trigger_value: 'oi',
};

vi.mock('@/hooks/integrations/useChatbotFlows', () => ({
  useChatbotFlows: () => ({
    flows: [flow],
    isLoading: false,
    createFlow: { mutateAsync: vi.fn() },
    updateFlow: { mutate: vi.fn() },
    deleteFlow: { mutate: vi.fn() },
    toggleFlow: { mutate: vi.fn() },
    refetch: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));

import { ChatbotFlowsView } from '../ChatbotFlowsView';

describe('ChatbotFlowsView — a11y dos botões do card de fluxo (t_90dcdcc8)', () => {
  it('expõe os três botões de ícone com nome acessível', () => {
    render(<ChatbotFlowsView />);

    expect(screen.getByRole('button', { name: 'Editar fluxo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicar fluxo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir fluxo' })).toBeInTheDocument();
  });
});
