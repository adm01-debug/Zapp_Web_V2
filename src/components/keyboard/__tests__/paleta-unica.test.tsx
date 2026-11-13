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
const fontes = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));

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
  supabase: { rpc: fontes.rpc, functions: { invoke: fontes.invoke } },
}));

const PLACEHOLDER = /Buscar ou digitar comando/;
const CAMPANHA_ID = 'camp-x054';
const SEGMENTO_ID = 'seg-x054';
const TEMPLATE_ID = 'tpl-x054';

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
  client.setQueryData(['talkx-campaigns', 'cmd-palette'], [{ id: CAMPANHA_ID, name: 'Black Friday Zeta', status: 'running' }]);
  client.setQueryData(['talkx-segments', 'cmd-palette'], [{ id: SEGMENTO_ID, name: 'Público Quente' }]);
  client.setQueryData(['talkx-templates', 'cmd-palette'], [{ id: TEMPLATE_ID, name: 'Modelo Aurora' }]);
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
  fontes.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  fontes.invoke.mockReset().mockResolvedValue({ data: null, error: null });
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
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
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

  it('escolher um segmento abre aquele segmento, não só a aba (fora do Talk X)', async () => {
    const { onNavigate } = montar();
    const input = await abrirPorEvento();

    fireEvent.change(input, { target: { value: 'Quente' } });
    fireEvent.click(await itemDaPaleta('Público Quente'));

    expect(onNavigate).toHaveBeenCalledWith('talkx');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('segment')).toBe(SEGMENTO_ID);
    expect(params.get('tab')).toBe('segments');
    expect(params.get('campaign')).toBeNull();
  });

  it('já no Talk X: escolher um template abre aquele template (popstate)', async () => {
    window.history.replaceState(null, '', '/?view=talkx&tab=overview');
    const { onNavigate } = montar();
    const input = await abrirPorEvento();

    fireEvent.change(input, { target: { value: 'Aurora' } });
    fireEvent.click(await itemDaPaleta('Modelo Aurora'));
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

    expect(onNavigate).toHaveBeenCalledWith('talkx');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('template')).toBe(TEMPLATE_ID);
    expect(params.get('tab')).toBe('templates');
    expect(params.get('campaign')).toBeNull();
  });
});

const CONTATO_UM = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '[E2E] Contato', surname: 'de teste', phone: '5511999900011', company: 'Empresa A',
};
const CONTATO_DOIS = { ...CONTATO_UM, id: '22222222-2222-4222-8222-222222222222', phone: '5511999900022', company: 'Empresa B' };

async function itemPorId(id: string): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const item = document.getElementById('cmd-opt-' + id);
    if (!item) throw new Error('comando ainda não apareceu');
    return item;
  });
}

/**
 * Navega com ArrowDown até `alvo` ficar `aria-selected`. A lista com query monta
 * `[...filteredCommands, ...searchResults]` (command-palette.tsx): comandos filtrados vêm
 * ANTES dos contatos, então a posição de um contato varia com a query — esperar índice fixo
 * era flaky. O loop com limite (cada tecla dentro de `act` força o flush do estado do React
 * antes da próxima) elimina a dependência da posição absoluta.
 */
async function selecionarPorTeclado(alvo: HTMLElement, passosMax = 30) {
  for (let passo = 0; passo < passosMax; passo += 1) {
    if (alvo.getAttribute('aria-selected') === 'true') return;
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }); });
  }
  throw new Error(`alvo ainda não selecionado após ${passosMax} ArrowDown`);
}

describe('Ctrl+K — contatos pelo serviço e navegação compartilhados', () => {
  for (const [view, interaction] of [['dashboard', 'click'], ['inbox', 'keyboard']] as const) {
    it('abre o segundo homônimo pelo UUID: ' + view + ' / ' + interaction, async () => {
      fontes.rpc.mockResolvedValue({ data: [CONTATO_UM, CONTATO_DOIS], error: null });
      window.history.replaceState(null, '', '/?view=' + view);
      montar();
      const input = await abrirPorEvento();
      fireEvent.change(input, { target: { value: '[E2E]' } });
      const first = await itemPorId('contact-' + CONTATO_UM.id);
      const second = await itemPorId('contact-' + CONTATO_DOIS.id);
      expect(first).toHaveTextContent('[E2E] Contato de teste');
      expect(second).toHaveTextContent('[E2E] Contato de teste');
      expect(second).toHaveTextContent(CONTATO_DOIS.phone);
      expect(fontes.rpc).toHaveBeenCalledWith('search_contacts', expect.objectContaining({
        search_term: '[E2E]', page_size: 8, page_offset: 0, sort_field: 'name', sort_direction: 'asc',
      }));

      // O helper real troca a view e despacha o evento. A Inbox não é montada
      // nesta suíte: este listener controla apenas a confirmação do consumidor.
      const delivered = vi.fn();
      const appWindow = window as Window & { __pendingOpenContactId?: string };
      const consume = (event: Event) => {
        delivered((event as CustomEvent<{ contactId: string }>).detail.contactId);
        delete appWindow.__pendingOpenContactId;
      };
      window.addEventListener('open-contact-chat', consume);
      try {
        if (interaction === 'keyboard') {
          await selecionarPorTeclado(first);
          await selecionarPorTeclado(second);
          act(() => { fireEvent.keyDown(window, { key: 'Enter' }); });
        } else {
          fireEvent.click(second);
        }
        await vi.waitFor(() => {
          expect(delivered).toHaveBeenCalledTimes(1);
          expect(delivered).toHaveBeenCalledWith(CONTATO_DOIS.id);
        });
        expect(new URLSearchParams(window.location.search).get('view')).toBe('inbox');
        expect(new URLSearchParams(window.location.search).has('contact')).toBe(false);
        expect(appWindow.__pendingOpenContactId).toBeUndefined();
        await vi.waitFor(() => expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument());
      } finally {
        window.removeEventListener('open-contact-chat', consume);
        delete appWindow.__pendingOpenContactId;
      }
    });
  }

  it('catálogo indisponível mantém os contatos encontrados', async () => {
    fontes.invoke.mockRejectedValue(new Error('erro privado do catálogo'));
    fontes.rpc.mockResolvedValue({ data: [CONTATO_UM], error: null });
    montar();
    const input = await abrirPorEvento();
    fireEvent.change(input, { target: { value: '[E2E]' } });

    expect(await itemPorId('contact-' + CONTATO_UM.id)).toHaveTextContent(CONTATO_UM.phone);
    expect(screen.queryByText('Busca de contatos indisponível')).not.toBeInTheDocument();
  });

  it('erro de contatos é visível e mantém o produto encontrado', async () => {
    fontes.rpc.mockResolvedValue({ data: null, error: { message: 'erro privado de contatos' } });
    fontes.invoke.mockResolvedValue({ data: { products: [{ id: 71, name: 'Caneca Térmica', sku: 'E2E-71' }] }, error: null });
    montar();
    const input = await abrirPorEvento();
    fireEvent.change(input, { target: { value: '[E2E]' } });

    expect(await itemPorId('catalog-71')).toHaveTextContent('Caneca Térmica');
    const failure = await itemPorId('contact-search-error');
    expect(failure).toBeDisabled();
    expect(failure).toHaveTextContent('Busca de contatos indisponível');
    expect(screen.queryByText('erro privado de contatos')).not.toBeInTheDocument();
  });
});
