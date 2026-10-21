/**
 * Testes de `src/pages/ForgotPassword.tsx` — a tela "Esqueceu sua senha?" (P0 do
 * esqueci a senha, fluxo de solicitação aprovada por administrador).
 *
 * Como se prova aqui: a tela REAL é renderizada e a única fronteira dublada é o
 * banco (`supabase.from(...)`). O teste dirige o formulário de verdade
 * (digitar + enviar) e confere o que chega ao banco e o que o usuário vê.
 *
 * Regras de produto que estes testes travam:
 *  - email inválido não gera consulta;
 *  - email sem cadastro NÃO revela ausência (mesma tela de enviado) e não grava
 *    pedido nenhum;
 *  - email com cadastro grava o pedido com `user_id`, `email`, motivo opcional e
 *    `user_agent`;
 *  - falha ao gravar aparece como erro, não como "enviado".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  profilesMaybeSingle: vi.fn(),
  resetInsert: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: (...a: unknown[]) => h.profilesMaybeSingle(...a) }) }) };
      }
      if (table === 'password_reset_requests') {
        return { insert: (...a: unknown[]) => h.resetInsert(...a) };
      }
      throw new Error(`tabela inesperada na tela: ${table}`);
    },
  },
}));

vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import ForgotPassword from '../ForgotPassword';

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
  h.profilesMaybeSingle.mockResolvedValue({ data: null, error: null });
  h.resetInsert.mockResolvedValue({ error: null });
});

describe('ForgotPassword — validação', () => {
  it('email inválido mostra a mensagem e não chega a consultar o banco', async () => {
    cenario();
    preencherEEnviar('sem-arroba');

    expect(await screen.findByText('Email inválido')).toBeTruthy();
    expect(h.profilesMaybeSingle).not.toHaveBeenCalled();
    expect(h.resetInsert).not.toHaveBeenCalled();
    expect(screen.queryByText('Solicitação Enviada!')).toBeNull();
  });
});

describe('ForgotPassword — email sem cadastro', () => {
  it('não revela a ausência: mostra a tela de enviado e não grava pedido', async () => {
    cenario();
    preencherEEnviar('ninguem@exemplo.com');

    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    expect(h.profilesMaybeSingle).toHaveBeenCalledTimes(1);
    expect(h.resetInsert).not.toHaveBeenCalled();
    // O texto não confirma nem nega o cadastro.
    expect(h.toast.success).toHaveBeenCalledWith('Se o email existir, sua solicitação será analisada.');
  });
});

describe('ForgotPassword — email com cadastro', () => {
  beforeEach(() => {
    h.profilesMaybeSingle.mockResolvedValue({ data: { user_id: 'u-1' }, error: null });
  });

  it('grava o pedido com user_id, email, user_agent e motivo nulo quando vazio', async () => {
    cenario();
    preencherEEnviar('maria@exemplo.com');

    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    expect(h.resetInsert).toHaveBeenCalledTimes(1);
    expect(h.resetInsert).toHaveBeenCalledWith({
      user_id: 'u-1',
      email: 'maria@exemplo.com',
      reason: null,
      ip_address: null,
      user_agent: navigator.userAgent,
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      'Solicitação enviada! Aguarde a aprovação de um administrador.',
    );
  });

  it('leva o motivo preenchido no pedido', async () => {
    cenario();
    preencherEEnviar('maria@exemplo.com', 'Esqueci após as férias');

    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    const pedido = h.resetInsert.mock.calls[0][0] as { reason: string };
    expect(pedido.reason).toBe('Esqueci após as férias');
  });

  it('falha ao gravar aparece como erro e NÃO como enviado', async () => {
    h.resetInsert.mockResolvedValue({ error: new Error('insert recusado') });

    cenario();
    preencherEEnviar('maria@exemplo.com');

    expect(await screen.findByText('Erro ao enviar solicitação. Tente novamente.')).toBeTruthy();
    expect(screen.queryByText('Solicitação Enviada!')).toBeNull();
    expect(h.toast.error).toHaveBeenCalledWith('Erro ao enviar solicitação');
    // O formulário continua disponível para tentar de novo.
    expect(screen.getByRole('button', { name: /Solicitar Reset de Senha/ })).toBeTruthy();
  });
});

describe('ForgotPassword — falha inesperada da consulta', () => {
  it('a consulta que estoura também cai no erro visível, sem tela de enviado', async () => {
    h.profilesMaybeSingle.mockRejectedValue(new Error('rede caiu'));

    cenario();
    preencherEEnviar('maria@exemplo.com');

    await waitFor(() =>
      expect(screen.getByText('Erro ao enviar solicitação. Tente novamente.')).toBeTruthy(),
    );
    expect(screen.queryByText('Solicitação Enviada!')).toBeNull();
  });
});
