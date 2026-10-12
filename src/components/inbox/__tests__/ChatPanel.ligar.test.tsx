/**
 * C02 (t_673b1040) — o "Ligar" do inbox emite o pedido de chamada de saída.
 *
 * O cabeçalho do chat NÃO tem botão de ligar: o ChatPanel chegava a passar uma
 * prop `onStartCall` que o ChatPanelHeader nunca consumia (prop morta, removida
 * no mesmo cartão). O botão REAL de ligar do inbox vive em `ContactActionButtons`,
 * que despacha o evento global `zapp:start-call` pelo contrato de
 * `@/lib/calls/events` — o mesmo que o `CallSessionProvider` assina.
 *
 * Este teste renderiza o componente REAL (sem dublê que invente uma UI que não
 * existe) e falha se o botão de ligar sumir. Antes de t_673b1040 o arquivo
 * substituía o cabeçalho por um botão falso `ligar-do-cabecalho`, provando um
 * botão que não existia no produto.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ContactActionButtons } from '../contact-details/ContactActionButtons';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({ syncConversationAsync: vi.fn(), isSyncing: false, isConfigured: false }),
}));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('../RealtimeCollaboration', () => ({ RealtimeCollaboration: () => null }));

const contato = {
  id: 'contato-1',
  name: 'Maria Silva',
  phone: '+551****9999',
  avatar: 'https://cdn.exemplo/maria.png',
};

// DropdownMenuTrigger do Radix abre no pointerdown, não no click — um clique
// real de mouse sempre dispara os dois eventos nessa ordem.
function abrirLigar() {
  const tile = screen.getAllByTestId('contact-action-tile').find((t) => t.querySelector('svg.lucide-phone'))!;
  fireEvent.pointerDown(tile);
  fireEvent.pointerUp(tile);
  fireEvent.click(tile);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Ligar do inbox — botão real do painel de contato (C02)', () => {
  it('o botão "Ligar" existe de verdade e abre as opções de chamada', () => {
    render(<ContactActionButtons contact={contato} onStartCall={vi.fn()} />);
    abrirLigar();
    expect(screen.getByText('Ligar via WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Ligar via Telefone')).toBeInTheDocument();
  });

  it('"Ligar via Telefone" emite zapp:start-call real com phone, nome, avatar e source inbox', () => {
    const ouvido = vi.fn();
    document.addEventListener('zapp:start-call', ouvido);
    try {
      render(<ContactActionButtons contact={contato} onStartCall={vi.fn()} />);
      abrirLigar();
      fireEvent.click(screen.getByText('Ligar via Telefone'));

      expect(ouvido).toHaveBeenCalledTimes(1);
      expect((ouvido.mock.calls[0][0] as CustomEvent).detail).toEqual({
        channel: 'voip',
        phone: contato.phone,
        contactId: contato.id,
        name: contato.name,
        avatar: contato.avatar,
        source: 'inbox',
      });
    } finally {
      document.removeEventListener('zapp:start-call', ouvido);
    }
  });

  it('"Ligar via WhatsApp" emite o pedido pelo canal whatsapp (comportamento preservado)', () => {
    const ouvido = vi.fn();
    document.addEventListener('zapp:start-call', ouvido);
    try {
      render(<ContactActionButtons contact={contato} onStartCall={vi.fn()} />);
      abrirLigar();
      fireEvent.click(screen.getByText('Ligar via WhatsApp'));

      expect(ouvido).toHaveBeenCalledTimes(1);
      expect((ouvido.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
        channel: 'whatsapp',
        phone: contato.phone,
        avatar: contato.avatar,
        source: 'inbox',
      });
    } finally {
      document.removeEventListener('zapp:start-call', ouvido);
    }
  });
});
