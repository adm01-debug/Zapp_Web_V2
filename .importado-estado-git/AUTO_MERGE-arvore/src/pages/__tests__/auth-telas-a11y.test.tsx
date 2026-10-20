import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MemoryRouter } from 'react-router-dom';

// t_258e72a5 — ForgotPassword, ResetPassword e TwoFactorAuth nao tinham o
// landmark <main> nem anunciavam o erro (role="alert"/aria-live): quem usa
// leitor de tela nao tinha ponto de aterrissagem e nao ouvía a falha. O estado
// "Verificando status de autenticação..." tambem era mudo (agora role="status").
const h = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  getAssuranceLevel: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }),
    }),
    auth: {
      getSession: (...a: unknown[]) => h.getSession(...a),
      updateUser: (...a: unknown[]) => h.updateUser(...a),
      onAuthStateChange: (...a: unknown[]) => h.onAuthStateChange(...a),
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-teste' }, loading: false }),
}));

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({ getAssuranceLevel: (...a: unknown[]) => h.getAssuranceLevel(...a) }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ForgotPassword from '../ForgotPassword';
import ResetPassword from '../ResetPassword';
import TwoFactorAuth from '../TwoFactorAuth';

function montar(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  h.getSession.mockResolvedValue({ data: { session: null } });
  h.updateUser.mockResolvedValue({ error: null });
  h.maybeSingle.mockResolvedValue({ data: null, error: null });
  h.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  h.getAssuranceLevel.mockResolvedValue(null);
});

describe('ForgotPassword — landmark e erro anunciado', () => {
  it('expoe <main> e anuncia o email invalido em role=alert', async () => {
    const { container } = montar(<ForgotPassword />);

    expect(screen.getByRole('main')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'nao-eh-email' },
    });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe('Email inválido');
    expect(alerta.getAttribute('aria-live')).toBe('polite');
  });

  it('nao tem violacao de acessibilidade (axe)', async () => {
    const { container } = montar(<ForgotPassword />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ResetPassword — landmark e erro anunciado', () => {
  it('expoe <main> e anuncia a senha fraca em role=alert', async () => {
    h.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    montar(<ResetPassword />);

    const novaSenha = await screen.findByLabelText('Nova Senha');
    expect(screen.getByRole('main')).toBeTruthy();

    fireEvent.change(novaSenha, { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('Confirmar Senha'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /Alterar Senha/i }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe('Mínimo 8 caracteres');
  });
});

describe('TwoFactorAuth — landmark, estado de espera e erro anunciados', () => {
  it('anuncia o estado de verificacao com role=status', async () => {
    h.getAssuranceLevel.mockReturnValue(new Promise(() => undefined));
    montar(<TwoFactorAuth />);

    const espera = await screen.findByRole('status');
    expect(espera.textContent).toContain('Verificando status de autenticação');
  });

  it('expoe <main> e anuncia a falha de assurance em role=alert', async () => {
    h.getAssuranceLevel.mockResolvedValue(null);
    const { container } = montar(<TwoFactorAuth />);

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe('Erro ao verificar autenticação');
    expect(screen.getByRole('main')).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });
});
