import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

beforeAll(() => {
  const estilo = document.createElement('style');
  estilo.textContent = '.hidden { display: none; }';
  document.head.appendChild(estilo);
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const mockData = {
        user_roles: [{ id: 'ur1', user_id: 'u1', role: 'special_agent' }],
        profiles: [{ id: 'p1', user_id: 'u1', name: 'Ana Especial', email: 'ana@test.local' }],
        agent_visibility_grants: [],
      };
      return {
        select: (colunas: string) => ({
          eq: (col: string, val: string) => ({
            data: mockData[tabela as keyof typeof mockData] ?? [],
            error: null,
          }),
          order: async () => ({ data: mockData[tabela as keyof typeof mockData] ?? [], error: null }),
        }),
      };
    },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { VisibilityGrantsManager } from '@/components/admin/VisibilityGrantsManager';

describe('a11y: seletores de visibilidade têm nome acessível (N-065)', () => {
  it('axe não acusa violação de nome em VisibilityGrantsManager', async () => {
    const { container } = render(<VisibilityGrantsManager />);

    await screen.findAllByRole('combobox');

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('encontra 2 combobox com nome visível (VisibilityGrantsManager)', async () => {
    render(<VisibilityGrantsManager />);

    const selects = await screen.findAllByRole('combobox');
    expect(selects).toHaveLength(2);

    expect(screen.getByRole('combobox', { name: 'Agente Especial' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Pode ver contatos de' })).toBeInTheDocument();
  });
});