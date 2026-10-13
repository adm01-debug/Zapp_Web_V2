/**
 * MFAVerify — t_62a7ee39.
 *
 * Prova o comportamento real: busca os fatores ao montar, só verifica com 6
 * dígitos, usa o id do fator VERIFICADO (não o primeiro da lista), trata "sem
 * fator" com erro próprio e, na falha, limpa o campo e mostra a mensagem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  verifyTOTP: vi.fn(),
  fetchFactors: vi.fn(),
  factors: [] as Array<{ id: string; status: string; friendly_name?: string }>,
  loading: false,
}));

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({
    verifyTOTP: h.verifyTOTP,
    fetchFactors: h.fetchFactors,
    factors: h.factors,
    loading: h.loading,
  }),
}));

import { MFAVerify } from '../MFAVerify';

beforeEach(() => {
  h.verifyTOTP.mockReset().mockResolvedValue({});
  h.fetchFactors.mockReset().mockResolvedValue([]);
  h.factors = [
    { id: 'f-nao', status: 'unverified' },
    { id: 'f-ok', status: 'verified', friendly_name: 'App' },
  ];
  h.loading = false;
});

describe('MFAVerify', () => {
  it('busca os fatores ao montar', () => {
    render(<MFAVerify />);
    expect(h.fetchFactors).toHaveBeenCalledTimes(1);
  });

  it('botão fica desabilitado com menos de 6 dígitos', () => {
    render(<MFAVerify />);
    const botao = screen.getByRole('button', { name: /Verificar/i }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText('Código de Verificação'), { target: { value: '123' } });
    expect(botao.disabled).toBe(true);
  });

  it('com 6 dígitos usa o fator VERIFICADO (não o primeiro) e chama onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<MFAVerify onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText('Código de Verificação'), { target: { value: '123456' } });

    await waitFor(() => expect(h.verifyTOTP).toHaveBeenCalledWith('f-ok', '123456'));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('sem fator verificado mostra erro próprio e não chama verifyTOTP', async () => {
    h.factors = [{ id: 'f-1', status: 'unverified' }];
    render(<MFAVerify />);

    fireEvent.change(screen.getByLabelText('Código de Verificação'), { target: { value: '123456' } });

    expect(await screen.findByText('Nenhum fator MFA encontrado')).toBeTruthy();
    expect(h.verifyTOTP).not.toHaveBeenCalled();
  });

  it('falha na verificação mostra erro e limpa o campo', async () => {
    h.verifyTOTP.mockRejectedValue(new Error('código expirado'));
    render(<MFAVerify />);

    const campo = screen.getByLabelText('Código de Verificação') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '654321' } });

    expect(await screen.findByText('Código inválido. Tente novamente.')).toBeTruthy();
    expect(campo.value).toBe('');
  });
});
