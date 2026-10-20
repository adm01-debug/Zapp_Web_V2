import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ContactActionButtons } from '../ContactActionButtons';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
// U04 — o selo de e-mails não lidos vem do hook U02; mockado aqui para o teste
// controlar a contagem e para nenhum teste falar com o Supabase real.
const unreadEmailsMock = vi.hoisted(() => ({ count: 0, status: 'ok' as 'ok' | 'erro' | 'idle' | 'loading', lastContactId: null as string | null }));
vi.mock('@/hooks/gmail/useContactUnreadEmails', () => ({
  useContactUnreadEmails: (contactId: string | null) => {
    unreadEmailsMock.lastContactId = contactId;
    return unreadEmailsMock;
  },
}));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({ syncConversationAsync: vi.fn(), isSyncing: false, isConfigured: false }),
}));
const navigateToView = vi.fn();
let videoCallFlag = false;
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: (key: string, fallback = false) => (key === 'video_call' ? videoCallFlag : fallback) }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: (...args: unknown[]) => navigateToView(...args) }));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span data-testid="contact-action-tooltip">{children}</span>,
}));

const baseContact = { id: 'c1', name: 'Maria Silva', phone: '+5511999999999', email: 'maria@test.com' };
const baseContactComAvatar = { ...baseContact, avatar: 'https://cdn.exemplo/maria.png' };
const onStartCall = vi.fn();

// DropdownMenuTrigger do Radix abre no pointerdown, não no click — um clique
// real de mouse sempre dispara os dois eventos nessa ordem.
function openViaPointer(el: Element) {
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
  fireEvent.click(el);
}

/** Localiza o Tile de e-mail pelo ícone (o <button> real que carrega o selo U04). */
function emailTile() {
  return screen.getAllByTestId('contact-action-tile').find(t => t.querySelector('svg.lucide-mail'))!;
}

