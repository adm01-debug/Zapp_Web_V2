import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef, type ReactNode } from 'react';
import type { EmailThread, EmailMessage, EmailAttachment } from '@/hooks/integrations/useGmail';

/**
 * R2-COM-002 (#284) — a prévia de anexo recebia o conteúdo de uma seleção anterior.
 *
 * A seleção (`previewAttachment`) e os bytes (`previewContent`) são dois estados; a
 * continuação assíncrona de `getAttachmentContent` gravava os bytes sem conferir se o
 * anexo ainda era o selecionado. Abrir A, depois B, e receber a resposta de A depois da
 * de B deixava o título de B com os bytes de A (e o erro tardio de A fechava B).
 */
const mocks = vi.hoisted(() => ({
  threadMessages: [] as EmailMessage[],
  threadAttachments: [] as EmailAttachment[],
  getAttachmentContent: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    threadMessages: mocks.threadMessages,
    threadAttachments: mocks.threadAttachments,
    messagesLoading: false,
    messagesError: null,
    markAsRead: { mutate: vi.fn() },
    trashMessage: { mutate: vi.fn() },
    trashThread: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    modifyThreadLabels: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    downloadAttachment: { mutate: vi.fn(), isPending: false, variables: undefined },
    getAttachmentContent: mocks.getAttachmentContent,
    setSelectedThreadId: vi.fn(),
    activeAccount: { email_address: 'user@example.com', id: 'acc1' },
  }),
}));

