/**
 * t_fa2f8515 / PD-63 — o MessageBubble REAL delega a bolha da fila offline.
 *
 * A bolha de uma mensagem parada na fila não pode seguir o caminho de envio (que afirma
 * entrega). Aqui se prova, no componente real, que o status próprio desvia para o balão
 * "Aguardando rede".
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types/chat';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() },
}));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'user-1', full_name: 'Ana' } }) }));
vi.mock('@/hooks/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock('@/components/inbox/chat/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }));
vi.mock('@/components/security/QuarantineBadge', () => ({ QuarantineBadge: () => null }));

import { MessageBubble } from '../MessageBubble';
import { STATUS_AGUARDANDO_REDE } from '../MessageBubbleAguardandoRede';

const baseProps = {
  isFirstInGroup: true,
  isLastInGroup: true,
  ttsLoading: false,
  ttsPlaying: false,
  ttsMessageId: null,
  onSpeak: vi.fn(),
  onStop: vi.fn(),
  onReply: vi.fn(),
  onForward: vi.fn(),
  onCopy: vi.fn(),
  onScrollToMessage: vi.fn(),
  onInteractiveButtonClick: vi.fn(),
  onMessageDeleted: vi.fn(),
  registerRef: vi.fn(),
};

function mensagem(over: Partial<Message> = {}): Message {
  return {
    id: 'cm-fila-1',
    content: 'oi, sem rede',
    sender: 'agent',
    type: 'text',
    timestamp: new Date('2026-10-13T03:00:00Z'),
    ...over,
  } as Message;
}

describe('MessageBubble — status da fila offline desvia para o balão dedicado', () => {
  it('renderiza "Aguardando rede" e nenhum estado de enviado', () => {
    render(<MessageBubble message={mensagem({ status: STATUS_AGUARDANDO_REDE })} {...baseProps} />);

    expect(screen.getByTestId('bolha-aguardando-rede')).toBeInTheDocument();
    expect(screen.getByText('Aguardando rede')).toBeInTheDocument();
    expect(screen.queryByText('Você')).toBeNull();
    expect(screen.queryByText(/enviad/i)).toBeNull();
  });
});