describe('ContactActionButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    videoCallFlag = false;
    unreadEmailsMock.count = 0;
  });

  it('abre o dropdown de "Ligar" com as opções de chamada', () => {
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    const tiles = screen.getAllByTestId('contact-action-tile');
    const ligarTile = tiles.find(t => t.querySelector('svg.lucide-phone'))!;
    openViaPointer(ligarTile);
    expect(screen.getByText('Ligar via WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Ligar via Telefone')).toBeInTheDocument();
  });

  it('abre o dropdown de "Mais" e dispara onQuickAction ao clicar em Editar Contato', () => {
    const onQuickAction = vi.fn();
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} onQuickAction={onQuickAction} />);
    const tiles = screen.getAllByTestId('contact-action-tile');
    const maisTile = tiles.find(t => t.querySelector('svg.lucide-ellipsis'))!;
    openViaPointer(maisTile);
    fireEvent.click(screen.getByText('Editar Contato'));
    expect(onQuickAction).toHaveBeenCalledWith('edit');
  });

  it('desabilita o botão de e-mail quando o contato não tem e-mail', () => {
    render(<ContactActionButtons contact={{ ...baseContact, email: undefined }} onStartCall={onStartCall} />);
    // O ícone não tem texto acessível próprio; localiza pelo testid comum aos Tiles.
    const tiles = screen.getAllByTestId('contact-action-tile');
    const emailTile = tiles.find(t => t.querySelector('svg.lucide-mail'));
    expect(emailTile).toBeDisabled();
    fireEvent.click(emailTile!);
    expect(navigateToView).not.toHaveBeenCalled();
  });

  it('usa tooltip contextual no e-mail: Sem e-mail quando desabilitado e Abrir e-mail quando habilitado', () => {
    const { rerender } = render(<ContactActionButtons contact={{ ...baseContact, email: undefined }} onStartCall={onStartCall} />);
    expect(screen.getByText('Sem e-mail')).toBeInTheDocument();

    rerender(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    expect(screen.getByText('Abrir e-mail')).toBeInTheDocument();
    expect(screen.queryByText('Abrir email')).not.toBeInTheDocument();
  });

  it('e-mail vazio ("") conta como sem e-mail, e os outros Tiles mostram o próprio texto de tooltip', () => {
    render(<ContactActionButtons contact={{ ...baseContact, email: '' }} onStartCall={onStartCall} />);
    const emailTile = screen.getAllByTestId('contact-action-tile').find(t => t.querySelector('svg.lucide-mail'))!;
    expect(emailTile).toBeDisabled();
    const tooltips = screen.getAllByTestId('contact-action-tooltip').map((t) => t.textContent);
    expect(tooltips).toContain('Sem e-mail');
    // Cada Tile declara o texto do tooltip em `title`; o rótulo curto fica só no aria-label.
    expect(tooltips).toContain('Opções de chamada');
    expect(tooltips).toContain('Mais ações');
    expect(tooltips).not.toContain('E-mail');
  });

  it('clicar no e-mail abre o módulo de E-mail levando o contato (id + e-mail)', () => {
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    const tiles = screen.getAllByTestId('contact-action-tile');
    const emailTile = tiles.find(t => t.querySelector('svg.lucide-mail'))!;
    expect(emailTile).not.toBeDisabled();
    fireEvent.click(emailTile);
    // C03: a navegação carrega o contato para o módulo abrir a conversa dele
    // (ou o compositor com o e-mail preenchido quando não houver conversa).
    expect(navigateToView).toHaveBeenCalledWith('email-chat', { emailContact: 'c1', emailTo: 'maria@test.com' });
  });

  it('o botão de e-mail desabilitado fica focável (wrapper) mesmo com o <button> nativo desabilitado', () => {
    render(<ContactActionButtons contact={{ ...baseContact, email: undefined }} onStartCall={onStartCall} />);
    const tiles = screen.getAllByTestId('contact-action-tile');
    const emailTile = tiles.find(t => t.querySelector('svg.lucide-mail'))!;
    // O <button> real não pode receber foco quando disabled — precisa existir
    // um wrapper focável (tabIndex=0) por fora dele para o Tooltip funcionar.
    const focusableWrapper = emailTile.closest('[tabindex="0"]');
    expect(focusableWrapper).not.toBeNull();
  });

  it('o wrapper focável do botão desabilitado tem role=button, aria-disabled e aria-label (WCAG 4.1.2)', () => {
    render(<ContactActionButtons contact={{ ...baseContact, email: undefined }} onStartCall={onStartCall} />);
    const tiles = screen.getAllByTestId('contact-action-tile');
    const emailTile = tiles.find(t => t.querySelector('svg.lucide-mail'))!;
    const wrapper = emailTile.closest('[tabindex="0"]')!;
    expect(wrapper).toHaveAttribute('role', 'button');
    expect(wrapper).toHaveAttribute('aria-disabled', 'true');
    expect(wrapper).toHaveAttribute('aria-label', 'E-mail');
  });

  it('nenhum Tile expõe o atributo title nativo (era um 2º tooltip divergente do Radix Tooltip)', () => {
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    for (const tile of screen.getAllByTestId('contact-action-tile')) {
      expect(tile).not.toHaveAttribute('title');
    }
  });

  it('esconde a videochamada por padrão (flag video_call desligada)', () => {
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    const tiles = screen.getAllByTestId('contact-action-tile');
    expect(tiles.find(t => t.querySelector('svg.lucide-video'))).toBeUndefined();
  });

  it('C02 — "Ligar via Telefone" emite zapp:start-call real com avatar, nome e origem inbox', () => {
    // Escuta o evento REAL no document — é o mesmo contrato que o
    // CallSessionProvider assina; nada é mockado no caminho do emissor.
    const ouvido = vi.fn();
    document.addEventListener('zapp:start-call', ouvido);
    try {
      render(<ContactActionButtons contact={baseContactComAvatar} onStartCall={onStartCall} />);
      const ligarTile = screen.getAllByTestId('contact-action-tile').find(t => t.querySelector('svg.lucide-phone'))!;
      openViaPointer(ligarTile);
      fireEvent.click(screen.getByText('Ligar via Telefone'));

      expect(ouvido).toHaveBeenCalledTimes(1);
      expect((ouvido.mock.calls[0][0] as CustomEvent).detail).toEqual({
        channel: 'voip',
        phone: baseContactComAvatar.phone,
        contactId: baseContactComAvatar.id,
        name: baseContactComAvatar.name,
        avatar: baseContactComAvatar.avatar,
        source: 'inbox',
      });
      expect(onStartCall).toHaveBeenCalledWith('voip');
    } finally {
      document.removeEventListener('zapp:start-call', ouvido);
    }
  });

  it('C02 — "Ligar via WhatsApp" emite o evento real pelo canal whatsapp (comportamento preservado)', () => {
    const ouvido = vi.fn();
    document.addEventListener('zapp:start-call', ouvido);
    try {
      render(<ContactActionButtons contact={baseContactComAvatar} onStartCall={onStartCall} />);
      const ligarTile = screen.getAllByTestId('contact-action-tile').find(t => t.querySelector('svg.lucide-phone'))!;
      openViaPointer(ligarTile);
      fireEvent.click(screen.getByText('Ligar via WhatsApp'));

      expect(ouvido).toHaveBeenCalledTimes(1);
      expect((ouvido.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
        channel: 'whatsapp',
        phone: baseContactComAvatar.phone,
        avatar: baseContactComAvatar.avatar,
        source: 'inbox',
      });
    } finally {
      document.removeEventListener('zapp:start-call', ouvido);
    }
  });

  it('mostra a videochamada quando a flag video_call está ligada', () => {
    videoCallFlag = true;
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    const tiles = screen.getAllByTestId('contact-action-tile');
    expect(tiles.find(t => t.querySelector('svg.lucide-video'))).toBeDefined();
  });

  // ===== U04 — selo de e-mails não lidos no ícone de E-mail (D02/D03) =====
  it('U04 — mostra o selo com a contagem e o nome acessível com o número', () => {
    unreadEmailsMock.count = 3;
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    expect(screen.getByTestId('contact-email-unread-badge')).toHaveTextContent('3');
    expect(emailTile()).toHaveAttribute('aria-label', 'E-mail, 3 não lidos');
    expect(emailTile()).toHaveAccessibleName('E-mail, 3 não lidos');
  });

  it('U04 — sem e-mails não lidos (count 0) o selo some e o nome acessível volta a "E-mail"', () => {
    unreadEmailsMock.count = 0;
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    expect(screen.queryByTestId('contact-email-unread-badge')).not.toBeInTheDocument();
    expect(emailTile()).toHaveAttribute('aria-label', 'E-mail');
  });

  it('U04 — acima de 99 o selo mostra "99+" mas o nome acessível leva o número real', () => {
    unreadEmailsMock.count = 150;
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    expect(screen.getByTestId('contact-email-unread-badge')).toHaveTextContent('99+');
    expect(emailTile()).toHaveAccessibleName('E-mail, 150 não lidos');
  });

  it('U04 — o selo aparece só no ícone de E-mail, não nos outros tiles', () => {
    unreadEmailsMock.count = 2;
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    expect(screen.getAllByTestId('contact-email-unread-badge')).toHaveLength(1);
    expect(emailTile().querySelector('[data-testid="contact-email-unread-badge"]')).not.toBeNull();
  });

  it('U04 — contato sem e-mail cadastrado: hook ocioso (contactId null) e nenhum selo', () => {
    unreadEmailsMock.count = 4;
    render(<ContactActionButtons contact={{ ...baseContact, email: undefined }} onStartCall={onStartCall} />);
    expect(unreadEmailsMock.lastContactId).toBeNull();
    expect(screen.queryByTestId('contact-email-unread-badge')).not.toBeInTheDocument();
    expect(emailTile()).toHaveAttribute('aria-label', 'E-mail');
  });
});