// A bolha real só dispara `onPreviewAttachment`; o teste usa o botão dela para escolher
// o anexo, do mesmo jeito que a tela faz (o handler testado continua sendo o real).
vi.mock('../EmailChatBubble', () => ({
  EmailChatBubble: ({ message, attachments, onPreviewAttachment }: {
    message: EmailMessage;
    attachments: EmailAttachment[];
    onPreviewAttachment?: (attachment: EmailAttachment) => void;
  }) => (
    <div data-testid={`bubble-${message.id}`}>
      {attachments.map(attachment => (
        <button key={attachment.id} type="button" onClick={() => onPreviewAttachment?.(attachment)}>
          {`prévia ${attachment.filename}`}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../EmailChatReplyBar', () => ({ EmailChatReplyBar: () => <div data-testid="reply-bar" /> }));
vi.mock('@/components/gmail/EmailComposer', () => ({ EmailComposer: () => <div data-testid="composer" /> }));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ asChild: _, children }: { asChild?: boolean; children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: forwardRef<HTMLDivElement, { children: ReactNode }>(({ children }, ref) => (
    <div ref={ref}><div data-radix-scroll-area-viewport>{children}</div></div>
  )),
}));

import { EmailChatThread } from '../EmailChatThread';

const MOCK_THREAD: EmailThread = {
  id: 'thread1', gmail_account_id: 'acc1', gmail_thread_id: 'gmail-t1', subject: 'Test Subject',
  is_unread: false, is_starred: false, message_count: 1, tags: [], label_ids: [], snippet: '',
  contact_id: null, last_message_at: '2026-09-06T10:00:00Z', last_from_name: null,
  last_from_address: null, assigned_to: null, status: 'open', priority: 'medium',
  is_important: false, created_at: '2026-09-06T00:00:00Z', updated_at: '2026-09-06T00:00:00Z',
};

const MOCK_MSG: EmailMessage = {
  id: 'msg1', thread_id: 'thread1', gmail_message_id: 'gmail-m1', gmail_account_id: 'acc1',
  from_address: 'sender@example.com', from_name: 'Sender', to_addresses: ['user@example.com'],
  cc_addresses: [], bcc_addresses: [], reply_to_address: null, subject: 'Test Subject',
  body_text: 'body', body_html: '<p>body</p>', snippet: 'body snippet', label_ids: ['INBOX'],
  is_read: true, is_starred: false, has_attachments: true, in_reply_to: null,
  references_header: null, internal_date: '2026-09-06T10:00:00Z', direction: 'inbound',
  created_at: '2026-09-06T00:00:00Z',
};

const anexoTexto = (id: string, filename: string): EmailAttachment => ({
  id, email_message_id: 'msg1', gmail_attachment_id: `gmail-${id}`,
  filename, mime_type: 'text/plain', size_bytes: 3,
});

/** Resolvers das requisições de conteúdo, na ordem em que foram pedidas. */
function promessasPendentes() {
  const pendentes: Array<{ resolve: (value: string) => void; reject: (error: unknown) => void }> = [];
  mocks.getAttachmentContent.mockImplementation(
    () => new Promise<string>((resolve, reject) => { pendentes.push({ resolve, reject }); }),
  );
  return pendentes;
}

describe('EmailChatThread — prévia de anexo (R2-COM-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.threadMessages = [MOCK_MSG];
    mocks.threadAttachments = [];
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('mantém os bytes do anexo novo quando a resposta do anexo anterior chega depois (B→A)', async () => {
    const pendentes = promessasPendentes();
    mocks.threadAttachments = [anexoTexto('att-a', 'a.txt'), anexoTexto('att-b', 'b.txt')];

    render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);

    fireEvent.click(screen.getByText('prévia a.txt'));
    fireEvent.click(screen.getByText('prévia b.txt'));
    expect(mocks.getAttachmentContent).toHaveBeenCalledTimes(2);

    // B responde primeiro; A responde depois, fora de ordem.
    await act(async () => { pendentes[1].resolve('QkJC'); }); // "BBB"
    await waitFor(() => expect(screen.getByText('BBB')).toBeInTheDocument());

    await act(async () => { pendentes[0].resolve('QUFB'); }); // "AAA" — seleção anterior

    expect(screen.getByText('BBB')).toBeInTheDocument();
    expect(screen.queryByText('AAA')).toBeNull();
    expect(screen.getByText('b.txt')).toBeInTheDocument();
  });

  it('erro tardio do anexo anterior não fecha a prévia do anexo atual', async () => {
    const pendentes = promessasPendentes();
    mocks.threadAttachments = [anexoTexto('att-a', 'a.txt'), anexoTexto('att-b', 'b.txt')];

    render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);

    fireEvent.click(screen.getByText('prévia a.txt'));
    fireEvent.click(screen.getByText('prévia b.txt'));

    await act(async () => { pendentes[1].resolve('QkJC'); }); // "BBB"
    await waitFor(() => expect(screen.getByText('BBB')).toBeInTheDocument());

    await act(async () => { pendentes[0].reject(new Error('falha ao baixar A')); });

    expect(screen.getByText('BBB')).toBeInTheDocument();
    expect(screen.getByText('b.txt')).toBeInTheDocument();
    // O aviso é do anexo que falhou para quem o pediu; a prévia atual não leva o aviso de outro.
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('fechar a prévia invalida a requisição em voo e ela não contamina a seleção seguinte', async () => {
    const pendentes = promessasPendentes();
    mocks.threadAttachments = [anexoTexto('att-a', 'a.txt'), anexoTexto('att-b', 'b.txt')];

    render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);

    // Abre A e fecha antes de a resposta chegar: a requisição de A fica pendente.
    fireEvent.click(screen.getByText('prévia a.txt'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText('a.txt')).toBeNull());

    fireEvent.click(screen.getByText('prévia b.txt'));
    await waitFor(() => expect(screen.getByText('b.txt')).toBeInTheDocument());
    expect(mocks.getAttachmentContent).toHaveBeenCalledTimes(2);

    // A (seleção já fechada) responde depois; B tem de continuar com os bytes de B.
    await act(async () => { pendentes[0].resolve('QUFB'); }); // "AAA"
    expect(screen.queryByText('AAA')).toBeNull();
    expect(screen.getByText('b.txt')).toBeInTheDocument();

    await act(async () => { pendentes[1].resolve('QkJC'); }); // "BBB"
    await waitFor(() => expect(screen.getByText('BBB')).toBeInTheDocument());
    expect(screen.getByText('b.txt')).toBeInTheDocument();
  });

  it('falha da prévia atual avisa e fecha só depois do resultado', async () => {
    const pendentes = promessasPendentes();
    mocks.threadAttachments = [anexoTexto('att-a', 'a.txt')];

    render(<EmailChatThread thread={MOCK_THREAD} onBack={vi.fn()} />);

    fireEvent.click(screen.getByText('prévia a.txt'));
    await waitFor(() => expect(screen.getByText('a.txt')).toBeInTheDocument());
    expect(mocks.toastError).not.toHaveBeenCalled();

    await act(async () => { pendentes[0].reject(new Error('falha ao baixar A')); });

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('a.txt')).toBeNull();
  });
});
