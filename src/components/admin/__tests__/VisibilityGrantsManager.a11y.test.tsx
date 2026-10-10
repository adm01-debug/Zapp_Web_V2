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
  it('axe não acusa combobox sem nome em VisibilityGrantsManager', async () => {
    const { container } = render(<VisibilityGrantsManager />);

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const semNome = results.violations.filter((v) =>
      ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });

  it('encontra 2 combobox com nome acessível (VisibilityGrantsManager)', async () => {
    render(<VisibilityGrantsManager />);

    const selects = await screen.findAllByRole('combobox');
    expect(selects).toHaveLength(2);

    const nomes = selects.map((s) => s.getAttribute('aria-label') ?? '');
    expect(nomes).toContain('Selecione o agente especial');
    expect(nomes).toContain('Selecione o agente alvo');
  });
});