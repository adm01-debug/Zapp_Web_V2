import { useEffect } from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileShell } from '@/components/mobile/MobileShell';
import { GlobalKeyboardProvider, useGlobalKeyboard } from '@/components/keyboard/GlobalKeyboardProvider';

// R2-PLAT-010: o botão "Buscar" do cabeçalho mobile só ligava um estado local do
// MobileShell (`mobileSearchOpen`) que ninguém lia — nenhuma superfície de busca
// abria. A prova monta o shell mobile REAL e a paleta única REAL (X054: o
// GlobalKeyboardProvider escuta `open-global-search` e hospeda a paleta) e clica no
// botão como o usuário mobile clica.
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: ['admin'],
    isAdmin: true,
    isSupervisor: true,
    isSpecialAgent: false,
    hasRole: () => true,
    loading: false,
    permissions: [],
    permissionsLoading: false,
    refetch: vi.fn(),
  }),
}));

// O teste cobre busca; a central de notificações é provada em
// MobileShell.notificacoes.test.tsx. Sem este mock, o hook real exige AuthProvider
// e impede a regressão de busca de ser exercitada.
vi.mock('@/hooks/system/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    loading: false,
  }),
}));

// O host da paleta consulta o catálogo; nenhum produto é buscado aqui.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));

const PLACEHOLDER = /Buscar ou digitar comando/;

// O jsdom não implementa scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

/** Faz o papel de Index.tsx: registra o handler de navegação do shell. */
function ShellFalso({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { registerNavigationHandler, unregisterNavigationHandler } = useGlobalKeyboard();
  useEffect(() => {
    registerNavigationHandler(onNavigate);
    return () => unregisterNavigationHandler();
  }, [registerNavigationHandler, unregisterNavigationHandler, onNavigate]);
  return null;
}

function renderShell() {
  const onNavigate = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <GlobalKeyboardProvider>
          <ShellFalso onNavigate={onNavigate} />
          <MobileShell
            currentView="inbox"
            setCurrentView={vi.fn()}
            profile={{ name: 'Ana Souza', avatar_url: null }}
            userEmail="ana@exemplo.com"
            signOut={vi.fn()}
            unreadNotifications={0}
          />
        </GlobalKeyboardProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { onNavigate };
}

describe('MobileShell — botão Buscar do cabeçalho (R2-PLAT-010)', () => {
  it('abre a busca compartilhada e foca o campo ao tocar em Buscar', async () => {
    renderShell();

    expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    const input = await screen.findByPlaceholderText(PLACEHOLDER);
    expect(input).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('mostra resultado, navega e fecha a busca ao escolher um módulo', async () => {
    const { onNavigate } = renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    const input = await screen.findByPlaceholderText(PLACEHOLDER);

    fireEvent.change(input, { target: { value: 'Tarefas' } });

    // O título vem com letras casadas em <span>: localiza pelo texto do botão.
    const item = await waitFor(() => {
      const found = Array.from(document.querySelectorAll<HTMLElement>('button')).find((b) =>
        b.textContent?.startsWith('Tarefas'),
      );
      if (!found) throw new Error('Tarefas não está na paleta');
      return found;
    });
    fireEvent.click(item);

    expect(onNavigate).toHaveBeenCalledWith('tasks');
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument(),
    );
  });
});
