import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContactActionButtons } from '../ContactActionButtons';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({ syncConversationAsync: vi.fn(), isSyncing: false, isConfigured: false }),
}));
const navigateToView = vi.fn();
let videoCallFlag = false;
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: (key: string, fallback = false) => (key === 'video_call' ? videoCallFlag : fallback) }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: (...args: unknown[]) => navigateToView(...args) }));

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

describe('ContactActionButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    videoCallFlag = false;
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
});
