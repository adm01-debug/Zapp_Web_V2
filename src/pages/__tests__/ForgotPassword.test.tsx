/**
 * Testes de `src/pages/ForgotPassword.tsx` — a tela "Esqueceu sua senha?" (P0 do
 * esqueci a senha, fluxo de solicitação aprovada pelo gestor).
 *
 * Como se prova aqui: a tela REAL é renderizada e a única fronteira dublada é o
 * banco. Quem esqueceu a senha não está logado (anon): ele não lê `profiles` nem
 * grava em `password_reset_requests` (RLS). O pedido é criado no servidor pela RPC
 * `request_password_reset` (migration 20261111140000), que responde igual exista
 * ou não o e-mail. A LIBERAÇÃO da senha continua com o gestor (painel de pedidos +
 * Edge approve-password-reset).
 *
 * Regras de produto que estes testes travam:
 *  - email inválido não gera chamada ao banco;
 *  - a tela NUNCA consulta `profiles` nem grava direto em `password_reset_requests`;
 *  - email válido chama a RPC com e-mail, motivo opcional e `user_agent`, e mostra
 *    a mesma tela de enviado (não revela se o e-mail existe);
 *  - falha da RPC aparece como erro, não como "enviado".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    from: (table: string) => {
      h.from(table);
      throw new Error(`a tela não deve acessar a tabela ${table} direto`);
    },
  },
}));

vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));

import ForgotPassword from '../ForgotPassword';

const MSG_ENVIADO = 'Se o email estiver cadastrado, o pedido foi enviado para aprovação do gestor.';

function cenario() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <ForgotPassword />
    </MemoryRouter>,
  );
}

function preencherEEnviar(email: string, motivo?: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  if (motivo !== undefined) {
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: motivo } });
  }
  const form = document.querySelector('form');
  if (!form) throw new Error('formulário não renderizado');
  fireEvent.submit(form);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.rpc.mockResolvedValue({ data: null, error: null });
});

describe('ForgotPassword — validação', () => {
  it('email inválido mostra a mensagem e não chega a chamar o banco', async () => {
    cenario();
    preencherEEnviar('nao-e-email');

    expect(await screen.findByText('Email inválido')).toBeTruthy();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.from).not.toHaveBeenCalled();
    expect(screen.queryByText('Solicitação Enviada!')).toBeNull();
  });
});

describe('ForgotPassword — pedido pelo servidor', () => {
  it('chama request_password_reset com e-mail, motivo nulo quando vazio e user_agent', async () => {
    cenario();
    preencherEEnviar('ana@empresa.com');

    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith('request_password_reset', {
      p_email: 'ana@empresa.com',
      p_reason: null,
      p_user_agent: navigator.userAgent,
    });
    expect(h.from).not.toHaveBeenCalled();
    expect(h.toast.success).toHaveBeenCalledWith(MSG_ENVIADO);
  });

  it('leva o motivo preenchido no pedido', async () => {
    cenario();
    preencherEEnviar('ana@empresa.com', 'Esqueci após as férias');

    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    const [, args] = h.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_reason).toBe('Esqueci após as férias');
  });

  it('não revela se o e-mail existe: a resposta da tela é a mesma (a RPC devolve void nos dois casos)', async () => {
    cenario();
    preencherEEnviar('ninguem@empresa.com');

    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    expect(h.toast.success).toHaveBeenCalledWith(MSG_ENVIADO);
  });

  it('falha da RPC aparece como erro e NÃO como enviado', async () => {
    h.rpc.mockResolvedValue({ data: null, error: new Error('rpc recusada') });
    cenario();
    preencherEEnviar('ana@empresa.com');

    expect(await screen.findByText('Erro ao enviar solicitação. Tente novamente.')).toBeTruthy();
    expect(screen.queryByText('Solicitação Enviada!')).toBeNull();
    expect(h.toast.error).toHaveBeenCalledWith('Erro ao enviar solicitação');
  });
});
