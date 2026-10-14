import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Exclusão de automação NUNCA apaga no primeiro clique: a lixeira abre o
 * AlertDialog de confirmação e o `deleteMutation.mutate` só roda no botão
 * "Excluir". "Cancelar" fecha sem apagar nada. O teste renderiza o componente
 * REAL (não há mock de UI de confirmação) e observa a mutation real.
 */

const mocks = vi.hoisted(() => ({ deleteMutate: vi.fn() }));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

vi.mock('../useAutomations', () => ({
  useAutomations: () => ({
    automations: [
      {
        id: 'auto-1',
        name: 'Boas-vindas',
        description: null,
        is_active: true,
        trigger_type: 'keyword',
        trigger_config: {},
        actions: [],
        created_by: 'u1',
        last_triggered_at: null,
        trigger_count: 0,
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
      },
    ],
    isLoading: false,
    createMutation: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateMutation: { mutate: vi.fn(), mutateAsync: vi.fn() },
    deleteMutation: { mutate: mocks.deleteMutate },
  }),
}));

import { AutomationsManager } from '../AutomationsManager';

beforeEach(() => vi.clearAllMocks());

describe('AutomationsManager — exclusão com confirmação', () => {
  it('a lixeira abre a confirmação e NÃO apaga antes de confirmar; cancelar mantém a automação', () => {
    render(<AutomationsManager />);

    fireEvent.click(screen.getByLabelText('Excluir automação'));

    expect(mocks.deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Excluir automação?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mocks.deleteMutate).not.toHaveBeenCalled();
  });

  it('confirmar dispara a exclusão da automação certa', () => {
    render(<AutomationsManager />);

    fireEvent.click(screen.getByLabelText('Excluir automação'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(mocks.deleteMutate).toHaveBeenCalledWith('auto-1');
  });
});
