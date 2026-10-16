/**
 * Código recusado no desafio 2FA: o campo volta habilitado, recebe o foco de
 * volta e o erro fica associado ao input (aria-describedby/aria-invalid), com a
 * mensagem pt-BR que o hook produziu (aqui, 'muitas tentativas' — não 'código
 * inválido').
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MFAVerify } from '@/components/mfa/MFAVerify';

const verifyTOTP = vi.hoisted(() => vi.fn());
const fetchFactors = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({
    verifyTOTP,
    fetchFactors,
    factors: [{ id: 'f-1', factor_type: 'totp', status: 'verified' }],
    loading: false,
  }),
}));

describe('MFAVerify — código recusado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchFactors.mockResolvedValue([]);
  });

  it('mostra a mensagem pt-BR do erro, liga-a ao input e devolve o foco ao campo', async () => {
    verifyTOTP.mockRejectedValue(
      new Error('Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.'),
    );
    render(<MFAVerify />);

    const input = screen.getByLabelText('Código de Verificação') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '123456' } });

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe(
      'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.',
    );

    await waitFor(() => expect(input.disabled).toBe(false));
    expect(input.getAttribute('aria-describedby')).toBe('mfa-code-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.value).toBe('');
    await waitFor(() => expect(document.activeElement).toBe(input));
  });
});
