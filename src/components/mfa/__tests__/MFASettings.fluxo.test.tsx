/**
 * MFASettings — t_62a7ee39.
 *
 * Prova o painel de configuração: reflete ativo/inativo, lista os fatores com o
 * estado real e só remove o fator escolhido depois da confirmação do diálogo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  factors: [] as Array<{ id: string; status: string; friendly_name?: string }>,
  fetchFactors: vi.fn(),
  unenroll: vi.fn(),
  loading: false,
  isMFAEnabled: false,
}));

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({
    factors: h.factors,
    fetchFactors: h.fetchFactors,
    unenroll: h.unenroll,
    loading: h.loading,
    isMFAEnabled: h.isMFAEnabled,
  }),
}));

vi.mock('@/components/mfa/MFAEnroll', () => ({
  MFAEnroll: () => <div>ENROLL STUB</div>,
}));

import { MFASettings } from '../MFASettings';

beforeEach(() => {
  h.fetchFactors.mockReset().mockResolvedValue([]);
  h.unenroll.mockReset().mockResolvedValue(undefined);
  h.factors = [];
  h.loading = false;
  h.isMFAEnabled = false;
});

describe('MFASettings', () => {
  it('sem 2FA: badge Inativo e recomendação visível', () => {
    render(<MFASettings />);
    expect(screen.getByText('Inativo')).toBeTruthy();
    expect(screen.getByText('Recomendado ativar 2FA')).toBeTruthy();
  });

  it('com 2FA: badge Ativo e sem recomendação', () => {
    h.isMFAEnabled = true;
    render(<MFASettings />);
    expect(screen.getByText('Ativo')).toBeTruthy();
    expect(screen.queryByText('Recomendado ativar 2FA')).toBeNull();
  });

  it('lista os fatores com nome e estado de verificação', () => {
    h.factors = [{ id: 'f-ok', status: 'verified', friendly_name: 'Meu app' }];
    render(<MFASettings />);
    expect(screen.getByText('Meu app')).toBeTruthy();
    expect(screen.getByText(/Verificado/)).toBeTruthy();
  });

  it('remover o fator exige confirmação e chama unenroll com o id certo', async () => {
    h.factors = [{ id: 'f-ok', status: 'verified', friendly_name: 'Meu app' }];
    h.isMFAEnabled = true;
    const { container } = render(<MFASettings />);

    fireEvent.click(container.querySelector('.lucide-trash-2')!.closest('button')!);
    expect(await screen.findByText('Remover Autenticação 2FA?')).toBeTruthy();
    expect(h.unenroll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(h.unenroll).toHaveBeenCalledWith('f-ok'));
  });

  it('"Configurar 2FA" abre o diálogo de enrollment', async () => {
    render(<MFASettings />);
    fireEvent.click(screen.getByRole('button', { name: /Configurar 2FA/i }));
    expect(await screen.findByText('ENROLL STUB')).toBeTruthy();
  });
});
