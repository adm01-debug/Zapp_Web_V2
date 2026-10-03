import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardRef, type ReactNode } from 'react';
import type { EmailThread, EmailMessage } from '@/hooks/integrations/useGmail';

const mocks = vi.hoisted(() => ({
  setSelectedThreadId: vi.fn(),
  markAsReadMutate: vi.fn(),
  trashThreadMutateAsync: vi.fn().mockResolvedValue({}),
  modifyThreadLabelsMutate: vi.fn(),
  modifyThreadLabelsMutateAsync: vi.fn().mockResolvedValue({}),
  threadMessages: [] as EmailMessage[],
  messagesLoading: false,
}));

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    threadMessages: mocks.threadMessages,
    threadAttachments: [],
    messagesLoading: mocks.messagesLoading,
    markAsRead: { mutate: mocks.markAsReadMutate },
    trashMessage: { mutate: vi.fn() },
    trashThread: { mutateAsync: mocks.trashThreadMutateAsync, isPending: false },
    modifyThreadLabels: { mutate: mocks.modifyThreadLabelsMutate, mutateAsync: mocks.modifyThreadLabelsMutateAsync, isPending: false },
    downloadAttachment: { mutate: vi.fn(), isPending: false, variables: undefined },
    setSelectedThreadId: mocks.setSelectedThreadId,
    activeAccount: { email_address: 'user@example.com', id: 'acc1' },
  }),
}));

vi.mock('../EmailChatBubble', () => ({
  EmailChatBubble: ({ message, onReply }: { message: EmailMessage; onReply?: (message: EmailMessage) => void }) => (
    <div data-testid={`bubble-${message.id}`}>{message.snippet}<button type="button" aria-label={`Responder ${message.id}`} onClick={() => onReply?.(message)}>Responder</button></div>
  ),
}));

vi.mock('../EmailChatReplyBar', () => ({
  EmailChatReplyBar: ({ lastMessage }: { lastMessage: EmailMessage | null }) => <div data-testid="reply-bar">{lastMessage?.id}</div>,
}));

vi.mock('@/components/gmail/EmailComposer', () => ({
  EmailComposer: () => <div data-testid="composer" />,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ asChild: _, children }: { asChild?: boolean; children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: forwardRef<HTMLDivElement, { children: ReactNode }>(({ children }, ref) => <div ref={ref}><div data-radix-scroll-area-viewport>{children}</div></div>),
}));

import { EmailChatThread } from '../EmailChatThread';

const MOCK_THREAD: EmailThread = {
  id: 'thread1',
  gmail_account_id: 'acc1',
  gmail_thread_id: 'gmail-t1',
  subject: 'Test Subject',
  is_unread: false,
  is_starred: false,
  message_count: 1,
  tags: [],
  label_ids: [],
  snippet: '',
  contact_id: null,
  last_message_at: '2026-09-06T10:00:00Z',
  last_from_name: null,
  last_from_address: null,
  assigned_to: null,
  status: 'open',
  priority: 'medium',
  is_important: false,
  created_at: '2026-09-06T00:00:00Z',
  updated_at: '2026-09-06T00:00:00Z',
};

const MOCK_MSG: EmailMessage = {
  id: 'msg1',
  thread_id: 'thread1',
  gmail_message_id: 'gmail-m1',
  gmail_account_id: 'acc1',
  from_address: 'sender@example.com',
  from_name: 'Sender',
  to_addresses: ['user@example.com'],
  cc_addresses: [],
  bcc_addresses: [],
  reply_to_address: null,
  subject: 'Test Subject',
  body_text: 'body',
  body_html: '<p>body</p>',
  snippet: 'body snippet',
  label_ids: ['INBOX'],
  is_read: false,
  is_starred: false,
  has_attachments: false,
  in_reply_to: null,
  references_header: null,
  internal_date: '2026-09-06T10:00:00Z',
  direction: 'inbound',
  created_at: '2026-09-06T00:00:00Z',
};

