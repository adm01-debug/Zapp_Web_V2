/**
 * Remocao da tela 'Export Auto' (?view=auto-export): regra do Joaquim (07/10)
 * — nenhuma informacao sai do sistema; o Zapp nao exporta.
 *
 * Prova que a view sumiu (nao esta mais no mapa de lazy views nem no menu
 * avancado), que o deep link antigo cai no bloqueio padrao de view desconhecida
 * (negado por omissao) e que o modulo de lazy views + o roteador continuam
 * importaveis — ou seja, nenhum import ficou quebrado.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: ['admin'],
    permissions: [],
    isAdmin: true,
    isSupervisor: true,
    isSpecialAgent: false,
    hasRole: () => true,
    loading: false,
    permissionsLoading: false,
    refetch: vi.fn(),
  }),
}));

import { ViewRouter } from '@/pages/ViewRouter';
import * as Views from '@/pages/lazyViews';
import { NavigationService } from '@/services/navigation.service';

describe('Export Auto removido (nenhuma informacao sai do sistema)', () => {
  it('nao expoe mais a view no mapa de lazy views', () => {
    expect('AutoExportManager' in Views).toBe(false);
  });

  it('nao tem mais o item no menu avancado', () => {
    const ids = NavigationService.getAdvancedNav().map((item) => item.id);
    expect(ids).not.toContain('auto-export');
  });

  it('nega o deep link antigo ?view=auto-export (view desconhecida = negado)', () => {
    expect(NavigationService.canAccess('auto-export', ['admin'])).toBe(false);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ViewRouter currentView="auto-export" onNavigateTo={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
  });
});
