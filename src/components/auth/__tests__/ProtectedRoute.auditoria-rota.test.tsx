/**
 * Integração ProtectedRoute + logAudit REAL (sem mock de '@/lib/audit'): prova
 * que a rota tentada chega ao RPC em `details.entity_id_text`, e nao como
 * `p_entity_id` (a coluna e uuid e o texto viraria NULL).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', email: 'agente@promobrindes.com.br' }, loading: false }),
}));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    loading: false,
    rolesLoadError: false,
    hasRole: () => false,
  }),
}));
vi.mock('@/services/role.service', () => ({
  RoleService: { checkPermission: vi.fn(async () => true) },
}));
vi.mock('@/services/auth.service', () => ({
  AuthService: {
    signOut: vi.fn(async () => {}),
    getMfaAssurance: async () => ({
      currentLevel: 'aal1',
      nextLevel: 'aal1',
      currentAuthenticationMethods: [],
    }),
  },
}));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

beforeEach(() => {
  vi.clearAllMocks();
  mockRpc.mockResolvedValue({ error: null });
});

describe('ProtectedRoute — a rota negada chega na auditoria', () => {
  it('manda a rota em details.entity_id_text e nao na coluna uuid', async () => {
    render(
      <MemoryRouter initialEntries={['/painel']}>
        <ProtectedRoute requiredRoles={['admin']}>
          <div>CONTEUDO PROTEGIDO</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
        p_action: 'unauthorized_access',
        p_entity_type: 'route',
        p_entity_id: null,
        p_details: expect.objectContaining({
          required: ['admin'],
          method: 'NAVIGATE',
          entity_id_text: '/painel',
        }),
      }));
    });
    expect(screen.queryByText('CONTEUDO PROTEGIDO')).toBeNull();
  });
});
