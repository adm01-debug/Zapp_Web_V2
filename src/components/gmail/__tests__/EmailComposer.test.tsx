import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailComposer } from '../EmailComposer';
import type { EmailMessage } from '@/hooks/integrations/useGmail';

const ANIMATION_PROPS = new Set(['initial', 'animate', 'exit', 'whileHover', 'whileTap', 'variants', 'transition', 'layout']);
function makeMotionEl(tag: string) {
  return function MotionEl({ children, ...props }: Record<string, unknown>) {
    const safeProps = Object.fromEntries(Object.entries(props).filter(([k]) => !ANIMATION_PROPS.has(k)));
    return createElement(tag, safeProps, children as React.ReactNode);
  };
}
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_t: unknown, prop: string) => prop === 'div' ? makeMotionEl('div') : makeMotionEl('div'),
  }),
}));

const sendEmailMutateAsync = vi.fn().mockResolvedValue({});
const replyEmailMutateAsync = vi.fn().mockResolvedValue({});

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    sendEmail: { mutateAsync: sendEmailMutateAsync, isPending: false },
    replyEmail: { mutateAsync: replyEmailMutateAsync, isPending: false },
    activeAccount: { email_address: 'eu@promobrindes.com.br' },
  }),
}));

function makeMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'm1', thread_id: 't1', gmail_message_id: 'g1', gmail_account_id: 'a1',
    from_address: 'cliente@exemplo.com', from_name: 'Cliente Exemplo',
    to_addresses: ['eu@promobrindes.com.br'], cc_addresses: [], bcc_addresses: [],
    reply_to_address: null, subject: 'Orçamento', body_text: 'Texto original.',
    body_html: '', snippet: '', label_ids: [], is_read: true, is_starred: false,
    has_attachments: false, direction: 'inbound',
    internal_date: '2026-09-04T11:00:00-03:00',
    ...overrides,
  } as EmailMessage;
}

describe('EmailComposer — inicialização e comportamento de envio', () => {
  beforeEach(() => {
    sendEmailMutateAsync.mockClear();
    replyEmailMutateAsync.mockClear();
  });

  it('modo new: campo Para vazio e botão Enviar desabilitado', () => {
    render(<EmailComposer mode="new" onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('destinatario@email.com')).toHaveValue('');
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled();
  });

  it('modo reply (inbound): Para = from_address, assunto = "Re: Orçamento"', () => {
    render(<EmailComposer mode="reply" replyTo={makeMessage()} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('destinatario@email.com')).toHaveValue('cliente@exemplo.com');
    expect(screen.getByPlaceholderText('Assunto do email')).toHaveValue('Re: Orçamento');
  });

  it('assunto já prefixado com "Re:" não duplica o prefixo', () => {
    render(<EmailComposer mode="reply" replyTo={makeMessage({ subject: 'Re: Orçamento' })} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('Assunto do email')).toHaveValue('Re: Orçamento');
  });

  it('modo forward: assunto = "Fwd: Orçamento", corpo inclui header de encaminhamento', () => {
    render(<EmailComposer mode="forward" replyTo={makeMessage()} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('Assunto do email')).toHaveValue('Fwd: Orçamento');
    expect((screen.getByPlaceholderText('Escreva sua mensagem...') as HTMLTextAreaElement).value).toContain('Mensagem encaminhada');
  });

  it('modo reply-all (inbound): Para inclui from + to exceto conta ativa; Cc inclui cc_addresses', () => {
    const msg = makeMessage({
      to_addresses: ['eu@promobrindes.com.br', 'copia@email.com'],
      cc_addresses: ['cc@email.com'],
    });
    render(<EmailComposer mode="reply-all" replyTo={msg} onClose={vi.fn()} />);
    const paraInput = screen.getByPlaceholderText('destinatario@email.com') as HTMLInputElement;
    expect(paraInput.value).toContain('cliente@exemplo.com');
    expect(paraInput.value).toContain('copia@email.com');
    expect(paraInput.value).not.toContain('eu@promobrindes.com.br');
  });

  it('botão Enviar desabilitado quando assunto vazio (Para preenchido)', () => {
    render(<EmailComposer mode="new" defaultTo="dest@email.com" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled();
  });

  it('modo new: handleSend chama sendEmail.mutateAsync e dispara onSent e onClose', async () => {
    const onClose = vi.fn();
    const onSent = vi.fn();
    render(<EmailComposer mode="new" defaultTo="dest@email.com" onClose={onClose} onSent={onSent} />);
    fireEvent.change(screen.getByPlaceholderText('Assunto do email'), { target: { value: 'Teste envio' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(sendEmailMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['dest@email.com'], subject: 'Teste envio' })
    ));
    expect(onSent).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(replyEmailMutateAsync).not.toHaveBeenCalled();
  });

  it('modo reply: handleSend chama replyEmail.mutateAsync com thread_id', async () => {
    const onClose = vi.fn();
    render(<EmailComposer mode="reply" replyTo={makeMessage()} threadId="thread-abc" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(replyEmailMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ thread_id: 'thread-abc', to: ['cliente@exemplo.com'] })
    ));
    expect(sendEmailMutateAsync).not.toHaveBeenCalled();
  });

  it('modo reply-all: handleSend chama replyEmail.mutateAsync', async () => {
    const onClose = vi.fn();
    render(<EmailComposer mode="reply-all" replyTo={makeMessage()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(replyEmailMutateAsync).toHaveBeenCalled());
  });

  it('Descartar chama onClose sem enviar', () => {
    const onClose = vi.fn();
    render(<EmailComposer mode="new" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /descartar/i }));
    expect(onClose).toHaveBeenCalled();
    expect(sendEmailMutateAsync).not.toHaveBeenCalled();
  });

  it('Cc/Bcc toggle: campos ocultos por padrão, visíveis após clique', () => {
    render(<EmailComposer mode="new" onClose={vi.fn()} />);
    expect(screen.queryByText('Cc:')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cc\/bcc/i }));
    expect(screen.getByText('Cc:')).toBeInTheDocument();
  });

  it('Cc/Bcc já expandido quando cc vem preenchido (reply-all com cc_addresses)', () => {
    const msg = makeMessage({ cc_addresses: ['cc@email.com'] });
    render(<EmailComposer mode="reply-all" replyTo={msg} onClose={vi.fn()} />);
    expect(screen.getByText('Cc:')).toBeInTheDocument();
  });

  it('modo forward: handleSend chama sendEmail.mutateAsync (não replyEmail)', async () => {
    const onClose = vi.fn();
    render(<EmailComposer mode="forward" replyTo={makeMessage()} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('destinatario@email.com'), { target: { value: 'dest@email.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(sendEmailMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['dest@email.com'], subject: 'Fwd: Orçamento' })
    ));
    expect(replyEmailMutateAsync).not.toHaveBeenCalled();
  });
});
