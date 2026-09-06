import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailThreadView } from '../EmailThreadView';
import type { EmailThread, EmailMessage } from '@/hooks/integrations/useGmail';

const ANIMATION_PROPS = new Set(['initial', 'animate', 'exit', 'whileHover', 'whileTap', 'variants', 'transition', 'layout']);
function makeMotionEl(tag: string) {
  return function MotionEl({ children, ...props }: Record<string, unknown>) {
    const safe = Object.fromEntries(Object.entries(props).filter(([k]) => !ANIMATION_PROPS.has(k)));
    return createElement(tag, safe, children as React.ReactNode);
  };
}
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: (_t, prop: string) => makeMotionEl(prop === 'button' ? 'button' : 'div') }),
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
  AvatarFallback: ({ children, className }: { children: ReactNode; className?: string }) => <span className={className}>{children}</span>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) => asChild ? <>{children}</> : <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/GenericEmptyState', () => ({
  GenericEmptyState: ({ title }: { title: ReactNode }) => <div data-testid="empty-state">{title}</div>,
}));

vi.mock('@/components/gmail/EmailComposer', () => ({
  EmailComposer: ({ mode, onClose }: { mode?: string; onClose?: () => void }) => (
    <div data-testid="composer" data-mode={mode}>
      <button onClick={onClose}>Fechar compositor</button>
    </div>
  ),
}));

vi.mock('@/lib/emailHtml', () => ({
  sanitizeEmailHtml: (html: string) => html,
}));

vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  Trash2: () => <span data-testid="icon-trash" />,
  Archive: () => <span data-testid="icon-archive" />,
  Loader2: () => <div data-testid="loader" />,
  Reply: () => null,
  ReplyAll: () => null,
  Forward: () => null,
  Star: () => null,
  Paperclip: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  MoreHorizontal: () => null,
  Mail: () => null,
  MailOpen: () => null,
  Tag: () => null,
  Clock: () => null,
}));

const setSelectedThreadId = vi.fn();
const markAsReadMutate = vi.fn();
const trashMessageMutate = vi.fn();

const config: {
  threadMessages: EmailMessage[];
  messagesLoading: boolean;
} = {
  threadMessages: [],
  messagesLoading: false,
};

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    threadMessages: config.threadMessages,
    messagesLoading: config.messagesLoading,
    markAsRead: { mutate: markAsReadMutate },
    trashMessage: { mutate: trashMessageMutate },
    setSelectedThreadId,
  }),
}));

function makeThread(overrides: Partial<EmailThread> = {}): EmailThread {
  return {
    id: 'th1',
    gmail_thread_id: 'gt1',
    gmail_account_id: 'a1',
    subject: 'Assunto de teste',
    snippet: '',
    label_ids: [],
    is_unread: false,
    is_starred: false,
    is_important: false,
    message_count: 1,
    last_message_at: '2026-09-05T10:00:00-03:00',
    last_from_name: null,
    last_from_address: 'remetente@exemplo.com',
    contact: null,
    tags: [],
    status: 'open',
    ...overrides,
  } as EmailThread;
}

function makeMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'm1',
    thread_id: 'th1',
    gmail_message_id: 'gm1',
    gmail_account_id: 'a1',
    from_address: 'remetente@exemplo.com',
    from_name: 'Remetente Teste',
    to_addresses: ['eu@empresa.com'],
    cc_addresses: [],
    bcc_addresses: [],
    reply_to_address: null,
    subject: 'Assunto',
    body_text: 'Corpo do email',
    body_html: '',
    snippet: 'Trecho',
    label_ids: [],
    is_read: true,
    is_starred: false,
    has_attachments: false,
    direction: 'inbound',
    internal_date: '2026-09-05T10:00:00-03:00',
    ...overrides,
  } as EmailMessage;
}

