/**
 * ForgotPassword — solicitação de reset (t_62a7ee39).
 *
 * O ponto de segurança da tela é não revelar se o email existe: usa banco e
 * banco quando o usuário NÃO existe. O teste prova isso comparando o efeito
 * real (insert não chamado / chamado) nos dois ramos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }),
      insert: (...a: unknown[]) => h.insert(...a),
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import ForgotPassword from '../ForgotPassword';

function Rotas() {
  return useRoutes([
    { path: '/forgot-password', element: <ForgotPassword /> },
    { path: '/auth', element: <div>TELA LOGIN</div> },
  ]);
}

function cenario() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Rotas />
    </MemoryRouter>,
  );
}

function submeter(email: string, motivo?: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  if (motivo) fireEvent.change(screen.getByLabelText(/Motivo/i), { target: { value: motivo } });
  // `fireEvent.submit` direto no form: o `input type="email"` tem validação nativa
  // e um click no botão com email malformado nem chega a disparar o onSubmit do React.
  fireEvent.submit(screen.getByRole('button', { name: /Solicitar Reset de Senha/i }).closest('form')!);
}

beforeEach(() => {
  h.maybeSingle.mockResolvedValue({ data: null, error: null });
  h.insert.mockResolvedValue({ error: null });
});

afterEach(() => vi.clearAllMocks());

describe('ForgotPassword — validação', () => {
  it('email inválido é barrado antes de consultar o banco', async () => {
    cenario();
    submeter('nao-e-email');

    expect(await screen.findByText('Email inválido')).toBeTruthy();
    expect(h.maybeSingle).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });
});

describe('ForgotPassword — não revela se o email existe', () => {
  it('email inexistente mostra sucesso sem criar solicitação', async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    cenario();
    submeter('ninguem@exemplo.com');

    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('email existente cria a solicitação com user_id e email corretos', async () => {
    h.maybeSingle.mockResolvedValue({ data: { user_id: 'u-42' }, error: null });
    cenario();
    submeter('existe@exemplo.com', 'esqueci');

    await waitFor(() => expect(h.insert).toHaveBeenCalledTimes(1));
    expect(h.insert.mock.calls[0][0]).toMatchObject({
      user_id: 'u-42',
      email: 'existe@exemplo.com',
      reason: 'esqueci',
    });
    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
  });

  it('motivo vazio vira reason null', async () => {
    h.maybeSingle.mockResolvedValue({ data: { user_id: 'u-7' }, error: null });
    cenario();
    submeter('existe@exemplo.com');

    await waitFor(() => expect(h.insert).toHaveBeenCalledTimes(1));
    expect(h.insert.mock.calls[0][0]).toMatchObject({ user_id: 'u-7', reason: null });
  });
});

describe('ForgotPassword — falha de gravação', () => {
  it('erro do insert mostra o erro e não mostra a tela de enviado', async () => {
    h.maybeSingle.mockResolvedValue({ data: { user_id: 'u-9' }, error: null });
    h.insert.mockResolvedValue({ error: { message: 'RLS negou' } });
    cenario();
    submeter('existe@exemplo.com');

    expect(await screen.findByText('Erro ao enviar solicitação. Tente novamente.')).toBeTruthy();
    expect(screen.queryByText('Solicitação Enviada!')).toBeNull();
  });
});