describe('EmailChatThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.threadMessages = [];
    mocks.messagesLoading = false;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    document.documentElement.classList.remove('reduced-motion');
  });

  it('preserva a leitura antiga, avisa sobre nova mensagem e desce sob comando', () => {
    mocks.threadMessages = [MOCK_MSG];
    const view = render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
    const viewport = view.container.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]')!;
    Object.defineProperties(viewport, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    fireEvent.scroll(viewport);
    const nextMessage = { ...MOCK_MSG, id: 'msg2', gmail_message_id: 'gmail-m2', internal_date: '2026-09-06T11:00:00Z' };
    mocks.threadMessages = [MOCK_MSG, nextMessage];
    view.rerender(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);

    const notice = screen.getByRole('button', { name: 'Novas mensagens' });
    expect(notice).toBeVisible();
    fireEvent.click(notice);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth' });
  });

  it('não usa rolagem animada quando movimento reduzido está ativo', () => {
    document.documentElement.classList.add('reduced-motion');
    mocks.threadMessages = [MOCK_MSG];
    render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' });
  });

  describe('lifecycle: setSelectedThreadId', () => {
    it('chama setSelectedThreadId(thread.id) ao montar', () => {
      render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
      expect(mocks.setSelectedThreadId).toHaveBeenCalledWith('thread1');
    });

    it('chama setSelectedThreadId(null) ao desmontar', () => {
      const { unmount } = render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
      vi.clearAllMocks();
      unmount();
      expect(mocks.setSelectedThreadId).toHaveBeenCalledWith(null);
    });
  });

  it('preserva a primeira mensagem como alvo quando a resposta parte do histórico', () => {
    const newest = { ...MOCK_MSG, id: 'msg2', gmail_message_id: 'gmail-m2', internal_date: '2026-09-06T11:00:00Z' };
    mocks.threadMessages = [MOCK_MSG, newest];
    render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
    expect(screen.getByTestId('reply-bar')).toHaveTextContent('msg2');
    fireEvent.click(screen.getByRole('button', { name: 'Responder msg1' }));
    expect(screen.getByTestId('reply-bar')).toHaveTextContent('msg1');
    expect(screen.getByText(/Respondendo à mensagem de Sender/)).toBeInTheDocument();
  });

  describe('header', () => {
    it('exibe assunto da thread', () => {
      render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
      expect(screen.getByText('Test Subject')).toBeDefined();
    });

    it('exibe "(Sem assunto)" quando subject vazio', () => {
      render(<EmailChatThread thread={{ ...MOCK_THREAD, subject: '' }} onBack={vi.fn()} />);
      expect(screen.getByText('(Sem assunto)')).toBeDefined();
    });

    it('botão Voltar chama onBack', () => {
      const onBack = vi.fn();
      render(<EmailChatThread thread={MOCK_THREAD} onBack={onBack} />);
      fireEvent.click(screen.getByLabelText('Voltar'));
      expect(onBack).toHaveBeenCalled();
    });

    it('showDetailsButton=true: renderiza botão Detalhes e chama onToggleDetails', () => {
      const onToggleDetails = vi.fn();
      render(
        <EmailChatThread
          thread={MOCK_THREAD}
          onBack={vi.fn()}
          showDetailsButton
          onToggleDetails={onToggleDetails}
        />,
      );
      const btn = screen.getByLabelText('Detalhes');
      expect(btn).toBeDefined();
      fireEvent.click(btn);
      expect(onToggleDetails).toHaveBeenCalled();
    });

    it('showDetailsButton=false: botão Detalhes ausente', () => {
      render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
      expect(screen.queryByLabelText('Detalhes')).toBeNull();
    });
  });

  describe('estados de mensagens', () => {
    it('loading: não exibe bolhas de mensagem', () => {
      mocks.messagesLoading = true;
      mocks.threadMessages = [MOCK_MSG];
      render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
      expect(screen.queryByTestId('bubble-msg1')).toBeNull();
    });

    it('vazio: exibe "Nenhuma mensagem"', () => {
      mocks.messagesLoading = false;
      mocks.threadMessages = [];
      render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
      expect(screen.getByText('Nenhuma mensagem')).toBeDefined();
    });

    it('mensagens carregadas: exibe bolha', () => {
      mocks.threadMessages = [MOCK_MSG];
      render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
      expect(screen.getByTestId('bubble-msg1')).toBeDefined();
    });
  });

  describe('markAsRead automático', () => {
    it('chama markAsRead quando thread não lida e há mensagens não lidas', () => {
      mocks.threadMessages = [MOCK_MSG]; // is_read: false
      render(<EmailChatThread thread={{ ...MOCK_THREAD, is_unread: true }} onBack={vi.fn()} />);
      expect(mocks.markAsReadMutate).toHaveBeenCalledWith(['gmail-m1']);
    });

    it('NÃO chama markAsRead quando thread já lida', () => {
      mocks.threadMessages = [MOCK_MSG];
      render(<EmailChatThread thread={{ ...MOCK_THREAD, is_unread: false }} onBack={vi.fn()} />);
      expect(mocks.markAsReadMutate).not.toHaveBeenCalled();
    });

    it('NÃO chama markAsRead quando não há mensagens', () => {
      mocks.threadMessages = [];
      render(<EmailChatThread thread={{ ...MOCK_THREAD, is_unread: true }} onBack={vi.fn()} />);
      expect(mocks.markAsReadMutate).not.toHaveBeenCalled();
    });
  });

  describe('ações de header', () => {
    it('Arquivar: modifica a thread inteira e só então volta', async () => {
      mocks.threadMessages = [MOCK_MSG];
      const onBack = vi.fn();
      render(<EmailChatThread thread={MOCK_THREAD} onBack={onBack} />);
      fireEvent.click(screen.getByLabelText('Arquivar'));
      expect(mocks.modifyThreadLabelsMutateAsync).toHaveBeenCalledWith({
        thread_id: 'gmail-t1',
        remove_labels: ['INBOX'],
      });
      await waitFor(() => expect(onBack).toHaveBeenCalled());
    });

    it('Mover para lixeira: chama trashThread com gmail_thread_id e só então volta', async () => {
      const onBack = vi.fn();
      render(<EmailChatThread thread={MOCK_THREAD} onBack={onBack} />);
      fireEvent.click(screen.getByLabelText('Mover para lixeira'));
      expect(mocks.trashThreadMutateAsync).toHaveBeenCalledWith('gmail-t1');
      await waitFor(() => expect(onBack).toHaveBeenCalled());
    });

    it('Restaurar: remove TRASH, adiciona INBOX e só então volta', async () => {
      const onBack = vi.fn();
      render(<EmailChatThread thread={{ ...MOCK_THREAD, label_ids: ['TRASH'] }} onBack={onBack} />);
      fireEvent.click(screen.getByLabelText('Restaurar da lixeira'));
      expect(mocks.modifyThreadLabelsMutateAsync).toHaveBeenCalledWith({
        thread_id: 'gmail-t1',
        add_labels: ['INBOX'],
        remove_labels: ['TRASH'],
      });
      await waitFor(() => expect(onBack).toHaveBeenCalled());
    });
  });

  describe('DateSeparator', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('mensagem de hoje: exibe "Hoje"', () => {
      mocks.threadMessages = [{ ...MOCK_MSG, internal_date: '2026-09-06T08:00:00Z' }];
      render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
      expect(screen.getByText('Hoje')).toBeDefined();
    });

    it('mensagem de ontem: exibe "Ontem"', () => {
      mocks.threadMessages = [{ ...MOCK_MSG, internal_date: '2026-09-05T08:00:00Z' }];
      render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
      expect(screen.getByText('Ontem')).toBeDefined();
    });

    it('mensagem antiga: exibe data por extenso em pt-BR', () => {
      mocks.threadMessages = [{ ...MOCK_MSG, internal_date: '2026-08-01T08:00:00Z' }];
      render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
      expect(screen.getByText('01 de agosto')).toBeDefined();
    });

    it('duas mensagens em dias diferentes: exibe dois separadores', () => {
      mocks.threadMessages = [
        { ...MOCK_MSG, id: 'msg1', internal_date: '2026-09-05T08:00:00Z' },
        { ...MOCK_MSG, id: 'msg2', internal_date: '2026-09-06T08:00:00Z' },
      ];
      render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);
      expect(screen.getByText('Ontem')).toBeDefined();
      expect(screen.getByText('Hoje')).toBeDefined();
    });
  });
});