describe('EmailThreadView', () => {
  beforeEach(() => {
    config.threadMessages = [];
    config.messagesLoading = false;
    setSelectedThreadId.mockClear();
    markAsReadMutate.mockClear();
    trashMessageMutate.mockClear();
  });

  it('chama setSelectedThreadId com thread.id no mount', () => {
    render(<EmailThreadView thread={makeThread()} onBack={vi.fn()} />);
    expect(setSelectedThreadId).toHaveBeenCalledWith('th1');
  });

  it('chama setSelectedThreadId(null) no unmount', () => {
    const { unmount } = render(<EmailThreadView thread={makeThread()} onBack={vi.fn()} />);
    unmount();
    expect(setSelectedThreadId).toHaveBeenCalledWith(null);
  });

  it('exibe o subject da thread no header', () => {
    render(<EmailThreadView thread={makeThread({ subject: 'Proposta Comercial' })} onBack={vi.fn()} />);
    expect(screen.getByText('Proposta Comercial')).toBeInTheDocument();
  });

  it('exibe "(Sem assunto)" quando subject vazio', () => {
    render(<EmailThreadView thread={makeThread({ subject: '' })} onBack={vi.fn()} />);
    expect(screen.getByText('(Sem assunto)')).toBeInTheDocument();
  });

  it('exibe loader enquanto messagesLoading=true', () => {
    config.messagesLoading = true;
    render(<EmailThreadView thread={makeThread()} onBack={vi.fn()} />);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('exibe estado vazio quando não há mensagens', () => {
    render(<EmailThreadView thread={makeThread()} onBack={vi.fn()} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renderiza mensagens da thread', () => {
    config.threadMessages = [makeMessage({ from_name: 'Remetente Teste' })];
    render(<EmailThreadView thread={makeThread()} onBack={vi.fn()} />);
    expect(screen.getByText('Remetente Teste')).toBeInTheDocument();
  });

  it('markAsRead chamado quando is_unread=true e há mensagens não lidas', async () => {
    config.threadMessages = [makeMessage({ is_read: false, gmail_message_id: 'gm-unread' })];
    render(<EmailThreadView thread={makeThread({ is_unread: true })} onBack={vi.fn()} />);
    await waitFor(() => expect(markAsReadMutate).toHaveBeenCalledWith(['gm-unread']));
  });

  it('markAsRead NÃO chamado quando is_unread=false', () => {
    config.threadMessages = [makeMessage({ is_read: false })];
    render(<EmailThreadView thread={makeThread({ is_unread: false })} onBack={vi.fn()} />);
    expect(markAsReadMutate).not.toHaveBeenCalled();
  });

  it('botão Responder abre o composer com mode=reply', async () => {
    config.threadMessages = [makeMessage()];
    render(<EmailThreadView thread={makeThread()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    await waitFor(() => {
      expect(screen.getByTestId('composer')).toBeInTheDocument();
      expect(screen.getByTestId('composer').getAttribute('data-mode')).toBe('reply');
    });
  });

  it('botão Encaminhar abre o composer com mode=forward', async () => {
    config.threadMessages = [makeMessage()];
    render(<EmailThreadView thread={makeThread()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Encaminhar' }));
    await waitFor(() => {
      expect(screen.getByTestId('composer').getAttribute('data-mode')).toBe('forward');
    });
  });

  it('botão Voltar chama onBack', () => {
    const onBack = vi.fn();
    render(<EmailThreadView thread={makeThread()} onBack={onBack} />);
    fireEvent.click(screen.getByTestId('icon-arrow-left').closest('button')!);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('botão Lixeira chama trashMessage.mutate com gmail_message_id da última mensagem', () => {
    config.threadMessages = [makeMessage({ gmail_message_id: 'gm-trash' })];
    render(<EmailThreadView thread={makeThread()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByTestId('icon-trash').closest('button')!);
    expect(trashMessageMutate).toHaveBeenCalledWith('gm-trash');
  });
});
