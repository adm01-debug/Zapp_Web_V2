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
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: (...args: unknown[]) => navigateToView(...args) }));

const baseContact = { id: 'c1', name: 'Maria Silva', phone: '+5511999999999', email: 'maria@test.com' };
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

  it('não chama navigateToView quando o e-mail existe mas o clique é no botão certo', () => {
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    const tiles = screen.getAllByTestId('contact-action-tile');
    const emailTile = tiles.find(t => t.querySelector('svg.lucide-mail'))!;
    expect(emailTile).not.toBeDisabled();
    fireEvent.click(emailTile);
    expect(navigateToView).toHaveBeenCalledWith('email-chat');
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

  it('nenhum Tile expõe o atributo title nativo (era um 2º tooltip divergente do Radix Tooltip)', () => {
    render(<ContactActionButtons contact={baseContact} onStartCall={onStartCall} />);
    for (const tile of screen.getAllByTestId('contact-action-tile')) {
      expect(tile).not.toHaveAttribute('title');
    }
  });
});
