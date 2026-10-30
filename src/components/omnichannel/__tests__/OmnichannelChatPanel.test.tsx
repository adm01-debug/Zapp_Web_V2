import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OmnichannelChatPanel } from '../OmnichannelChatPanel';

// Chat embutido do Omnichannel. Prova que o painel reaproveitado (ChatPanel da
// Inbox) é alimentado pelos MESMOS hooks do módulo inbox — histórico via
// useMessages e envio via sendMessageToContact/ChatService — sem duplicar a lógica
// de mensagens. O ChatPanel real é substituído por um stub que só expõe os handlers.

const h = vi.hoisted(() => ({
  useMessages: vi.fn(),
  sendMessageToContact: vi.fn(),
  uploadAudio: vi.fn(),
  refetch: vi.fn(),
  loadOlderMessages: vi.fn(),
  lastProps: null as null | Record<string, unknown>,
}));

vi.mock('@/hooks/chat/useMessages', () => ({ useMessages: h.useMessages }));
vi.mock('@/hooks/realtime/messageSender', () => ({
  sendMessageToContact: h.sendMessageToContact,
}));
vi.mock('@/services/chat.service', () => ({ ChatService: { uploadAudio: h.uploadAudio } }));
vi.mock('@/components/inbox/ChatPanel', () => ({
  ChatPanel: (props: Record<string, unknown>) => {
    h.lastProps = props;
    return (
      <div data-testid="chat-panel">
        <span>{String((props.conversation as { contact: { name: string } }).contact.name)}</span>
        <button
          type="button"
          onClick={() => void (props.onSendMessage as (c: string, r?: string | null) => void)('Olá', 'm-ref')}
        >
          enviar texto
        </button>
        <button
          type="button"
          onClick={() =>
            void (props.onSendAudio as (b: Blob) => Promise<boolean>)(new Blob(['audio']))
          }
        >
          enviar audio
        </button>
        <button type="button" onClick={props.onBack as () => void}>
          back
        </button>
      </div>
    );
  },
}));

const conversation = {
  contact: {
    id: 'c1',
    name: 'Maria Silva',
    phone: '+5511999990000',
    conversation_status: 'open',
    tags: ['vip'],
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-02T12:00:00.000Z',
  },
  messages: [],
  unreadCount: 2,
  lastMessage: null,
} as unknown as Parameters<typeof OmnichannelChatPanel>[0]['conversation'];

const historyMessages = [
  { id: 'm1', content: 'Oi', sender: 'contact', timestamp: new Date('2026-10-02T11:00:00Z') },
];

describe('OmnichannelChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.lastProps = null;
    h.sendMessageToContact.mockResolvedValue({ id: 'sent' });
    h.uploadAudio.mockResolvedValue('https://cdn/audio-1.ogg');
    h.refetch.mockResolvedValue(undefined);
    h.useMessages.mockReturnValue({
      messages: historyMessages,
      loading: false,
      loadingOlder: false,
      hasOlder: true,
      refetch: h.refetch,
      loadOlderMessages: h.loadOlderMessages,
    });
  });

  it('renderiza o painel reaproveitado com a conversa e o histórico', async () => {
    render(<OmnichannelChatPanel conversation={conversation} onClose={() => {}} />);

    expect(await screen.findByTestId('chat-panel')).toBeInTheDocument();
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(h.useMessages).toHaveBeenCalledWith({ contactId: 'c1', enabled: true });
    expect((h.lastProps?.messages as unknown[])).toBe(historyMessages);
    expect((h.lastProps?.conversation as { id: string }).id).toBe('c1');
    expect(h.lastProps?.hasOlderMessages).toBe(true);
  });

  it('envia texto pelo mesmo transporte da Inbox', async () => {
    render(<OmnichannelChatPanel conversation={conversation} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'enviar texto' }));

    await waitFor(() =>
      expect(h.sendMessageToContact).toHaveBeenCalledWith('c1', 'Olá', 'text', undefined, undefined, 'm-ref'),
    );
    await waitFor(() => expect(h.refetch).toHaveBeenCalled());
  });

  it('envia áudio subindo para o storage antes do despacho e confirma o envio', async () => {
    render(<OmnichannelChatPanel conversation={conversation} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'enviar audio' }));

    await waitFor(() => expect(h.uploadAudio).toHaveBeenCalledTimes(1));
    const [contactId, blob] = h.uploadAudio.mock.calls[0];
    expect(contactId).toBe('c1');
    expect(blob).toBeInstanceOf(Blob);
    await waitFor(() =>
      expect(h.sendMessageToContact).toHaveBeenCalledWith('c1', '[Áudio]', 'audio', 'https://cdn/audio-1.ogg'),
    );
  });

  it('não engole falha de envio: o erro chega a quem chamou', async () => {
    h.sendMessageToContact.mockRejectedValue(new Error('offline'));
    render(<OmnichannelChatPanel conversation={conversation} onClose={() => {}} />);
    await screen.findByTestId('chat-panel');

    const onSendMessage = h.lastProps?.onSendMessage as (c: string) => Promise<void>;
    await expect(onSendMessage('perdida')).rejects.toThrow('offline');
  });

  it('fecha o painel embutido pelo retorno (onClose)', async () => {
    const onClose = vi.fn();
    render(<OmnichannelChatPanel conversation={conversation} onClose={onClose} />);
    fireEvent.click(await screen.findByRole('button', { name: 'back' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
