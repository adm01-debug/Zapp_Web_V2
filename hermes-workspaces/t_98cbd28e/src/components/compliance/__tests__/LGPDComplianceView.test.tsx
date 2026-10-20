import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * R2-AUTH-050 / item 274 — a solicitação de exclusão de dados (direito ao esquecimento)
 * só pode ser CONFIRMADA ao usuário depois que o registro de auditoria for aceito pelo
 * banco. `supabase.rpc()` não rejeita a promise em erro do PostgREST: ele resolve com
 * `{ error }`. O código antigo ignorava esse `error`, exibia o toast de sucesso e
 * fechava a confirmação — ou seja, o usuário "solicitava a exclusão" sem que nada
 * tivesse sido registrado (rastro LGPD perdido).
 */

const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'qa@exemplo.test' },
    profile: null,
    session: null,
    loading: false,
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { LGPDComplianceView } from '../LGPDComplianceView';
import { toast } from 'sonner';

const TEXTO_CONFIRMACAO = 'Tem certeza? Esta ação não pode ser desfeita.';

async function pedirEConfirmarExclusao() {
  render(<LGPDComplianceView />);
  fireEvent.click(screen.getByRole('button', { name: /Solicitar Exclusão de Dados/i }));
  const confirmar = await screen.findByRole('button', { name: /Confirmar Exclusão/i });
  fireEvent.click(confirmar);
}

describe('LGPDComplianceView — direito ao esquecimento (R2-AUTH-050)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registro de auditoria com erro: NÃO confirma a solicitação e mostra o erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'auditoria indisponível' } });

    await pedirEConfirmarExclusao();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Erro ao registrar solicitação');
    });
    expect(toast.success).not.toHaveBeenCalled();
    // a confirmação continua aberta: nada foi confirmado ao usuário
    expect(screen.getByText(TEXTO_CONFIRMACAO)).toBeInTheDocument();
    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({
      p_action: 'gdpr_deletion_request',
      p_entity_id: 'user-1',
    }));
  });

  it('registro de auditoria aceito: confirma a solicitação e fecha a confirmação', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await pedirEConfirmarExclusao();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByText(TEXTO_CONFIRMACAO)).not.toBeInTheDocument();
  });
});
