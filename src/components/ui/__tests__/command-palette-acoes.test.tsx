import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommandPalette } from '@/components/ui/command-palette';
import { GlobalKeyboardProvider } from '@/components/keyboard/GlobalKeyboardProvider';
import { defaultActionCommands } from '@/components/ui/command-palette-data';

// O host da paleta consulta o catálogo; aqui nenhum produto é buscado (a prova é a ação
// padrão, não a busca).
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));

/**
 * R2-INF-033 (#378) + UI-08 (paridade V3) — as ações padrão da paleta (⌘K) precisam
 * produzir efeito observável: `executeCommand` só trata callback, href ou id `nav-`, e
 * sem um desses escolher a entrada apenas fecha o diálogo como se tivesse rodado.
 *
 * "Nova conversa" e "Respostas rápidas" voltaram (UI-08) ligadas ao gatilho global do
 * dono de cada fluxo (`open-new-conversation` → RealtimeInboxView; `open-quick-replies`
 * → ChatPanel), no mesmo padrão de `show-shortcuts-help`. As provas aqui usam o
 * componente REAL com a lista REAL de comandos padrão; o dono que abre cada fluxo é
 * provado nos testes do próprio dono.
 */
function renderPalette(props: Record<string, unknown> = {}) {
  const onNavigate = vi.fn();
  const onOpenChange = vi.fn();
  render(<CommandPalette open onOpenChange={onOpenChange} onNavigate={onNavigate} {...props} />);
  const input = screen.getByPlaceholderText(/Buscar ou digitar comando/);
  input.focus();
  return { onNavigate, onOpenChange, input };
}

const digitar = (input: HTMLElement, texto: string) =>
  fireEvent.change(input, { target: { value: texto } });

/**
 * O título do item passa por `highlightMatch`, que quebra a frase em spans por caractere
 * (o nome acessível perde os espaços), então o clique é feito pelo texto da descrição —
 * que o usuário também lê e que identifica o item sem ambiguidade.
 */
const clicarPelaDescricao = (descricao: string) =>
  fireEvent.click(screen.getByText(descricao).closest('button') as HTMLButtonElement);

describe('CommandPalette — ações padrão com executor (R2-INF-033)', () => {
  it('"Atalhos de teclado" dispara o evento que abre a ajuda real, em vez de só fechar', () => {
    const { onOpenChange, input } = renderPalette();
    // O mesmo evento que o GlobalKeyboardProvider escuta para abrir o painel de ajuda
    // (GlobalKeyboardProvider.tsx: `document.addEventListener('show-shortcuts-help', …)`).
    const ouviuAjuda = vi.fn();
    document.addEventListener('show-shortcuts-help', ouviuAjuda);

    digitar(input, 'atalhos de teclado');
    clicarPelaDescricao('Ver todos os atalhos');

    expect(ouviuAjuda).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    document.removeEventListener('show-shortcuts-help', ouviuAjuda);
  });

  it('"Nova conversa" é oferecida e chega ao dono em `window` (alvo real do listener)', () => {
    const { onOpenChange, input } = renderPalette();
    const abrirNovaConversa = vi.fn();
    // O dono real (RealtimeInboxView) escuta em `window`: o teste escuta no MESMO alvo.
    window.addEventListener('open-new-conversation', abrirNovaConversa);

    digitar(input, 'nova conversa');
    clicarPelaDescricao('Iniciar uma nova conversa');

    expect(abrirNovaConversa).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    window.removeEventListener('open-new-conversation', abrirNovaConversa);
  });

  it('"Respostas rápidas" é oferecida e chega ao dono em `window` (alvo real do listener)', () => {
    const { onOpenChange, input } = renderPalette();
    const abrirRespostasRapidas = vi.fn();
    // O dono real (ChatPanel) escuta em `window`: o teste escuta no MESMO alvo.
    window.addEventListener('open-quick-replies', abrirRespostasRapidas);

    digitar(input, 'respostas rápidas');
    clicarPelaDescricao('Acessar templates de resposta');

    expect(abrirRespostasRapidas).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    window.removeEventListener('open-quick-replies', abrirRespostasRapidas);
  });

  it('mantém o controle de ação explícita (callback do próprio item)', () => {
    const acao = vi.fn();
    const { input } = renderPalette({
      customCommands: [
        { id: 'action-teste', title: 'Ação de teste', description: 'executa callback', category: 'action', action: acao },
      ],
    });

    digitar(input, 'ação de teste');
    clicarPelaDescricao('executa callback');

    expect(acao).toHaveBeenCalledTimes(1);
  });

  it('mantém o controle de navegação por id `nav-`', () => {
    const { onNavigate, input } = renderPalette({
      customCommands: [
        { id: 'nav-teste', title: 'Destino de teste', description: 'navega pelo id', category: 'navigation' },
      ],
    });

    digitar(input, 'destino de teste');
    clicarPelaDescricao('navega pelo id');

    expect(onNavigate).toHaveBeenCalledWith('teste');
  });

  it('item desabilitado continua sem executar nem fechar a paleta', () => {
    const { onNavigate, onOpenChange, input } = renderPalette({
      customCommands: [
        { id: 'action-bloqueada', title: 'Bloqueada', description: 'sem executor', category: 'action', disabled: true },
      ],
    });

    digitar(input, 'bloqueada');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('paleta → ajuda de atalhos, ponta a ponta (R2-INF-033)', () => {
  it('escolher "Atalhos de teclado" abre o painel de ajuda de verdade', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <GlobalKeyboardProvider>
            <div />
          </GlobalKeyboardProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    // Caminho real até esta paleta (DashboardTopBar dispara o mesmo evento; o listener
    // fica no GlobalKeyboardProvider). O host da paleta é lazy (CommandPaletteHost).
    act(() => { document.dispatchEvent(new CustomEvent('open-command-palette')); });
    const input = await screen.findByPlaceholderText(/Buscar ou digitar comando/);

    digitar(input, 'atalhos de teclado');
    clicarPelaDescricao('Ver todos os atalhos');

    // O painel de ajuda REAL (KeyboardShortcutsDialog) fica visível: o efeito anunciado
    // pela entrada da paleta é a ajuda aberta, não o simples fechamento do diálogo.
    expect(await screen.findByText('Enviar mensagem')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Buscar ou digitar comando/)).not.toBeInTheDocument();
  });
});

describe('paleta → dono, ponte de ponta a ponta (refazer 1: alvo `window`)', () => {
  /**
   * A recusa provou que emissor e ouvinte usavam alvos diferentes: o comando publicava
   * em `document` (sem bubbles) e os donos escutam em `window`. Esta ponte chama a
   * `action` REAL do catálogo (o mesmo código que o clique na paleta executa) e prova
   * que um listener em `window` — como o dos donos — recebe o evento.
   */
  it.each([
    { id: 'action-new-chat', evento: 'open-new-conversation' },
    { id: 'action-quick-reply', evento: 'open-quick-replies' },
  ])('a action REAL de "$id" chega a um listener em `window`', ({ id, evento }) => {
    const item = defaultActionCommands.find((c) => c.id === id);
    expect(item?.action).toBeTypeOf('function');

    const ouviuEmWindow = vi.fn();
    window.addEventListener(evento, ouviuEmWindow);
    try {
      item?.action?.();
      expect(ouviuEmWindow).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(evento, ouviuEmWindow);
    }
  });
});
