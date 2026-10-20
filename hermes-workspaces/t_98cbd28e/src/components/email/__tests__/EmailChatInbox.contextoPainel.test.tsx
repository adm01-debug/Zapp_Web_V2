/**
 * R2-COM-001 — a conversa de Email entrava em ciclo de atualização ao repassar
 * o contexto (mensagens + anexos) ao painel de detalhes.
 *
 * Cadeia real montada aqui: EmailChatInbox → EmailChatThread → useEffect(onContextDataChange)
 * → setThreadContext → novo render do pai. O pai entregava uma arrow inline (identidade nova
 * a cada render) e o efeito do filho dependia dela; o filho emitia a cada render do pai,
 * gravava um objeto novo no estado do pai, e o ciclo fechava mesmo com mensagens e anexos
 * estáveis.
 *
 * O ciclo é observado por um teto de renderizações: o detector transforma um loop infinito
 * (que travaria a suíte) numa falha determinística com a contagem medida.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardRef, type ReactNode } from 'react';
import type { EmailAttachment, EmailMessage, EmailThread } from '@/hooks/integrations/useGmail';

const THREAD: EmailThread = {
  id: 'thread-1', gmail_account_id: 'account-1', gmail_thread_id: 'gmail-thread-1', contact_id: null,
  subject: 'Assunto real', snippet: 'Prévia', label_ids: ['INBOX'], message_count: 1, is_unread: false,
  is_starred: false, is_important: false, last_message_at: '2026-10-02T12:00:00Z', last_from_name: 'Cliente',
  last_from_address: 'cliente@example.com', assigned_to: null, status: 'open', priority: 'medium', tags: [],
  created_at: '2026-10-02T12:00:00Z', updated_at: '2026-10-02T12:00:00Z',
};

const MESSAGE: EmailMessage = {
  id: 'msg-1', thread_id: 'thread-1', gmail_message_id: 'gmail-msg-1', gmail_account_id: 'account-1',
  from_address: 'cliente@example.com', from_name: 'Cliente', to_addresses: ['admin@example.com'], cc_addresses: [],
  bcc_addresses: [], reply_to_address: null, subject: 'Assunto real', body_text: 'corpo', body_html: '<p>corpo</p>',
  snippet: 'corpo', label_ids: ['INBOX'], is_read: true, is_starred: false, has_attachments: false,
  in_reply_to: null, references_header: null, internal_date: '2026-10-02T12:00:00Z', direction: 'inbound',
  created_at: '2026-10-02T12:00:00Z',
};

const ATTACHMENT: EmailAttachment = {
  id: 'att-1', email_message_id: 'msg-1', gmail_attachment_id: 'gmail-att-1', filename: 'proposta.pdf',
  mime_type: 'application/pdf', size_bytes: 1024, created_at: '2026-10-02T12:00:00Z',
};

const counters = vi.hoisted(() => ({ inboxRenders: 0, budget: 30 }));

const state = vi.hoisted(() => ({
  accounts: [{ id: 'account-1', email_address: 'admin@example.com', is_active: true }],
  activeAccount: { id: 'account-1', email_address: 'admin@example.com', is_active: true },
  threads: [] as EmailThread[],
  messages: [] as EmailMessage[],
  attachments: [] as EmailAttachment[],
  labels: [] as Array<{ gmail_label_id: string; name: string; label_type: 'user' | 'system'; id: string }>,
  refetchAccounts: vi.fn(),
  connectGmail: { mutate: vi.fn(), isPending: false },
  syncInbox: { mutate: vi.fn(), isPending: false },
  syncLabels: { mutate: vi.fn(), isPending: false },
  downloadAttachment: { mutate: vi.fn(), isPending: false, variables: undefined },
  markAsRead: { mutate: vi.fn() },
  trashThread: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
  modifyThreadLabels: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
  setSelectedThreadId: vi.fn(),
  getAttachmentContent: vi.fn().mockResolvedValue(''),
  subscribeToThreads: vi.fn(() => () => {}),
}));

vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</> }));

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    accounts: state.accounts,
    accountsLoading: false,
    accountsError: null,
    refetchAccounts: state.refetchAccounts,
    activeAccount: state.activeAccount,
    connectGmail: state.connectGmail,
    threads: state.threads,
    threadsLoading: false,
    threadsError: null,
    requestedThread: null,
    labels: state.labels,
    unreadCount: 0,
    threadsTotalCount: state.threads.length,
    syncInbox: state.syncInbox,
    syncLabels: state.syncLabels,
    subscribeToThreads: state.subscribeToThreads,
    threadMessages: state.messages,
    messagesLoading: false,
    messagesError: null,
    threadAttachments: state.attachments,
    markAsRead: state.markAsRead,
    trashThread: state.trashThread,
    modifyThreadLabels: state.modifyThreadLabels,
    downloadAttachment: state.downloadAttachment,
    getAttachmentContent: state.getAttachmentContent,
    setSelectedThreadId: state.setSelectedThreadId,
  }),
}));

vi.mock('../EmailThreadList', () => ({
  EmailThreadList: ({ threads, onSelectThread }: { threads: EmailThread[]; onSelectThread: (thread: EmailThread) => void }) => {
    counters.inboxRenders += 1;
    if (counters.inboxRenders > counters.budget) {
      throw new Error(`ciclo de atualização: EmailChatInbox renderizou ${counters.inboxRenders} vezes (teto ${counters.budget})`);
    }
    return (
      <div data-testid="thread-list">
        <button type="button" onClick={() => threads[0] && onSelectThread(threads[0])}>Selecionar primeira</button>
      </div>
    );
  },
}));

vi.mock('../EmailContactPanel', () => ({
  EmailContactPanel: ({ messages, attachments }: { messages?: unknown[]; attachments?: unknown[] }) => (
    <div data-testid="contact-panel" data-messages={messages?.length ?? 0} data-attachments={attachments?.length ?? 0} />
  ),
}));

vi.mock('../EmailChatBubble', () => ({ EmailChatBubble: ({ message }: { message: EmailMessage }) => <div data-testid={`bubble-${message.id}`} /> }));
vi.mock('../EmailChatReplyBar', () => ({ EmailChatReplyBar: () => <div data-testid="reply-bar" /> }));
vi.mock('../EmailAttachmentPreviewDialog', () => ({ EmailAttachmentPreviewDialog: () => null }));
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

import { EmailChatInbox } from '../EmailChatInbox';

describe('EmailChatInbox — contexto da conversa repassado ao painel (R2-COM-001)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?view=email-chat');
    counters.inboxRenders = 0;
    state.threads = [];
    state.messages = [];
    state.attachments = [];
    state.labels = [];
    // Layout largo: o painel de detalhes fica no aside (sem drawer), recebendo o contexto.
    window.matchMedia = ((query: string) => ({
      matches: query.includes('1280px'), media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('estabiliza o repasse de contexto: mesma conversa, mensagens estáveis e anexo posterior', () => {
    state.threads = [THREAD];
    state.messages = [MESSAGE];
    render(<EmailChatInbox />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar primeira' }));
    expect(screen.getByTestId('contact-panel')).toHaveAttribute('data-messages', '1');

    // Re-render do pai sem dado novo: um render por tecla, sem emissão extra do filho.
    const base = counters.inboxRenders;
    const busca = screen.getByLabelText('Busca global do Email');
    fireEvent.change(busca, { target: { value: 'p' } });
    fireEvent.change(busca, { target: { value: 'pr' } });
    fireEvent.change(busca, { target: { value: 'pro' } });
    expect(counters.inboxRenders - base).toBe(3);

    // Anexo chega depois: o painel recebe e a contagem volta a estabilizar.
    state.attachments = [ATTACHMENT];
    fireEvent.change(busca, { target: { value: 'prop' } });
    const panel = screen.getByTestId('contact-panel');
    expect(panel).toHaveAttribute('data-messages', '1');
    expect(panel).toHaveAttribute('data-attachments', '1');
    const aposAnexo = counters.inboxRenders;
    fireEvent.change(busca, { target: { value: 'propo' } });
    expect(counters.inboxRenders - aposAnexo).toBe(1);
  });
});
