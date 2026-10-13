import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const { mockReauthenticate } = vi.hoisted(() => ({ mockReauthenticate: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/auth/useReauthentication', () => ({
  useReauthentication: () => ({ reauthenticate: mockReauthenticate, isReauthenticating: false }),
}));
vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({ verifyTOTP: vi.fn(), loading: false }),
  useMfaFactors: () => ({ data: [], isLoading: false }),
}));

import { ConnectionDeleteDialog } from '@/components/connections/ConnectionDeleteDialog';

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = React.useState(true);
  return (
    <ConnectionDeleteDialog
      open={open}
      onOpenChange={setOpen}
      connectionName="Principal"
      onConfirm={onConfirm}
    />
  );
}

describe('ConnectionDeleteDialog — exclusão exige re-autenticação (t_5e689954)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReauthenticate.mockResolvedValue({ success: true });
  });

  it('não exclui com o nome confirmado: ainda espera a identidade', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText(/Digite Principal para confirmar/), {
      target: { value: 'Principal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conexão' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Senha Atual')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('senha errada cancela a exclusão sem apagar nada', async () => {
    mockReauthenticate.mockResolvedValue({ success: false, error: 'Senha incorreta' });
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    fireEvent.change(screen.getByLabelText(/Digite Principal para confirmar/), {
      target: { value: 'Principal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conexão' }));

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await screen.findByRole('alert');
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
