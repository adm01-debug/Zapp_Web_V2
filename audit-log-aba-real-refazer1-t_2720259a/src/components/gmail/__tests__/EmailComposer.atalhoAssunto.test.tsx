/**
 * R2-COM-008 (#486) — o atalho do compositor (Ctrl/Cmd+Enter no editor) ignorava a
 * exigência de assunto aplicada ao botão Enviar: o botão ficava desabilitado com o
 * assunto vazio, mas o atalho chamava o mesmo `handleSend`, que só conferia o
 * destinatário. O teste renderiza o compositor REAL, digita no editor e dispara o
 * atalho de teclado — sem enviar email real (o hook do Gmail é mockado).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { EmailComposer } from '../EmailComposer';

const ANIMATION_PROPS = new Set(['initial', 'animate', 'exit', 'whileHover', 'whileTap', 'variants', 'transition', 'layout']);
function makeMotionEl(tag: string) {
  return function MotionEl({ children, ...props }: Record<string, unknown>) {
    const safeProps = Object.fromEntries(Object.entries(props).filter(([k]) => !ANIMATION_PROPS.has(k)));
    return createElement(tag, safeProps, children as React.ReactNode);
  };
}
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: () => makeMotionEl('div') }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const sendEmailMutateAsync = vi.fn().mockResolvedValue({});
const replyEmailMutateAsync = vi.fn().mockResolvedValue({});
const saveDraftMutateAsync = vi.fn().mockResolvedValue({ draft_id: 'draft-1' });

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    sendEmail: { mutateAsync: sendEmailMutateAsync, isPending: false },
    replyEmail: { mutateAsync: replyEmailMutateAsync, isPending: false },
    saveDraft: { mutateAsync: saveDraftMutateAsync, isPending: false },
    deleteDraft: { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    getAttachmentContent: vi.fn().mockResolvedValue('AQID'),
    activeAccount: { email_address: 'eu@promobrindes.com.br' },
  }),
}));

import { toast } from 'sonner';

describe('EmailComposer — atalho do compositor x exigência de assunto (R2-COM-008)', () => {
  beforeEach(() => {
    localStorage.clear();
    sendEmailMutateAsync.mockReset().mockResolvedValue({});
    replyEmailMutateAsync.mockReset().mockResolvedValue({});
    saveDraftMutateAsync.mockReset().mockResolvedValue({ draft_id: 'draft-1' });
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => vi.useRealTimers());

  it('Ctrl+Enter com assunto vazio não envia e avisa, igual ao botão desabilitado', async () => {
    const onClose = vi.fn();
    const onSent = vi.fn();
    render(<EmailComposer mode="new" defaultTo="dest@email.com" onClose={onClose} onSent={onSent} />);

    // O botão já exige assunto (contrato do botão).
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled();

    const editor = screen.getByRole('textbox', { name: 'Mensagem' });
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });

    // Deixa o handler assíncrono do envio terminar antes de conferir o resultado.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(sendEmailMutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Informe o assunto do e-mail');
    expect(onSent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Ctrl+Enter com assunto preenchido continua enviando (atalho preservado)', async () => {
    const onSent = vi.fn();
    render(<EmailComposer mode="new" defaultTo="dest@email.com" onClose={vi.fn()} onSent={onSent} />);

    fireEvent.change(screen.getByPlaceholderText('Assunto do email'), { target: { value: 'Teste atalho' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Mensagem' }), { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(sendEmailMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['dest@email.com'], subject: 'Teste atalho' })
    ));
    expect(toast.error).not.toHaveBeenCalled();
    expect(onSent).toHaveBeenCalled();
  });
});
