/**
 * A lista de 2FA: erro de leitura NÃO é "Inativo" (ausência de dado não é dado),
 * o botão de remover tem rótulo acessível e fechar o cadastro remove o fator
 * pendente no servidor (cancelEnroll).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MFASettings } from '@/components/mfa/MFASettings';

const h = vi.hoisted(() => ({
  isMFAEnabled: false,
  factors: [] as Array<{
    id: string;
    factor_type: 'totp';
    status: 'verified' | 'unverified';
    friendly_name?: string;
  }>,
  fetchFactors: vi.fn(),
  unenroll: vi.fn(),
  cancelEnroll: vi.fn(),
}));

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({
    loading: false,
    isMFAEnabled: h.isMFAEnabled,
    factors: h.factors,
    fetchFactors: h.fetchFactors,
    unenroll: h.unenroll,
    cancelEnroll: h.cancelEnroll,
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('MFASettings — leitura da lista', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.isMFAEnabled = false;
    h.factors = [];
    h.cancelEnroll.mockResolvedValue(undefined);
  });

  it('erro de leitura mostra falha e Tentar de novo, nunca "Inativo"', async () => {
    h.fetchFactors.mockRejectedValueOnce(new Error('falha de rede'));

    render(<MFASettings />);

    expect(await screen.findByText('Não foi possível ler os seus métodos de 2FA.')).toBeTruthy();
    expect(screen.queryByText('Inativo')).toBeNull();
    expect(screen.queryByRole('button', { name: /configurar 2fa/i })).toBeNull();
  });

  it('Tentar de novo relê a lista e mostra o fator verificado', async () => {
    h.fetchFactors.mockRejectedValueOnce(new Error('falha de rede'));
    render(<MFASettings />);
    await screen.findByText('Não foi possível ler os seus métodos de 2FA.');

    h.isMFAEnabled = true;
    h.factors = [
      { id: 'f-1', factor_type: 'totp', status: 'verified', friendly_name: 'Celular do Joaquim' },
    ];
    h.fetchFactors.mockResolvedValueOnce(h.factors);

    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(await screen.findByText('Ativo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remover Celular do Joaquim' })).toBeTruthy();
    expect(h.fetchFactors).toHaveBeenCalledTimes(2);
  });

  it('fechar o cadastro remove o fator pendente (cancelEnroll)', async () => {
    h.fetchFactors.mockResolvedValue([]);
    render(<MFASettings />);

    fireEvent.click(await screen.findByRole('button', { name: /configurar 2fa/i }));
    const cancelar = await screen.findByRole('button', { name: 'Cancelar' });
    fireEvent.click(cancelar);

    expect(h.cancelEnroll).toHaveBeenCalledTimes(1);
    await screen.findByRole('button', { name: /configurar 2fa/i });
  });
});
