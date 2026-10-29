import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isSupervisor: false, loading: true }),
}));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: () => true,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import { CRM360ExplorerView } from '../CRM360ExplorerView';

describe('CRM360ExplorerView — checagem de permissão', () => {
  it('mostra esqueleto em vez de tela em branco enquanto roleLoading', () => {
    render(<CRM360ExplorerView />);

    expect(screen.getByRole('status', { name: 'Carregando CRM 360' })).toBeInTheDocument();
    expect(screen.queryByText('Acesso restrito')).not.toBeInTheDocument();
    expect(screen.queryByText('CRM 360° Explorer')).not.toBeInTheDocument();
  });
});
