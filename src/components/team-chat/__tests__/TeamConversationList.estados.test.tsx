import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/hooks/team-chat/useActiveDepartments', () => ({
  useActiveDepartments: () => ({ data: [], isLoading: false }),
}));

import { TeamConversationList } from '../TeamConversationList';

describe('TeamConversationList — carregando vs vazio', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('mostra esqueleto enquanto carrega e NÃO anuncia "Nenhuma conversa"', () => {
    render(createElement(TeamConversationList, {
      conversations: [], selectedId: null, onSelect: vi.fn(), loading: true,
    }));

    expect(screen.getByRole('status', { name: 'Carregando conversas' })).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma conversa')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('sem carregar e sem conversas mostra o estado vazio real', () => {
    render(createElement(TeamConversationList, {
      conversations: [], selectedId: null, onSelect: vi.fn(), loading: false,
    }));

    expect(screen.getByText('Nenhuma conversa')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Carregando conversas' })).not.toBeInTheDocument();
  });
});
