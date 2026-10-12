// Cartão t_0b2d1dc1 — o painel deve mostrar o resultado REAL do envio:
// só diz "enviado" quando a Edge devolve emailSent=true; na falha fechada (502
// approved_email_failed) avisa "Aprovado, mas o e-mail não foi enviado" e oferece
// reenviar. Em nenhum estado o front exibe link de reset.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PasswordResetRequestsPanel } from '../PasswordResetRequestsPanel';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PENDENTE = {
  id: '1', user_id: 'u1', email: 'alvo@empresa.com', reason: null, status: 'pending',
  reviewed_by: null, reviewed_at: null, rejection_reason: null,
  ip_address: null, user_agent: null, created_at: '2026-10-01T10:00:00.000Z',
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [PENDENTE], error: null })),
      })),
    })),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const invoke = vi.mocked(supabase.functions.invoke);

/** Reproduz a forma real do supabase-js: em não-2xx ele devolve
 *  { data: null, error: FunctionsHttpError } e o corpo fica em error.context (a Response). */
function httpError(status: number, body: unknown) {
  return Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  });
}

async function renderEPendentes() {
  render(<PasswordResetRequestsPanel />);
  await waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument());
}

beforeEach(() => {
  invoke.mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe('PasswordResetRequestsPanel — resultado real do envio', () => {
  it('emailSent=true: confirma o envio com o e-mail MASCARADO (nunca o endereço inteiro)', async () => {
    invoke.mockResolvedValueOnce({ data: { success: true, emailSent: true, status: 'approved' }, error: null });

    await renderEPendentes();
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const chamadas = vi.mocked(toast.success).mock.calls;
    const msg = chamadas[chamadas.length - 1][0] as string;
    expect(msg).toContain('a***@empresa.com');
    expect(msg).not.toContain('alvo@empresa.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('emailSent=false (502 approved_email_failed): avisa que o e-mail NÃO saiu e oferece reenviar', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: httpError(502, { success: false, emailSent: false, status: 'approved_email_failed' }),
    });

    await renderEPendentes();
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Aprovado, mas o e-mail não foi enviado — tente novamente');
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Reenviar/ })).toBeInTheDocument();
  });

  it('o botão Reenviar dispara uma nova aprovação e some quando o e-mail sai', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: httpError(502, { success: false, emailSent: false, status: 'approved_email_failed' }),
    });
    invoke.mockResolvedValueOnce({ data: { success: true, emailSent: true, status: 'approved' }, error: null });

    await renderEPendentes();
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: /Reenviar/ }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    const body = invoke.mock.calls[1]?.[1]?.body as { requestId?: string; action?: string };
    expect(body).toEqual({ requestId: '1', action: 'approve' });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalled();
  });

  it('erro real (4xx) mostra a mensagem do servidor, sem prometer envio', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: httpError(403, { error: 'Você não pode aprovar a redefinição da própria conta' }),
    });

    await renderEPendentes();
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Você não pode aprovar a redefinição da própria conta'),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText(/tente novamente/)).not.toBeInTheDocument();
  });

  it('nenhum link de reset aparece no DOM em nenhum estado', async () => {
    invoke.mockResolvedValueOnce({ data: { success: true, emailSent: true, status: 'approved' }, error: null });

    await renderEPendentes();
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    expect(document.body.innerHTML).not.toMatch(/resetLink|action_link|actionLink|\btoken\b/);
  });
});
