/**
 * SL-198 (inventário 061) — o "Histórico de envio" (`MessageSendHistorySheet` +
 * `messageSendTimeline`) estava pronto e testado, mas NENHUMA tela o importava: o
 * defeito era o menu "⋮" do balão (`MessageHoverToolbar`) não oferecer a entrada, e
 * o agente nunca via as tentativas de entrega.
 *
 * Aqui se prova o CONSUMIDOR, renderizando a toolbar de verdade e o sheet de verdade:
 *   - mensagem do agente: a entrada "Histórico de envio" aparece e o clique abre o sheet;
 *   - mensagem do contato: a entrada NÃO aparece (a recebida não tem envio a acompanhar).
 *
 * O sheet é o componente real (`../MessageSendHistorySheet`), não um mock, para o teste
 * provar o que o usuário vê. Os delivery_* vêm das colunas reais de public.messages.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageHoverToolbar } from '../MessageHoverToolbar';
import { Message } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  updateEq: vi.fn(),
  deleteMessage: vi.fn(),
  markMessageAsRead: vi.fn(),
  markMessageAsUnread: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: (...args: unknown[]) => mocks.updateEq(...args),
      }),
    }),
  },
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    deleteMessage: mocks.deleteMessage,
    markMessageAsRead: mocks.markMessageAsRead,
    markMessageAsUnread: mocks.markMessageAsUnread,
    isLoading: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/components/inbox/TextToSpeechButton', () => ({
  TextToSpeechButton: () => null,
}));

// Mesmo padrão de MessageHoverToolbar.delete.test.tsx: o Radix DropdownMenu não abre de
// forma confiável sob jsdom, então o conteúdo é renderizado sempre visível.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="menu-content">{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

/** Linha de `public.messages` como as RPCs de entrega a deixam (só o que importa aqui). */
const makeMessage = (over: Partial<Message> = {}): Message => ({
  id: 'm-1',
  content: 'olá',
  sender: 'agent',
  timestamp: new Date('2026-10-09T12:00:00.000Z'),
  type: 'text',
  external_id: 'ext-1',
  created_at: '2026-10-09T12:00:00.000Z',
  status: 'sent',
  status_updated_at: '2026-10-09T12:00:04.000Z',
  delivery_attempt_count: 2,
  delivery_claimed_at: null,
  delivery_claim_expires_at: null,
  delivery_last_claim_token: '11111111-1111-1111-1111-111111111111',
  ...over,
} as Message);

function renderToolbar(message: Message) {
  render(
    <MessageHoverToolbar
      message={message}
      isSent={message.sender === 'agent'}
      instanceName="inst-1"
      contactJid="5511999999999@s.whatsapp.net"
      ttsLoading={false}
      ttsPlaying={false}
      ttsMessageId={null}
      onReply={vi.fn()}
      onForward={vi.fn()}
      onCopy={vi.fn()}
      onSpeak={vi.fn()}
      onStop={vi.fn()}
      onMessageDeleted={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteMessage.mockResolvedValue(undefined);
  mocks.updateEq.mockResolvedValue({ error: null });
  mocks.markMessageAsRead.mockResolvedValue(undefined);
  mocks.markMessageAsUnread.mockResolvedValue(undefined);
});

describe('MessageHoverToolbar — Histórico de envio no menu da mensagem (SL-198/061)', () => {
  it('a mensagem do agente tem a entrada e o clique abre o sheet com a timeline', () => {
    renderToolbar(makeMessage());

    const entrada = screen.getByText('Histórico de envio');
    expect(entrada).toBeTruthy();

    // Antes do clique o sheet está fechado: nenhuma timeline no documento.
    expect(screen.queryByTestId('message-attempts-timeline')).toBeNull();

    fireEvent.click(entrada);

    // O sheet real abriu: o passo "Tentativas 1 a 2 de envio" vem das colunas do banco.
    expect(screen.getByTestId('message-attempts-timeline')).toBeTruthy();
    expect(screen.getByText('Tentativas 1 a 2 de envio')).toBeTruthy();
    expect(screen.getByText('Enviado')).toBeTruthy();
  });

  it('a mensagem do contato NÃO tem a entrada de Histórico de envio', () => {
    renderToolbar(makeMessage({ sender: 'contact' }));

    expect(screen.queryByText('Histórico de envio')).toBeNull();
    expect(screen.queryByTestId('message-attempts-timeline')).toBeNull();
  });
});
