import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// N-184: o Select de filtro do gerenciador de automações não tinha nome
// acessível. Este arquivo renderiza o `AutomationsManager` REAL (Select do
// Radix) com os dados controlados por mock do hook `useAutomations`.

vi.mock('../useAutomations', () => ({
  useAutomations: () => ({
    automations: [
      {
        id: 'auto-1',
        name: 'Boas-vindas',
        description: 'desc',
        is_active: true,
        trigger_type: 'new_message',
        trigger_config: {},
        actions: [{ type: 'send_message', config: { message: 'Olá!' } }],
        created_by: null,
        last_triggered_at: null,
        trigger_count: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    isLoading: false,
    createMutation: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateMutation: { mutate: vi.fn(), mutateAsync: vi.fn() },
    deleteMutation: { mutate: vi.fn() },
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: null, loading: false }),
}));

import { AutomationsManager } from '../AutomationsManager';

describe('AutomationsManager — N-184 nome nos controles (componente real)', () => {
  it('o filtro do gerenciador tem nome acessível', () => {
    render(<AutomationsManager />);
    expect(screen.getByRole('combobox', { name: 'Filtrar automações' })).toBeInTheDocument();
  });

  it('o interruptor do cartão tem o nome exato "Ativar automação Boas-vindas"', () => {
    render(<AutomationsManager />);
    expect(screen.getByRole('switch', { name: 'Ativar automação Boas-vindas' })).toBeInTheDocument();
  });
});
