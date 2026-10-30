/**
 * O cadastro 2FA não oferece botão de copiar o segredo: copiar a semente do
 * TOTP para a área de transferência é uma saída de informação que o sistema não
 * faz. O segredo continua legível na tela para ser digitado no app autenticador.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MFAEnroll } from '@/components/mfa/MFAEnroll';

const enrollTOTP = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({
    enrollTOTP,
    verifyTOTP: vi.fn(),
    loading: false,
    enrollmentData: {
      id: 'e-1',
      type: 'totp',
      totp: {
        qr_code: 'data:image/png;base64,QUJD',
        secret: 'JBSWY3DPEHPK3PXP',
        uri: 'otpauth://totp/zapp?secret=JBSWY3DPEHPK3PXP',
      },
    },
  }),
}));

describe('MFAEnroll — sem copiar o segredo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enrollTOTP.mockResolvedValue({});
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('mostra o segredo para digitar e não tem botão de copiar', async () => {
    render(<MFAEnroll />);

    fireEvent.click(screen.getByRole('button', { name: /começar configuração/i }));

    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /copiar/i })).toBeNull();
    // Só sobra o 'Continuar' — o botão de copiar saiu.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
