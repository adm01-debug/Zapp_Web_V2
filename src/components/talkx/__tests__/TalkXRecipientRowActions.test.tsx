import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TalkXRecipientRowActions } from '../tracking/TalkXRecipientRowActions';
import type { TalkXRecipient } from '@/hooks/integrations/useTalkX';
import { toast } from 'sonner';

const rpcMock = vi.hoisted(() => vi.fn());
const papel = vi.hoisted(() => ({ isSupervisor: true }));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isSupervisor: papel.isSupervisor, isAdmin: false }),
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  supabase: {
    rpc: rpcMock,
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const baseRecipient: TalkXRecipient = {
  id: 'r1',
  campaign_id: 'c1',
  contact_id: 'ct1',
  personalized_message: 'Oi',
  status: 'failed',
  sent_at: '2026-01-01T10:00:00Z',
  delivered_at: null,
  error_message: 'timeout',
  manual_retry_count: 0,
  created_at: '2026-01-01T09:00:00Z',
  contacts: { name: 'João', phone: '+5511999999999', nickname: null, company: null, avatar_url: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  papel.isSupervisor = true;
  rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('TalkXRecipientRowActions', () => {
  it('renderiza "Abrir conversa" para todo destinatário', () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    expect(screen.getByRole('button', { name: /abrir conversa/i })).toBeInTheDocument();
  });

  it('renderiza "Reenviar" quando status=failed e manual_retry_count < 3', () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    expect(screen.getByRole('button', { name: /^reenviar$/i })).toBeInTheDocument();
  });

  it('NÃO renderiza "Reenviar" quando manual_retry_count >= 3', () => {
    const recipient = { ...baseRecipient, manual_retry_count: 3 };
    wrap(<TalkXRecipientRowActions recipient={recipient} />);
    expect(screen.queryByRole('button', { name: /^reenviar$/i })).not.toBeInTheDocument();
  });

  it('NÃO renderiza "Reenviar" quando status=delivered', () => {
    const recipient = { ...baseRecipient, status: 'delivered' };
    wrap(<TalkXRecipientRowActions recipient={recipient} />);
    expect(screen.queryByRole('button', { name: /^reenviar$/i })).not.toBeInTheDocument();
  });

  it('renderiza "Bloquear" para gestor (admin/supervisor) em qualquer status', () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    expect(screen.getByRole('button', { name: /^bloquear$/i })).toBeInTheDocument();
  });

  it('clicar "Bloquear" abre diálogo de confirmação e NÃO chama a RPC antes de confirmar', () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    fireEvent.click(screen.getByRole('button', { name: /^bloquear$/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/bloquear contato/i)).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('clicar "Cancelar" no diálogo de bloqueio fecha o diálogo sem chamar a RPC', () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    fireEvent.click(screen.getByRole('button', { name: /^bloquear$/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('clicar "Abrir conversa" dispara o evento open-contact-chat', () => {
    const dispatch = vi.fn();
    vi.spyOn(window, 'dispatchEvent').mockImplementation(dispatch);
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    fireEvent.click(screen.getByRole('button', { name: /abrir conversa/i }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'open-contact-chat',
        detail: { contactId: 'ct1' },
      }),
    );
  });

  it('ao confirmar bloqueio, chama talkx_block_recipient só com o id do destinatário e chama onActionDone UMA vez', async () => {
    rpcMock.mockResolvedValue({ data: 'suppression-uuid-1', error: null });
    const onActionDone = vi.fn();
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={onActionDone} />);
    fireEvent.click(screen.getByRole('button', { name: /^bloquear$/i }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^bloquear$/i }));

    // Campanha, contato e telefone são lidos do destinatário NO SERVIDOR; a RPC
    // exclusiva do servidor (talkx_suppress_contact) nunca é chamada do navegador.
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('talkx_block_recipient', { p_recipient_id: 'r1' }));
    expect(rpcMock.mock.calls.some((c) => c[0] === 'talkx_suppress_contact')).toBe(false);
    expect(vi.mocked(toast.success)).toHaveBeenCalled();
    expect(vi.mocked(toast.warning)).not.toHaveBeenCalled();
    await waitFor(() => expect(onActionDone).toHaveBeenCalledTimes(1));
  });

  it('quem não é gestor (admin/supervisor) não vê o botão "Bloquear"', () => {
    papel.isSupervisor = false;
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    expect(screen.queryByRole('button', { name: /^bloquear$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abrir conversa/i })).toBeInTheDocument();
  });

  it('recusa de papel do servidor vira mensagem clara, não código cru', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'talkx_block_role_required' } });
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^bloquear$/i }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^bloquear$/i }));

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      'Só administradores e supervisores podem bloquear contatos.',
    ));
  });

  it('bloqueio já suprimido (data null) mostra toast.warning', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^bloquear$/i }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^bloquear$/i }));

    await waitFor(() => expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      expect.stringMatching(/já estava bloqueado/i),
    ));
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it('clicar "Reenviar" abre o modal "Reenviar para <nome>?" e NÃO chama a RPC antes de confirmar', () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    fireEvent.click(screen.getByRole('button', { name: /^reenviar$/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/reenviar para joão/i)).toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('ao confirmar reenvio, chama retry_talkx_recipients e mostra sucesso', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, retried: 1 }, error: null });
    const onActionDone = vi.fn();
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={onActionDone} />);
    fireEvent.click(screen.getByRole('button', { name: /^reenviar$/i }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^reenviar$/i }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith(
      'retry_talkx_recipients',
      { p_campaign_id: 'c1', p_recipient_ids: ['r1'] },
    ));
    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalled());
    expect(vi.mocked(toast.warning)).not.toHaveBeenCalled();
    expect(onActionDone).toHaveBeenCalledTimes(1);
  });

  it('recusa do retry (contato suprimido) mostra toast.warning e não chama onActionDone', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('talkx_retry_recipient_suppressed') });
    const onActionDone = vi.fn();
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={onActionDone} />);
    fireEvent.click(screen.getByRole('button', { name: /^reenviar$/i }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^reenviar$/i }));

    await waitFor(() => expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      expect.stringMatching(/bloqueado/i),
    ));
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
    expect(onActionDone).not.toHaveBeenCalled();
  });

  it('recusa do retry no corpo jsonb (ok:false) mostra toast.warning', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, reason: 'talkx_retry_limit_reached' }, error: null });
    const onActionDone = vi.fn();
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={onActionDone} />);
    fireEvent.click(screen.getByRole('button', { name: /^reenviar$/i }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^reenviar$/i }));

    await waitFor(() => expect(vi.mocked(toast.warning)).toHaveBeenCalledWith(
      expect.stringMatching(/limite/i),
    ));
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
    expect(onActionDone).not.toHaveBeenCalled();
  });

  describe('erros do bloqueio nunca chegam crus ao operador', () => {
    const confirmarBloqueio = () => {
      fireEvent.click(screen.getByRole('button', { name: /^bloquear$/i }));
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^bloquear$/i }));
    };

    it.each([
      [{ code: 'PGRST202', message: 'Could not find the function public.talkx_block_recipient(p_recipient_id) in the schema cache' }, 'Bloqueio indisponível no momento.'],
      [{ message: 'invalid_talkx_block_request' }, 'Pedido de bloqueio inválido — recarregue a lista e tente de novo.'],
      [{ message: 'talkx_block_recipient_not_found' }, 'Destinatário não encontrado — recarregue a lista.'],
      [{ message: 'authentication_required' }, 'Sessão inválida — entre novamente.'],
      [{ message: 'duplicate key value violates unique constraint "x"' }, 'Não foi possível bloquear o contato. Tente novamente.'],
    ])('%o → %s', async (erro, esperado) => {
      rpcMock.mockResolvedValue({ data: null, error: erro });
      wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={vi.fn()} />);
      confirmarBloqueio();
      await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith(esperado));
    });

    it('rejeição de rede vira mensagem genérica em português', async () => {
      rpcMock.mockRejectedValue(new TypeError('Failed to fetch'));
      wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={vi.fn()} />);
      confirmarBloqueio();
      await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Não foi possível bloquear o contato. Tente novamente.'));
    });

    it('falha no bloqueio NÃO chama onActionDone (a lista não recarrega à toa)', async () => {
      rpcMock.mockResolvedValue({ data: null, error: { message: 'talkx_block_role_required' } });
      const onActionDone = vi.fn();
      wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={onActionDone} />);
      confirmarBloqueio();
      await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByRole('button', { name: /^bloquear$/i })).not.toBeDisabled());
      expect(onActionDone).not.toHaveBeenCalled();
    });

    it('já bloqueado (data null, sem erro) conta como aceito e recarrega a lista', async () => {
      rpcMock.mockResolvedValue({ data: null, error: null });
      const onActionDone = vi.fn();
      wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={onActionDone} />);
      confirmarBloqueio();
      await waitFor(() => expect(onActionDone).toHaveBeenCalledTimes(1));
    });
  });
});
