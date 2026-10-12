import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlobalKeyboardProvider, useGlobalKeyboard } from '@/components/keyboard/GlobalKeyboardProvider';

/**
 * X054 — a busca ⌘K tem UM dono (GlobalKeyboardProvider) e UMA paleta (CommandPaletteHost):
 * `open-global-search` (Sidebar, MobileShell) e o atalho abrem a mesma paleta, os módulos
 * entram como comandos de navegação filtrados pelo papel e escolher um item navega direto
 * a ele. O provider, o host, o hook de módulos e a lista real do NavigationService rodam de
 * verdade; só o papel do usuário e o cliente Supabase são controlados.
 */
const papel = vi.hoisted(() => ({ roles: ['admin'] as string[], permissions: [] as string[] }));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: papel.roles,
    permissions: papel.permissions,
    isAdmin: papel.roles.includes('admin'),
    isSupervisor: papel.roles.includes('supervisor'),
    isSpecialAgent: false,
    hasRole: (r: string) => papel.roles.includes(r),
    loading: false,
    permissionsLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));

const PLACEHOLDER = /Buscar ou digitar comando/;
const CAMPANHA_ID = 'camp-x054';

/** Faz o papel de Index.tsx: registra o handler de navegação do shell. */
function ShellFalso({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { registerNavigationHandler, unregisterNavigationHandler } = useGlobalKeyboard();
  useEffect(() => {
    registerNavigationHandler(onNavigate);
    return () => unregisterNavigationHandler();
  }, [registerNavigationHandler, unregisterNavigationHandler, onNavigate]);
  return null;
}

function montar() {
  const onNavigate = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['talkx-campaigns'], [{ id: CAMPANHA_ID, name: 'Black Friday Zeta', status: 'running' }]);
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <GlobalKeyboardProvider>
          <ShellFalso onNavigate={onNavigate} />
        </GlobalKeyboardProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { onNavigate };
}

async function abrirPorEvento() {
  act(() => { document.dispatchEvent(new CustomEvent('open-global-search')); });
  return screen.findByPlaceholderText(PLACEHOLDER);
}

/** O título vem com cada letra casada em um <span>; o nome acessível não é confiável, o texto é. */
function acharItem(titulo: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('button')).find((b) => b.textContent?.startsWith(titulo));
}
function itemDaPaleta(titulo: string) {
  return vi.waitFor(() => {
    const item = acharItem(titulo);
    if (!item) throw new Error(`item "${titulo}" não está na paleta`);
    return item;
  });
}

beforeEach(() => {
  papel.roles = ['admin'];
  papel.permissions = [];
  window.history.replaceState(null, '', '/');
});

describe('paleta única do ⌘K (X054)', () => {
  it('open-global-search abre a paleta única, e só uma', async () => {
    montar();
    expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument();

    await abrirPorEvento();

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('Ctrl+K tem um dono só: abre e a segunda vez fecha', async () => {
    montar();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await screen.findByPlaceholderText(PLACEHOLDER);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await vi.waitFor(() => expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument());
  });

  it('admin encontra o módulo exclusivo de admin (Telemetria BD)', async () => {
    montar();
    const input = await abrirPorEvento();
    fireEvent.change(input, { target: { value: 'Telemetria' } });
    expect(await itemDaPaleta('Telemetria BD')).toBeInTheDocument();
  });

  it('supervisor não encontra módulo exclusivo de admin, mas encontra o de staff', async () => {
    papel.roles = ['supervisor'];
    montar();
    const input = await abrirPorEvento();

    fireEvent.change(input, { target: { value: 'Telemetria' } });
    expect(acharItem('Telemetria BD')).toBeUndefined();

    fireEvent.change(input, { target: { value: 'Carteira' } });
    expect(await itemDaPaleta('Carteira')).toBeInTheDocument();
  });

  it('escolher um módulo navega direto a ele e fecha a paleta', async () => {
    const { onNavigate } = montar();
    const input = await abrirPorEvento();

    fireEvent.change(input, { target: { value: 'Tarefas' } });
    fireEvent.click(await itemDaPaleta('Tarefas'));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('tasks');
    await vi.waitFor(() => expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument());
  });

  it('escolher uma campanha do Talk X abre aquela campanha, não só o módulo', async () => {
    const { onNavigate } = montar();
    const input = await abrirPorEvento();

    fireEvent.change(input, { target: { value: 'Black Friday' } });
    fireEvent.click(await itemDaPaleta('Black Friday Zeta'));

    expect(onNavigate).toHaveBeenCalledWith('talkx');
    expect(new URLSearchParams(window.location.search).get('campaign')).toBe(CAMPANHA_ID);
  });
});
