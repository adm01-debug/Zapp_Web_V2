/**
 * ResetPassword — fluxo de redefinição de senha (t_62a7ee39).
 *
 * Prova o comportamento real da tela: link sem sessão não mostra o formulário,
 * senha fraca e confirmação diferente barram antes de chamar o Supabase, e o
 * caminho feliz chama `auth.updateUser` com a senha digitada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => h.getSession(...a),
      updateUser: (...a: unknown[]) => h.updateUser(...a),
      onAuthStateChange: (...a: unknown[]) => h.onAuthStateChange(...a),
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ResetPassword from '../ResetPassword';

function Rotas() {
  return useRoutes([
    { path: '/reset-password', element: <ResetPassword /> },
    { path: '/auth', element: <div>TELA LOGIN</div> },
    { path: '/forgot-password', element: <div>TELA PEDIR LINK</div> },
  ]);
}

function cenario() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Rotas />
    </MemoryRouter>,
  );
}

const SENHA = 'Senha@Forte1';

async function preencher(senha: string, confirmacao = senha) {
  await screen.findByLabelText('Nova Senha');
  fireEvent.change(screen.getByLabelText('Nova Senha'), { target: { value: senha } });
  fireEvent.change(screen.getByLabelText('Confirmar Senha'), { target: { value: confirmacao } });
  fireEvent.click(screen.getByRole('button', { name: /Alterar Senha/i }));
}

beforeEach(() => {
  h.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  h.updateUser.mockResolvedValue({ error: null });
  h.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ResetPassword — link e pré-condições', () => {
  it('sem sessão mostra "Link Inválido" e NÃO mostra o formulário', async () => {
    h.getSession.mockResolvedValue({ data: { session: null } });
    cenario();

    expect(await screen.findByText('Link Inválido')).toBeTruthy();
    expect(screen.queryByLabelText('Nova Senha')).toBeNull();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('"Solicitar novo link" leva para /forgot-password', async () => {
    h.getSession.mockResolvedValue({ data: { session: null } });
    cenario();

    fireEvent.click(await screen.findByRole('button', { name: /Solicitar novo link/i }));
    expect(await screen.findByText('TELA PEDIR LINK')).toBeTruthy();
  });

  it('com sessão de recuperação mostra o formulário "Nova Senha"', async () => {
    cenario();
    expect(await screen.findByLabelText('Nova Senha')).toBeTruthy();
  });
});

describe('ResetPassword — validação antes do Supabase', () => {
  it('senha fraca é barrada e updateUser não é chamado', async () => {
    cenario();
    await preencher('fraca');

    expect((await screen.findAllByText('Mínimo 8 caracteres')).length).toBeGreaterThan(0);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('confirmação diferente é barrada e updateUser não é chamado', async () => {
    cenario();
    await preencher(SENHA, 'Outra@Forte9');

    expect(await screen.findByText('As senhas não coincidem')).toBeTruthy();
    expect(h.updateUser).not.toHaveBeenCalled();
  });
});

describe('ResetPassword — envio', () => {
  it('chama updateUser com a senha digitada e mostra sucesso', async () => {
    cenario();
    await preencher(SENHA);

    await waitFor(() => expect(h.updateUser).toHaveBeenCalledWith({ password: SENHA }));
    expect(await screen.findByText('Senha Alterada!')).toBeTruthy();
  });

  it('erro do Supabase é mostrado ao usuário', async () => {
    h.updateUser.mockResolvedValue({ error: { message: 'Token expirado' } });
    cenario();
    await preencher(SENHA);

    // O `error` que o client devolve não é instância de Error: a tela cai no
    // texto genérico (não vaza payload do provedor) e NÃO mostra sucesso.
    expect(await screen.findByText('Erro ao alterar senha')).toBeTruthy();
    expect(screen.queryByText('Senha Alterada!')).toBeNull();
  });
});
