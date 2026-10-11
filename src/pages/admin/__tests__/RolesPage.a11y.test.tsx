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
    from: () => ({
      select: () => ({
        eq: () => ({ order: async () => ({ data: [], error: null }) }),
      }),
    }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock('@/pages/admin/useRolesPageState', () => ({
  useRolesPageState: () => ({
    loading: false,
    loadError: null,
    retryLoad: vi.fn(),
    search: '',
    setSearch: vi.fn(),
    showAddDialog: true,
    setShowAddDialog: vi.fn(),
    selectedUser: '',
    setSelectedUser: vi.fn(),
    selectedRole: '',
    setSelectedRole: vi.fn(),
    availableUsers: [
      { user_id: 'u1', name: 'Ana Silva', email: 'ana@test.local' },
    ],
    userToRemove: null,
    setUserToRemove: vi.fn(),
    updating: false,
    handleAddRole: vi.fn(),
    handleRemoveRole: vi.fn(),
    groupedUsers: { admin: [], supervisor: [], agent: [], special_agent: [] },
  }),
}));
vi.mock('@/components/permissions/PermissionMatrix', () => ({ PermissionMatrix: () => null }));
vi.mock('@/components/admin/VisibilityGrantsManager', () => ({
  VisibilityGrantsManager: () => null,
}));

import RolesPage from '@/pages/admin/RolesPage';

describe('a11y: seletores nos papéis têm nome acessível (N-065)', () => {
  it('axe não acusa violação de nome em RolesPage', async () => {
    const { container } = render(<RolesPage />);

    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('encontra 2 combobox com nome visível (RolesPage)', () => {
    render(<RolesPage />);

    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);

    expect(screen.getByRole('combobox', { name: 'Usuário' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Role' })).toBeInTheDocument();

    // associação programática rótulo <-> controle (N-065)
    const userTrigger = screen.getByRole('combobox', { name: 'Usuário' });
    const roleTrigger = screen.getByRole('combobox', { name: 'Role' });
    for (const [trigger, labelId, forId] of [
      [userTrigger, 'user-select-label', 'user-select'],
      [roleTrigger, 'role-select-label', 'role-select'],
    ] as const) {
      expect(trigger.getAttribute('id')).toBe(forId);
      expect(trigger.getAttribute('aria-labelledby')).toBe(labelId);
      const label = document.getElementById(labelId);
      expect(label?.tagName.toLowerCase()).toBe('label');
      expect(label?.getAttribute('for')).toBe(forId);
    }
  });
});