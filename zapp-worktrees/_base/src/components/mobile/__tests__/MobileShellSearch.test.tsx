import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MobileShell } from '@/components/mobile/MobileShell';
import { CommandPalette } from '@/components/CommandPalette';

// R2-PLAT-010: o botão "Buscar" do cabeçalho mobile só ligava um estado local do
// MobileShell (`mobileSearchOpen`) que ninguém lia — nenhuma superfície de busca
// abria. A prova monta o shell mobile REAL e a paleta de comandos REAL na mesma
// composição do app (`src/pages/Index.tsx` renderiza o CommandPalette como irmão
// do AppShell: `document.addEventListener('open-global-search', …)`) e clica no
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

const PLACEHOLDER = 'Buscar módulo… (ex: pipeline, chatbot)';

// O cmdk chama scrollIntoView no item ativo; o jsdom não implementa a função.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderShell() {
  const onNavigate = vi.fn();
  render(
    <>
      <MobileShell
        currentView="inbox"
        setCurrentView={vi.fn()}
        profile={{ name: 'Ana Souza', avatar_url: null }}
        userEmail="ana@exemplo.com"
        signOut={vi.fn()}
        unreadNotifications={0}
      />
      <CommandPalette onNavigate={onNavigate} />
    </>,
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
    expect(document.activeElement).toBe(input);
  });

  it('mostra resultado, navega e fecha a busca ao escolher um módulo', async () => {
    const { onNavigate } = renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    const input = await screen.findByPlaceholderText(PLACEHOLDER);

    fireEvent.change(input, { target: { value: 'Tarefas' } });

    const item = await screen.findByText('Tarefas');
    fireEvent.click(item);

    expect(onNavigate).toHaveBeenCalledWith('tasks');
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument(),
    );
  });
});
