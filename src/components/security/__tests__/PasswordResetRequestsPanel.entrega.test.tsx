import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// R2-AUTH-007 (item 73): o handleApprove descartava o `data` da resposta e
// anunciava "Email de reset enviado" sem nenhum envio. A UI passa a refletir
// data.delivery (queued/sent/failed) e a oferecer retry seguro.

const f = vi.hoisted(() => ({
  invoke: vi.fn(),
  rows: [] as Record<string, unknown>[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: f.invoke },
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: f.rows, error: null }) }),
    }),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../RejectResetDialog', () => ({ RejectResetDialog: () => null }));

import { toast } from 'sonner';
import { PasswordResetRequestsPanel } from '../PasswordResetRequestsPanel';

const pendingRow = {
  id: 'r1', user_id: 'u1', email: 'usuario@test.com', reason: null,
  status: 'pending', reviewed_by: null, reviewed_at: null, rejection_reason: null,
  ip_address: null, user_agent: null, created_at: '2026-10-05T10:00:00Z',
  delivery_status: null, delivered_at: null,
};

const failedRow = {
  ...pendingRow,
  id: 'r2', status: 'approved', delivery_status: 'failed', delivered_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  f.rows = [{ ...pendingRow }];
});

describe('PasswordResetRequestsPanel — entrega do e-mail de recuperacao', () => {
  it('T7 delivery failed na resposta: NENHUM toast de sucesso nem de e-mail enviado', async () => {
    f.invoke.mockResolvedValue({ data: { success: false, delivery: 'failed', message: 'Falha ao enviar o e-mail de recuperacao' }, error: null });
    render(<PasswordResetRequestsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /aprovar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    expect(toast.success).not.toHaveBeenCalled();
    expect(f.invoke).toHaveBeenCalledWith('approve-password-reset', { body: { requestId: 'r1', action: 'approve' } });
  });

  it('T8 delivery sent na resposta: sucesso dizendo que o e-mail foi enviado', async () => {
    f.invoke.mockResolvedValue({ data: { success: true, delivery: 'sent', message: 'Solicitacao aprovada; e-mail de recuperacao enviado' }, error: null });
    render(<PasswordResetRequestsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /aprovar/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/e-?mail de recupera/i)));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('T9 durante o invoke o botao fica desabilitado (estado enviando)', async () => {
    let release!: (v: unknown) => void;
    f.invoke.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    render(<PasswordResetRequestsPanel />);

    const approveButton = await screen.findByRole('button', { name: /aprovar/i });
    fireEvent.click(approveButton);

    await waitFor(() => expect(approveButton).toBeDisabled());
    release({ data: { success: true, delivery: 'sent' }, error: null });
    await waitFor(() => expect(approveButton).not.toBeDisabled());
  });

  it('resend: linha approved+failed oferece "Reenviar e-mail" chamando action resend', async () => {
    f.rows = [{ ...failedRow }];
    f.invoke.mockResolvedValue({ data: { success: true, delivery: 'sent', message: 'ok' }, error: null });
    render(<PasswordResetRequestsPanel />);

    const allTab = await screen.findByRole('tab', { name: /todas/i });
    fireEvent.mouseDown(allTab, { button: 0, ctrlKey: false });
    fireEvent.click(allTab);
    const resendButton = await screen.findByRole('button', { name: /reenviar e-?mail/i });
    fireEvent.click(resendButton);

    await waitFor(() => expect(f.invoke).toHaveBeenCalledWith('approve-password-reset', { body: { requestId: 'r2', action: 'resend' } }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
