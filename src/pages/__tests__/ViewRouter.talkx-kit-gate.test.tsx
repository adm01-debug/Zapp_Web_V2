/**
 * X055 — a prancha de referência do Talk X (?view=talkx-kit) é alcançável pelo
 * roteador sem entrada em menu, só com a trava aberta (DEV ou VITE_TALKX_KIT=1).
 * Com a trava fechada, comporta-se como view desconhecida (bloqueio padrão).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let kitOpen = true;

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ roles: ['agent'], loading: false }),
}));

vi.mock('@/components/talkx/__dev__/TalkXKit', () => ({
  TalkXKit: () => <div data-testid="talkx-kit-board">prancha</div>,
}));

vi.mock('@/components/talkx/kit/forcedState', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/talkx/kit/forcedState')>();
  return { ...real, isTalkXKitEnabled: () => kitOpen };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationService } from '@/services/navigation.service';
import { AuthProvider } from '@/hooks/auth/useAuth';
import { TALKX_KIT_VIEW_ID } from '@/components/talkx/kit/forcedState';
import { ViewRouter } from '../ViewRouter';

function renderKit() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/?view=talkx-kit']}>
          <ViewRouter currentView={TALKX_KIT_VIEW_ID} />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('ViewRouter — prancha talkx-kit (X055)', () => {
  beforeEach(() => {
    kitOpen = true;
  });

  it('com a trava aberta, ?view=talkx-kit rende a prancha mesmo sem papel nem permissão — e sem item de menu', async () => {
    renderKit();
    await waitFor(() => expect(screen.getByTestId('talkx-kit-board')).toBeTruthy());
    expect(screen.queryByText('Acesso restrito')).toBeNull();
    // Sem entrada em menu: o id talkx-kit não existe em nenhuma navegação real.
    const all = [
      ...NavigationService.getPrimaryNav(),
      ...NavigationService.getGroups().flatMap((g) => g.items),
      ...NavigationService.getAdvancedNav(),
    ];
    expect(all.some((i) => i.id === 'talkx-kit')).toBe(false);
  });

  it('com a trava fechada, ?view=talkx-kit cai no bloqueio padrão', async () => {
    kitOpen = false;
    renderKit();
    await waitFor(() => expect(screen.getByText('Acesso restrito')).toBeTruthy());
    expect(screen.queryByTestId('talkx-kit-board')).toBeNull();
  });
});
