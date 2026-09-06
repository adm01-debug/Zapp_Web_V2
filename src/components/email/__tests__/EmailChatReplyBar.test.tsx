import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EmailMessage } from '@/hooks/integrations/useGmail';

const { sendMutateAsync, replyMutateAsync } = vi.hoisted(() => ({
  sendMutateAsync: vi.fn().mockResolvedValue({}),
  replyMutateAsync: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    sendEmail: { mutateAsync: sendMutateAsync, isPending: false },
    replyEmail: { mutateAsync: replyMutateAsync, isPending: false },
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
  DropdownMenuContent: ({ children }: any) => <div data-testid="dd-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}));

import { EmailChatReplyBar } from '../EmailChatReplyBar';
import { toast } from 'sonner';

const INBOUND_MSG: EmailMessage = {
  id: 'msg1',
  thread_id: 'thread1',
  gmail_message_id: 'gmail-msg1',
  gmail_account_id: 'acc1',
  from_address: 'sender@example.com',
  from_name: 'Sender',
  to_addresses: ['user@example.com'],
  cc_addresses: ['cc@example.com'],
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

const OUTBOUND_MSG: EmailMessage = {
  ...INBOUND_MSG,
  id: 'msg2',
  direction: 'outbound',
};

const defaultProps = {
  threadId: 'gmail-thread-1',
  lastMessage: INBOUND_MSG,
  accountEmail: 'user@example.com',
  mode: 'reply' as const,
  onModeChange: vi.fn(),
  onSent: vi.fn(),
};

function renderBar(props: Partial<typeof defaultProps> = {}) {
  return render(<EmailChatReplyBar {...defaultProps} {...props} />);
}

describe('EmailChatReplyBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMutateAsync.mockResolvedValue({});
    replyMutateAsync.mockResolvedValue({});
  });

  describe('resolvedTo display', () => {
    it('reply inbound: mostra from_address no "para:"', () => {
      renderBar({ mode: 'reply' });
      expect(screen.getByText(/para:/)).toBeDefined();
      expect(screen.getByText(/sender@example\.com/)).toBeDefined();
    });

    it('reply outbound: mostra to_addresses[0] no "para:"', () => {
      renderBar({ mode: 'reply', lastMessage: OUTBOUND_MSG });
      const span = screen.getByText(/para:/);
      expect(span.textContent).toContain('user@example.com');
    });

    it('reply-all inbound: inclui from e cc, exclui accountEmail', () => {
      renderBar({ mode: 'reply-all' });
      const span = screen.getByText(/para:/);
      expect(span.textContent).toContain('sender@example.com');
      expect(span.textContent).toContain('cc@example.com');
      expect(span.textContent).not.toContain('user@example.com');
    });

    it('forward: exibe Input para destinatário', () => {
      const { container } = renderBar({ mode: 'forward' });
      const toInput = container.querySelector('input[placeholder="email@destinatario.com"]');
      expect(toInput).not.toBeNull();
    });
  });

  describe('handleSend', () => {
    it('corpo vazio sem anexos: não chama nenhuma mutation', () => {
      renderBar();
      const textarea = screen.getByPlaceholderText('Digite sua resposta...');
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      expect(replyMutateAsync).not.toHaveBeenCalled();
      expect(sendMutateAsync).not.toHaveBeenCalled();
    });

    it('reply: chama replyEmail.mutateAsync com thread_id e message_id corretos', async () => {
      renderBar();
      const textarea = screen.getByPlaceholderText('Digite sua resposta...');
      fireEvent.change(textarea, { target: { value: 'Olá!' } });
      fireEvent.click(screen.getByRole('button', { name: /Enviar/i }));
      await waitFor(() =>
        expect(replyMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            thread_id: 'gmail-thread-1',
            message_id: 'gmail-msg1',
            to: 'sender@example.com',
            text_body: 'Olá!',
          }),
        ),
      );
    });

    it('forward: chama sendEmail com subject "Fwd: ..."', async () => {
      const { container } = renderBar({ mode: 'forward' });
      const toInput = container.querySelector('input[placeholder="email@destinatario.com"]') as HTMLInputElement;
      fireEvent.change(toInput, { target: { value: 'fwd@example.com' } });
      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'Encaminhando' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      await waitFor(() =>
        expect(sendMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'fwd@example.com',
            subject: 'Fwd: Test Subject',
          }),
        ),
      );
    });

    it('forward sem destinatário: toast.error "Informe o destinatário"', async () => {
      renderBar({ mode: 'forward' });
      const textarea = screen.getByPlaceholderText('Adicione uma mensagem...');
      fireEvent.change(textarea, { target: { value: 'Mensagem sem destino' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      await waitFor(() =>
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Informe o destinatário'),
      );
    });

    it('mode=new sem assunto: toast.error "Informe o assunto do e-mail"', async () => {
      renderBar({ mode: 'new' });
      const textarea = screen.getByPlaceholderText('Digite sua resposta...');
      fireEvent.change(textarea, { target: { value: 'Nova mensagem' } });
      fireEvent.click(screen.getByRole('button', { name: /Enviar/i }));
      await waitFor(() =>
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Informe o assunto do e-mail'),
      );
    });

    it('onSent chamado após envio bem-sucedido', async () => {
      const onSent = vi.fn();
      renderBar({ onSent });
      const textarea = screen.getByPlaceholderText('Digite sua resposta...');
      fireEvent.change(textarea, { target: { value: 'Resposta' } });
      fireEvent.click(screen.getByRole('button', { name: /Enviar/i }));
      await waitFor(() => expect(onSent).toHaveBeenCalled());
    });
  });

  describe('handleKeyDown', () => {
    it('Enter sem Shift: envia a mensagem', async () => {
      renderBar();
      const textarea = screen.getByPlaceholderText('Digite sua resposta...');
      fireEvent.change(textarea, { target: { value: 'Enter test' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      await waitFor(() => expect(replyMutateAsync).toHaveBeenCalled());
    });

    it('Shift+Enter: não envia', async () => {
      renderBar();
      const textarea = screen.getByPlaceholderText('Digite sua resposta...');
      fireEvent.change(textarea, { target: { value: 'Draft' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
      expect(replyMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('handleAddFiles', () => {
    function getFileInput(container: HTMLElement) {
      return container.querySelector('input[type="file"]') as HTMLInputElement;
    }

    function makeFile(name: string, sizeBytes: number, type = 'text/plain') {
      const f = new File(['x'], name, { type });
      Object.defineProperty(f, 'size', { value: sizeBytes });
      return f;
    }

    it('arquivo > 25 MB: toast.error "Tamanho total dos anexos excede 25MB"', () => {
      const { container } = renderBar();
      const fileInput = getFileInput(container);
      fireEvent.change(fileInput, {
        target: { files: [makeFile('big.bin', 26 * 1024 * 1024)] },
      });
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Tamanho total dos anexos excede 25MB');
    });

    it('arquivo válido: exibe nome na lista de anexos', () => {
      const { container } = renderBar();
      const fileInput = getFileInput(container);
      const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [file] } });
      expect(screen.getByText('doc.pdf')).toBeDefined();
    });

    it('remover anexo: remove da lista', () => {
      const { container } = renderBar();
      const fileInput = getFileInput(container);
      const file = new File(['data'], 'report.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [file] } });
      expect(screen.getByText('report.pdf')).toBeDefined();
      fireEvent.click(screen.getByLabelText('Remover report.pdf'));
      expect(screen.queryByText('report.pdf')).toBeNull();
    });
  });
});
