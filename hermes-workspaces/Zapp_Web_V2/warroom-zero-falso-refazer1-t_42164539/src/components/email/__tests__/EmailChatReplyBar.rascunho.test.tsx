import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { EmailMessage } from '@/hooks/integrations/useGmail';

const { sendMutateAsync, replyMutateAsync, gmailMock } = vi.hoisted(() => ({
  sendMutateAsync: vi.fn().mockResolvedValue({}),
  replyMutateAsync: vi.fn().mockResolvedValue({}),
  gmailMock: { userId: 'user-1' },
}));

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    sendEmail: { mutateAsync: sendMutateAsync, isPending: false },
    replyEmail: { mutateAsync: replyMutateAsync, isPending: false },
    activeAccount: {
      id: 'acc1',
      user_id: gmailMock.userId,
      email_address: 'user@example.com',
      is_active: true,
    },
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div data-testid="dd-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}));

import { EmailChatReplyBar } from '../EmailChatReplyBar';

const INBOUND_MSG: EmailMessage = {
  id: 'msg1',
  thread_id: 'thread1',
  gmail_message_id: 'gmail-msg1',
  gmail_account_id: 'acc1',
  from_address: 'sender@example.com',
  from_name: 'Sender',
  to_addresses: ['user@example.com'],
  cc_addresses: [],
  bcc_addresses: [],
  reply_to_address: null,
  subject: 'Test Subject',
  body_text: 'Original body',
  body_html: '<p>Original body</p>',
  snippet: 'Original body',
  label_ids: [],
  is_read: true,
  is_starred: false,
  has_attachments: false,
  in_reply_to: null,
  references_header: null,
  internal_date: '2026-09-06T10:00:00Z',
  direction: 'inbound',
  created_at: '2026-09-06T00:00:00Z',
};

function renderBar(threadId: string) {
  return render(
    <EmailChatReplyBar
      accountId="acc1"
      threadId={threadId}
      lastMessage={INBOUND_MSG}
      accountEmail="user@example.com"
      mode="reply"
      onModeChange={vi.fn()}
      onSent={vi.fn()}
    />,
  );
}

function bodyTextarea() {
  return screen.getByPlaceholderText('Digite sua resposta...') as HTMLTextAreaElement;
}

function draftKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('zapp-email-draft-v2')) keys.push(key);
  }
  return keys;
}

describe('EmailChatReplyBar — rascunho da resposta rápida', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    sendMutateAsync.mockResolvedValue({});
    replyMutateAsync.mockResolvedValue({});
    gmailMock.userId = 'user-1';
  });

  it('ida e volta entre duas threads restaura o rascunho de cada uma', () => {
    const mountA = renderBar('thread-A');
    fireEvent.change(bodyTextarea(), { target: { value: 'Rascunho da A' } });
    mountA.unmount();

    const mountB = renderBar('thread-B');
    expect(bodyTextarea().value).toBe('');
    fireEvent.change(bodyTextarea(), { target: { value: 'Rascunho da B' } });
    mountB.unmount();

    const mountA2 = renderBar('thread-A');
    expect(bodyTextarea().value).toBe('Rascunho da A');
    mountA2.unmount();

    renderBar('thread-B');
    expect(bodyTextarea().value).toBe('Rascunho da B');
  });

  it('isola o rascunho por usuário na mesma conta e thread', () => {
    const mountUser1 = renderBar('thread-A');
    fireEvent.change(bodyTextarea(), { target: { value: 'Rascunho do user-1' } });
    mountUser1.unmount();

    gmailMock.userId = 'user-2';
    const mountUser2 = renderBar('thread-A');
    expect(bodyTextarea().value).toBe('');
    mountUser2.unmount();

    gmailMock.userId = 'user-1';
    renderBar('thread-A');
    expect(bodyTextarea().value).toBe('Rascunho do user-1');
  });

  it('anexo local não volta: avisa que precisa ser anexado de novo', () => {
    const mountA = renderBar('thread-A');
    const fileInput = mountA.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'contrato.pdf', { type: 'application/pdf' })] },
    });
    expect(screen.getByLabelText('Remover contrato.pdf')).toBeDefined();
    mountA.unmount();

    renderBar('thread-A');
    expect(screen.queryByLabelText('Remover contrato.pdf')).toBeNull();
    const aviso = screen.getByRole('status');
    expect(aviso.textContent).toContain('contrato.pdf');
    expect(aviso.textContent).toContain('Anexe novamente');
  });

  it('envio confirmado limpa o rascunho persistido', async () => {
    const mountA = renderBar('thread-A');
    fireEvent.change(bodyTextarea(), { target: { value: 'Resposta que vai ser enviada' } });
    expect(draftKeys().length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Enviar/i }));
    await waitFor(() => expect(replyMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(draftKeys()).toHaveLength(0));
    mountA.unmount();

    renderBar('thread-A');
    expect(bodyTextarea().value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('mantém persistido o rascunho digitado durante o envio em voo', async () => {
    let resolver: (value: unknown) => void = () => {};
    replyMutateAsync.mockImplementationOnce(() => new Promise((resolve) => { resolver = resolve; }));
    renderBar('thread-A');

    fireEvent.change(bodyTextarea(), { target: { value: 'Resposta que vai ser enviada' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar/i }));
    await waitFor(() => expect(replyMutateAsync).toHaveBeenCalled());

    fireEvent.change(bodyTextarea(), { target: { value: 'Novo rascunho durante envio' } });
    await act(async () => { resolver({}); });

    await waitFor(() => expect(bodyTextarea().value).toBe('Novo rascunho durante envio'));
    await waitFor(() => {
      const keys = draftKeys();
      expect(keys).toHaveLength(1);
      const draft = JSON.parse(localStorage.getItem(keys[0]) as string);
      expect(draft.body).toBe('Novo rascunho durante envio');
    });
  });

  it('rascunho expirado (mais de 7 dias) não volta', () => {
    const mountA = renderBar('thread-A');
    fireEvent.change(bodyTextarea(), { target: { value: 'Rascunho antigo' } });
    mountA.unmount();

    const keys = draftKeys();
    expect(keys.length).toBeGreaterThan(0);
    const oitoDiasAtras = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    for (const key of keys) {
      const draft = JSON.parse(localStorage.getItem(key) as string);
      draft.updatedAt = oitoDiasAtras;
      localStorage.setItem(key, JSON.stringify(draft));
    }

    renderBar('thread-A');
    expect(bodyTextarea().value).toBe('');
  });
});
