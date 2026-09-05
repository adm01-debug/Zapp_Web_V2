import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmailThreadView } from '../EmailThreadView';
import type { EmailThread, EmailMessage } from '@/hooks/integrations/useGmail';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: () => ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
  }),
}));

vi.mock('../EmailComposer', () => ({ EmailComposer: () => <div /> }));

const threadMessages: EmailMessage[] = [];

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    threadMessages,
    messagesLoading: false,
    markAsRead: { mutate: vi.fn() },
    trashMessage: { mutate: vi.fn() },
    setSelectedThreadId: vi.fn(),
  }),
}));

function makeMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'm1', thread_id: 't1', gmail_message_id: 'g1', gmail_account_id: 'a1',
    from_address: 'cliente@exemplo.com', from_name: 'Cliente Exemplo',
    to_addresses: ['eu@promobrindes.com.br'], cc_addresses: [], bcc_addresses: [],
    reply_to_address: null, subject: 'Orçamento', body_text: '', body_html: '',
    snippet: '', label_ids: [], is_read: true, is_starred: false,
    has_attachments: false, direction: 'inbound',
    internal_date: '2026-09-04T11:00:00-03:00',
    ...overrides,
  } as EmailMessage;
}

const thread = {
  id: 't1', gmail_thread_id: 'g1', subject: 'Orçamento', message_count: 1,
  is_unread: false, tags: [], contact: null,
} as unknown as EmailThread;

function renderWith(messages: EmailMessage[]) {
  threadMessages.length = 0;
  threadMessages.push(...messages);
  return render(<EmailThreadView thread={thread} onBack={() => {}} />);
}

describe('EmailThreadView — HTML como fonte visual padrão (Fase D, etapa 6/24)', () => {
  it('e-mail com body_html abre JÁ renderizado, sem exigir clique em "Ver HTML"', () => {
    renderWith([makeMessage({
      body_html: '<table style="width:600px"><tr><td>Conteúdo da tabela</td></tr></table>',
      body_text: 'Conteúdo da tabela',
    })]);
    expect(document.querySelector('.email-html-body')).not.toBeNull();
    expect(screen.getByText('Conteúdo da tabela')).toBeInTheDocument();
    // o toggle oferece o caminho inverso, não o de ida
    expect(screen.getByRole('button', { name: 'Ver texto simples' })).toBeInTheDocument();
  });

  it('e-mail só-texto continua em texto puro, sem container de HTML', () => {
    renderWith([makeMessage({ body_html: '', body_text: 'Mensagem simples.' })]);
    expect(document.querySelector('.email-html-body')).toBeNull();
    expect(screen.getByText('Mensagem simples.')).toBeInTheDocument();
  });

  it('toggle volta para texto puro e retorna ao HTML', () => {
    renderWith([makeMessage({ body_html: '<p>Versão HTML</p>', body_text: 'Versão texto' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Ver texto simples' }));
    expect(document.querySelector('.email-html-body')).toBeNull();
    expect(screen.getByText('Versão texto')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver HTML' }));
    expect(document.querySelector('.email-html-body')).not.toBeNull();
  });

  it('usa o pipeline único de sanitização (script removido, link endurecido)', () => {
    renderWith([makeMessage({
      body_html: '<p>ok</p><script>alert(1)</script><a href="https://x.com">link</a>',
    })]);
    const host = document.querySelector('.email-html-body');
    expect(host?.innerHTML).not.toContain('script');
    expect(host?.querySelector('a')?.getAttribute('rel')).toContain('noopener');
  });
});
