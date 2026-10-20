import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';

// t_258e72a5 — o campo de codigo do app autenticador nao trazia
// autoComplete="one-time-code" (o navegador nao oferecia o codigo recem-chegado
// por SMS/app de senhas) e a falha de verificacao aparecia sem role="alert":
// quem usa leitor de tela digitava o codigo certo ou errado sem ouvir nada. No
// MFAEnroll o botao de copiar o segredo era so um icone, sem nome acessivel.
const h = vi.hoisted(() => ({
  verifyTOTP: vi.fn(),
  fetchFactors: vi.fn(),
  enrollTOTP: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({
    verifyTOTP: h.verifyTOTP,
    fetchFactors: h.fetchFactors,
    enrollTOTP: h.enrollTOTP,
    loading: false,
    factors: [{ id: 'fator-1', status: 'verified' }],
    enrollmentData: {
      id: 'fator-1',
      totp: { secret: 'JBSWY3DPEHPK3PXP', qr_code: 'data:image/png;base64,AAAA' },
    },
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MFAVerify } from '@/components/mfa/MFAVerify';
import { MFAEnroll } from '@/components/mfa/MFAEnroll';

beforeEach(() => {
  h.fetchFactors.mockResolvedValue(undefined);
  h.enrollTOTP.mockResolvedValue(undefined);
  h.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: h.writeText },
  });
});

describe('MFAVerify — codigo de 6 digitos e erro anunciados', () => {
  it('marca o campo como one-time-code e liga o erro ao campo', async () => {
    h.verifyTOTP.mockRejectedValue(new Error('codigo invalido'));
    render(<MFAVerify />);

    const campo = document.getElementById('mfa-code') as HTMLInputElement;
    expect(campo.getAttribute('autocomplete')).toBe('one-time-code');
    expect(campo.getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.change(campo, { target: { value: '123456' } });

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe('Código inválido. Tente novamente.');
    expect(alerta.id).toBe('mfa-code-erro');
    expect(
      (document.getElementById('mfa-code') as HTMLInputElement).getAttribute('aria-describedby')
    ).toBe('mfa-code-erro');
    expect(
      (document.getElementById('mfa-code') as HTMLInputElement).getAttribute('aria-invalid')
    ).toBe('true');
  });

  it('nao tem violacao de acessibilidade (axe)', async () => {
    h.verifyTOTP.mockResolvedValue(undefined);
    const { container } = render(<MFAVerify />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('MFAEnroll — campo one-time-code e botao de copiar nomeado', () => {
  it('o botao de copiar tem nome acessivel e o campo aceita codigo de uso unico', async () => {
    render(<MFAEnroll />);

    fireEvent.click(screen.getByRole('button', { name: 'Começar Configuração' }));

    const copiar = await screen.findByRole('button', { name: 'Copiar código secreto' });

    fireEvent.click(copiar);

    expect(h.writeText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP');
    expect(
      await screen.findByRole('button', { name: 'Código secreto copiado' })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    const campoCodigo = (await screen.findByLabelText('Código de Verificação')) as HTMLInputElement;
    expect(campoCodigo.id).toBe('code');
    expect(campoCodigo.getAttribute('autocomplete')).toBe('one-time-code');
  });
});
