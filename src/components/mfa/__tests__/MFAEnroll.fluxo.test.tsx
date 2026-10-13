/**
 * MFAEnroll — t_62a7ee39.
 *
 * Prova o fluxo em 3 passos (intro -> QR -> verificação) com o contrato real do
 * useMFA: começando o enrollment pelo botão, verificando com o id retornado pelo
 * enroll e oferecendo o segredo para cópia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  enrollTOTP: vi.fn(),
  verifyTOTP: vi.fn(),
  loading: false,
  enrollmentData: null as null | { id: string; totp: { qr_code: string; secret: string; uri: string } },
  writeText: vi.fn(),
}));

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({
    enrollTOTP: h.enrollTOTP,
    verifyTOTP: h.verifyTOTP,
    loading: h.loading,
    enrollmentData: h.enrollmentData,
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MFAEnroll } from '../MFAEnroll';

beforeEach(() => {
  h.enrollTOTP.mockReset().mockResolvedValue(undefined);
  h.verifyTOTP.mockReset().mockResolvedValue({});
  h.writeText.mockReset().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText: h.writeText } });
  h.loading = false;
  h.enrollmentData = {
    id: 'e-1',
    totp: { qr_code: 'data:image/png;base64,AAAA', secret: 'SEGREDO123', uri: 'otpauth://totp/x' },
  };
});

describe('MFAEnroll', () => {
  it('"Começar Configuração" chama enrollTOTP e mostra o QR/segredo', async () => {
    render(<MFAEnroll />);
    fireEvent.click(screen.getByRole('button', { name: /Começar Configuração/i }));

    await waitFor(() => expect(h.enrollTOTP).toHaveBeenCalledTimes(1));
    expect(await screen.findByAltText('QR Code para MFA')).toBeTruthy();
    expect(screen.getByText('SEGREDO123')).toBeTruthy();
  });

  it('copiar o segredo usa o clipboard com o valor do enrollment', async () => {
    render(<MFAEnroll />);
    fireEvent.click(screen.getByRole('button', { name: /Começar Configuração/i }));
    await screen.findByAltText('QR Code para MFA');

    fireEvent.click(screen.getAllByRole('button').find((b) => b.querySelector('.lucide-copy'))!);

    expect(h.writeText).toHaveBeenCalledWith('SEGREDO123');
  });

  it('com 6 dígitos verifica usando o id do enrollment e chama onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<MFAEnroll onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole('button', { name: /Começar Configuração/i }));
    await screen.findByAltText('QR Code para MFA');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    fireEvent.change(screen.getByLabelText('Código de Verificação'), { target: { value: '111222' } });

    await waitFor(() => expect(h.verifyTOTP).toHaveBeenCalledWith('e-1', '111222'));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('Cancelar chama onCancel', () => {
    const onCancel = vi.fn();
    render(<MFAEnroll onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
