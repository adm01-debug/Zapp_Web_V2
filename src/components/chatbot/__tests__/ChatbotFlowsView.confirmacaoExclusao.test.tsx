import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Exclusão de fluxo de chatbot com confirmação: a lixeira abre o AlertDialog e
 * `deleteFlow.mutate` só roda no botão "Excluir". "Cancelar" fecha sem apagar.
 * O componente é o REAL (nenhum mock do diálogo).
 */

const mocks = vi.hoisted(() => ({ deleteMutate: vi.fn() }));

vi.mock('@/hooks/integrations/useChatbotFlows', () => ({
  useChatbotFlows: () => ({
    flows: [
      {
        id: 'flow-1',
        name: 'Fluxo de saudação',
        description: 'Responde oi',
        is_active: true,
        trigger_type: 'keyword',
        trigger_value: 'oi',
        nodes: [],
        edges: [],
        variables: {},
        whatsapp_connection_id: null,
        created_by: 'u1',
        execution_count: 0,
        last_executed_at: null,
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
      },
    ],
    isLoading: false,
    createFlow: { mutate: vi.fn(), isPending: false },
    updateFlow: { mutate: vi.fn() },
    deleteFlow: { mutate: mocks.deleteMutate },
    toggleFlow: { mutate: vi.fn() },
  }),
}));

import { ChatbotFlowsView } from '../ChatbotFlowsView';

beforeEach(() => vi.clearAllMocks());

describe('ChatbotFlowsView — exclusão com confirmação', () => {
  it('a lixeira abre a confirmação e NÃO apaga antes de confirmar; cancelar mantém o fluxo', () => {
    render(<ChatbotFlowsView />);

    fireEvent.click(screen.getByLabelText('Excluir fluxo'));

    expect(mocks.deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Excluir fluxo de chatbot?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mocks.deleteMutate).not.toHaveBeenCalled();
  });

  it('confirmar exclui o fluxo certo', () => {
    render(<ChatbotFlowsView />);

    fireEvent.click(screen.getByLabelText('Excluir fluxo'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(mocks.deleteMutate).toHaveBeenCalledWith('flow-1');
  });
});
