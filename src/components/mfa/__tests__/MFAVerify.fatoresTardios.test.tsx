/**
 * Desafio 2FA com o código digitado ANTES de os fatores chegarem (colar ou
 * autofill no primeiro instante da tela, quando `loading` ainda é false).
 * Antes, a auto-verificação caía em 'Nenhum fator MFA encontrado', deixava os 6
 * dígitos parados no campo e — como o efeito só observa `code` — nada tentava de
 * novo quando a lista chegava: a pessoa travava no login.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MFAVerify } from '@/components/mfa/MFAVerify';

const verifyTOTP = vi.hoisted(() => vi.fn());
const fetchFactors = vi.hoisted(() => vi.fn());

// `factors` fica vazio em todo o teste: é exatamente a janela do bug — o estado
// do hook ainda não recebeu a lista quando o código de 6 dígitos entra.
vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({
    verifyTOTP,
    fetchFactors,
    factors: [],
    loading: false,
  }),
}));

function digitarCodigo() {
  const input = screen.getByLabelText('Código de Verificação') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '123456' } });
  return input;
}

describe('MFAVerify — fatores que chegam depois do código', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyTOTP.mockResolvedValue(undefined);
  });

  it('verifica com o fator que a leitura devolveu em vez de dizer que não há fator', async () => {
    fetchFactors.mockResolvedValue([{ id: 'f-1', factor_type: 'totp', status: 'verified' }]);
    const onSuccess = vi.fn();
    render(<MFAVerify onSuccess={onSuccess} />);

    digitarCodigo();

    await waitFor(() => expect(verifyTOTP).toHaveBeenCalledWith('f-1', '123456'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('mostra falha de leitura (não "nenhum fator") e limpa o campo quando a lista não carrega', async () => {
    fetchFactors.mockRejectedValue(new Error('network'));
    const input = (() => {
      render(<MFAVerify />);
      return digitarCodigo();
    })();

    await waitFor(() => expect(input.value).toBe(''));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe(
      'Não foi possível carregar seus métodos de verificação. Tente novamente.',
    );
    expect(verifyTOTP).not.toHaveBeenCalled();
  });

  it('quando não existe fator verificado, avisa e libera o campo para outra tentativa', async () => {
    fetchFactors.mockResolvedValue([{ id: 'f-2', factor_type: 'totp', status: 'unverified' }]);
    render(<MFAVerify />);

    const input = digitarCodigo();

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe('Nenhum fator MFA encontrado');
    await waitFor(() => expect(input.value).toBe(''));
    expect(verifyTOTP).not.toHaveBeenCalled();
  });
});
