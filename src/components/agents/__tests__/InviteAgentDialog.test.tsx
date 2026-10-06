import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { InviteAgentDialog } from '../InviteAgentDialog';
import { toast } from 'sonner';

// O jsdom não implementa isso; o Radix Select chama ao abrir/fechar
// (mesmo padrão de EditContactDialog.test.tsx).
beforeAll(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

// R2-API-022 (P1): o chamador do relay `send-email` deixa de enviar subject/html
// arbitrários. O convite agora manda só e-mail/nome/cargo, e o assunto/corpo
// derivam de um template do servidor. Este teste trava o formato do payload.
// R2-AUTH-015 (P2): antes de anunciar ou enviar e-mail, o diálogo cria o convite
// de verdade pela RPC `create_agent_invite` (código, papel autorizado, validade,
// consumo único) e lista os convites existentes via `list_agent_invites`.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => mocks.rpc(fn, args),
    functions: { invoke: (fn: string, options?: unknown) => mocks.invoke(fn, options) },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const fillForm = () => {
  fireEvent.change(screen.getByPlaceholderText('Nome do agente'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByPlaceholderText('agente@empresa.com'), { target: { value: 'ana@empresa.com' } });
};

describe('InviteAgentDialog — convite autenticável (R2-AUTH-015) + payload travado (R2-API-022)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
      if (fn === 'create_agent_invite') {
        return Promise.resolve({
          data: {
            ok: true,
            invite_id: 'invite-1',
            code: 'X7K9P2QW4RTY',
            role: args?.p_role,
            email: args?.p_email,
            expires_at: '2026-10-09T12:00:00+00:00',
            existing_account: false,
          },
          error: null,
        });
      }
      if (fn === 'list_agent_invites') return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: null, error: null });
    });
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('envia apenas email/nome/cargo (sem subject/html/cópias)', async () => {
    render(<InviteAgentDialog open onOpenChange={() => {}} />);

    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));

    const [fnName, options] = mocks.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(fnName).toBe('send-email');

    const body = options.body;
    expect(body.email).toBe('ana@empresa.com');
    expect(body.name).toBe('Ana');
    expect(body.role).toBe('agent');

    for (const key of ['to', 'subject', 'html', 'text', 'cc', 'bcc', 'attachments', 'from', 'reply_to']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('não dispara o envio sem email preenchido', () => {
    render(<InviteAgentDialog open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith('create_agent_invite', expect.anything());
  });

  it('cria o convite pela RPC com o cargo escolhido e mostra o código', async () => {
    render(<InviteAgentDialog open onOpenChange={() => {}} />);

    fillForm();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Supervisor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('create_agent_invite', {
        p_email: 'ana@empresa.com',
        p_name: 'Ana',
        p_role: 'supervisor',
        p_expires_hours: 72,
      });
    });
    expect(await screen.findByText('X7K9P2QW4RTY')).toBeInTheDocument();
  });

  it('não anuncia sucesso quando o convite não é criado', async () => {
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === 'create_agent_invite') {
        return Promise.resolve({ data: { ok: false, error: 'already_pending' }, error: null });
      }
      if (fn === 'list_agent_invites') return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: null, error: null });
    });

    render(<InviteAgentDialog open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('agente@empresa.com'), { target: { value: 'ana@empresa.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Já existe um convite pendente para este e-mail.');
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('mostra o estado dos convites listados', async () => {
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === 'list_agent_invites') {
        return Promise.resolve({
          data: [
            { id: 'i-1', email: 'pendente@empresa.com', name: 'Pen', role: 'agent', status: 'pending', expires_at: '2026-10-09T00:00:00+00:00', accepted_at: null, created_at: '2026-10-06T00:00:00+00:00' },
            { id: 'i-2', email: 'usado@empresa.com', name: 'Usa', role: 'admin', status: 'used', expires_at: '2026-10-08T00:00:00+00:00', accepted_at: '2026-10-06T10:00:00+00:00', created_at: '2026-10-05T00:00:00+00:00' },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    render(<InviteAgentDialog open onOpenChange={() => {}} />);

    expect(await screen.findByText('pendente@empresa.com')).toBeInTheDocument();
    expect(screen.getByText('usado@empresa.com')).toBeInTheDocument();
    expect(screen.getByText(/Pendente/)).toBeInTheDocument();
    expect(screen.getByText(/Usado/)).toBeInTheDocument();
  });
});
