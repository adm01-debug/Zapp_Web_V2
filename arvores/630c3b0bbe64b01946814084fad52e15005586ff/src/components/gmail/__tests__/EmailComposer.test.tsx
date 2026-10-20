import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailComposer } from '../EmailComposer';
import type { EmailAttachment, EmailMessage } from '@/hooks/integrations/useGmail';
import { emailDraftSessionKey, writeEmailDraftSession } from '@/lib/emailDraftSession';

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
    get: () => makeMotionEl('div'),
  }),
}));

const sendEmailMutateAsync = vi.fn().mockResolvedValue({});
const replyEmailMutateAsync = vi.fn().mockResolvedValue({});
const saveDraftMutateAsync = vi.fn().mockResolvedValue({ draft_id: 'draft-1' });
const deleteDraftMutateAsync = vi.fn().mockResolvedValue({});
const getAttachmentContent = vi.fn().mockResolvedValue('AQID');

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    sendEmail: { mutateAsync: sendEmailMutateAsync, isPending: false },
    replyEmail: { mutateAsync: replyEmailMutateAsync, isPending: false },
    saveDraft: { mutateAsync: saveDraftMutateAsync, isPending: false },
    deleteDraft: { mutateAsync: deleteDraftMutateAsync, isPending: false },
    getAttachmentContent,
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
    localStorage.clear();
    sendEmailMutateAsync.mockReset().mockResolvedValue({});
    replyEmailMutateAsync.mockReset().mockResolvedValue({});
    saveDraftMutateAsync.mockReset().mockResolvedValue({ draft_id: 'draft-1' });
    deleteDraftMutateAsync.mockClear();
    getAttachmentContent.mockClear();
  });

  afterEach(() => vi.useRealTimers());

  it('modo new: campo Para vazio e botão Enviar desabilitado', () => {
    render(<EmailComposer mode="new" onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('destinatario@email.com')).toHaveValue('');
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled();
  });

  it('restaura rascunho isolado da conta e sinaliza anexos que precisam ser selecionados novamente', () => {
    const key = emailDraftSessionKey({ accountId: 'acc-restore', mode: 'new' });
    writeEmailDraftSession(key, {
      draftId: 'draft-remote', to: 'cliente@example.com', cc: '', bcc: '', subject: 'Proposta restaurada',
      body: 'Conteúdo preservado', isUsingHtml: false, attachmentNames: ['proposta.pdf'], updatedAt: new Date().toISOString(),
    });

    render(<EmailComposer accountId="acc-restore" mode="new" onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText('destinatario@email.com')).toHaveValue('cliente@example.com');
    expect(screen.getByPlaceholderText('Assunto do email')).toHaveValue('Proposta restaurada');
    expect(screen.getByRole('textbox', { name: 'Mensagem' })).toHaveTextContent('Conteúdo preservado');
    expect(screen.getByRole('status')).toHaveTextContent('proposta.pdf');
  });

  it('remove a sessão local e o draft remoto ao confirmar descarte de conteúdo restaurado', async () => {
    const key = emailDraftSessionKey({ accountId: 'acc-discard', mode: 'new' });
    writeEmailDraftSession(key, {
      draftId: 'draft-remote', to: 'cliente@example.com', cc: '', bcc: '', subject: 'Descartar', body: 'Texto',
      isUsingHtml: false, attachmentNames: [], updatedAt: new Date().toISOString(),
    });
    render(<EmailComposer accountId="acc-discard" mode="new" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar rascunho' }));
    await waitFor(() => expect(deleteDraftMutateAsync).toHaveBeenCalledWith('draft-remote'));
    expect(localStorage.getItem(key!)).toBeNull();
  });

  it('mantém composição e rascunho local e avisa quando a exclusão remota é rejeitada', async () => {
    const key = emailDraftSessionKey({ accountId: 'acc-discard-reject', mode: 'new' });
    writeEmailDraftSession(key, {
      draftId: 'draft-remote', to: 'cliente@example.com', cc: '', bcc: '', subject: 'Não perder', body: 'Conteúdo preservado',
      isUsingHtml: false, attachmentNames: [], updatedAt: new Date().toISOString(),
    });
    deleteDraftMutateAsync.mockRejectedValueOnce(new Error('permission denied'));
    const onClose = vi.fn();
    render(<EmailComposer accountId="acc-discard-reject" mode="new" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar rascunho' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Rascunho remoto não descartado');
    expect(alert).toHaveTextContent('permission denied');
    expect(deleteDraftMutateAsync).toHaveBeenCalledWith('draft-remote');
    expect(onClose).not.toHaveBeenCalled();
    expect(localStorage.getItem(key!)).toContain('Não perder');
    expect(screen.getByPlaceholderText('Assunto do email')).toHaveValue('Não perder');
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
    expect(screen.getByRole('textbox', { name: 'Mensagem' })).toHaveTextContent('Mensagem encaminhada');
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
    render(<EmailComposer mode="reply-all" replyTo={makeMessage()} threadId="thread-abc" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(replyEmailMutateAsync).toHaveBeenCalled());
  });

  it('Descartar chama onClose sem enviar', async () => {
    const onClose = vi.fn();
    render(<EmailComposer mode="new" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /descartar/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
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

  it('encaminha o anexo original selecionado com conteúdo autenticado', async () => {
    const attachment = {
      id: 'att-1', email_message_id: 'm1', gmail_attachment_id: 'gmail-att-1',
      filename: 'proposta.pdf', mime_type: 'application/pdf', size_bytes: 3,
      created_at: '2026-10-02T12:00:00Z', gmail_message_id: 'g1',
    } as EmailAttachment & { gmail_message_id: string };
    render(<EmailComposer mode="forward" replyTo={makeMessage()} forwardAttachments={[attachment]} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('destinatario@email.com'), { target: { value: 'dest@email.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(getAttachmentContent).toHaveBeenCalledWith(attachment));
    expect(sendEmailMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [{ filename: 'proposta.pdf', mimeType: 'application/pdf', content: 'AQID' }],
    }));
  });

  it('#286: inclui anexos originais que chegam depois da abertura do encaminhamento', async () => {
    const attachment = {
      id: 'att-late', email_message_id: 'm1', gmail_attachment_id: 'gmail-att-late',
      filename: 'contrato.pdf', mime_type: 'application/pdf', size_bytes: 3,
      created_at: '2026-10-02T12:00:00Z', gmail_message_id: 'g1',
    } as EmailAttachment & { gmail_message_id: string };

    const { rerender } = render(
      <EmailComposer mode="forward" replyTo={makeMessage({ has_attachments: true })} forwardAttachments={[]} onClose={vi.fn()} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Carregando anexos');

    // Os metadados do anexo chegam na segunda consulta do thread (useGmail: threadAttachments).
    rerender(
      <EmailComposer mode="forward" replyTo={makeMessage({ has_attachments: true })} forwardAttachments={[attachment]} onClose={vi.fn()} />
    );

    expect(await screen.findByText('contrato.pdf')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('destinatario@email.com'), { target: { value: 'dest@email.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(getAttachmentContent).toHaveBeenCalledWith(attachment));
    expect(sendEmailMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [{ filename: 'contrato.pdf', mimeType: 'application/pdf', content: 'AQID' }],
    }));
  });

  it('#286: preserva a remoção explícita do anexo original quando novos anexos chegam depois', async () => {
    const first = {
      id: 'att-1', email_message_id: 'm1', gmail_attachment_id: 'gmail-att-1',
      filename: 'proposta.pdf', mime_type: 'application/pdf', size_bytes: 3,
      created_at: '2026-10-02T12:00:00Z', gmail_message_id: 'g1',
    } as EmailAttachment & { gmail_message_id: string };
    const second = {
      id: 'att-2', email_message_id: 'm1', gmail_attachment_id: 'gmail-att-2',
      filename: 'contrato.pdf', mime_type: 'application/pdf', size_bytes: 3,
      created_at: '2026-10-02T12:00:00Z', gmail_message_id: 'g1',
    } as EmailAttachment & { gmail_message_id: string };

    const { rerender } = render(
      <EmailComposer mode="forward" replyTo={makeMessage({ has_attachments: true })} forwardAttachments={[first]} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remover proposta.pdf' }));
    expect(screen.queryByText('proposta.pdf')).not.toBeInTheDocument();

    rerender(
      <EmailComposer mode="forward" replyTo={makeMessage({ has_attachments: true })} forwardAttachments={[first, second]} onClose={vi.fn()} />
    );

    expect(await screen.findByText('contrato.pdf')).toBeInTheDocument();
    expect(screen.queryByText('proposta.pdf')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('destinatario@email.com'), { target: { value: 'dest@email.com' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(getAttachmentContent).toHaveBeenCalledWith(second));
    expect(getAttachmentContent).not.toHaveBeenCalledWith(first);
  });

  it('bloqueia duplo clique desde o início da preparação do envio', async () => {
    sendEmailMutateAsync.mockImplementation(() => new Promise(() => undefined));
    render(<EmailComposer mode="new" defaultTo="dest@email.com" onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Assunto do email'), { target: { value: 'Envio único' } });
    const send = screen.getByRole('button', { name: /enviar/i });
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(sendEmailMutateAsync).toHaveBeenCalledTimes(1));
  });

  it('preserva o rascunho e orienta conferir Enviados quando o resultado é inconclusivo', async () => {
    sendEmailMutateAsync.mockRejectedValueOnce({ name: 'FunctionsFetchError', message: 'Failed to fetch' });
    const onClose = vi.fn();
    render(<EmailComposer accountId="acc-outcome" mode="new" defaultTo="dest@email.com" onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('Assunto do email'), { target: { value: 'Envio incerto' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Resultado do envio não confirmado');
    expect(screen.getByRole('alert')).toHaveTextContent('Confira a pasta Enviados');
    expect(onClose).not.toHaveBeenCalled();
    expect(localStorage.getItem(emailDraftSessionKey({ accountId: 'acc-outcome', mode: 'new' })!)).toContain('Envio incerto');
  });

  it('serializa autosaves e atualiza o mesmo draft quando respostas chegam fora de ordem', async () => {
    vi.useFakeTimers();
    let resolveFirst: (value: { draft_id: string }) => void = () => undefined;
    saveDraftMutateAsync
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ draft_id: 'draft-1' });

    render(<EmailComposer mode="new" defaultTo="dest@email.com" onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Assunto do email'), { target: { value: 'Versão 1' } });
    await act(async () => { vi.advanceTimersByTime(1200); await Promise.resolve(); });
    expect(saveDraftMutateAsync).toHaveBeenCalledTimes(1);
    expect(saveDraftMutateAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({ draft_id: undefined, subject: 'Versão 1' }));

    fireEvent.change(screen.getByPlaceholderText('Assunto do email'), { target: { value: 'Versão 2' } });
    await act(async () => { vi.advanceTimersByTime(1200); await Promise.resolve(); });
    expect(saveDraftMutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => { resolveFirst({ draft_id: 'draft-1' }); await Promise.resolve(); await Promise.resolve(); });
    expect(saveDraftMutateAsync).toHaveBeenCalledTimes(2);
    expect(saveDraftMutateAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({ draft_id: 'draft-1', subject: 'Versão 2' }));
  });
});
