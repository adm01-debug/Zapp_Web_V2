/**
 * t_c3262e42 — redefinir senha com 2º fator e encerrando as outras sessões.
 *
 * Antes:
 *  - a sessão de recuperação é AAL1: com TOTP verificado o GoTrue recusa
 *    `updateUser({ password })` com `insufficient_aal` e a tela só mostrava o
 *    erro cru — não havia como concluir a troca;
 *  - a troca de senha NÃO encerrava as outras sessões: quem estava logado com a
 *    senha antiga continuava dentro.
 *
 * Estes testes renderizam a tela REAL e falham sem a correção.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  getAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => h.getSession(...a),
      updateUser: (...a: unknown[]) => h.updateUser(...a),
      onAuthStateChange: (...a: unknown[]) => h.onAuthStateChange(...a),
      signOut: (...a: unknown[]) => h.signOut(...a),
      mfa: {
        getAuthenticatorAssuranceLevel: (...a: unknown[]) => h.getAssuranceLevel(...a),
        listFactors: (...a: unknown[]) => h.listFactors(...a),
        challenge: (...a: unknown[]) => h.challenge(...a),
        verify: (...a: unknown[]) => h.verify(...a),
      },
    },
    functions: {
      invoke: (...a: unknown[]) => h.invoke(...a),
    },
  },
}));

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

import ResetPassword from '../ResetPassword';
import { toast } from 'sonner';

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
const AVISO_ERRO_AAL = 'Não foi possível confirmar a verificação em duas etapas';

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function preencherESubmeter() {
  fireEvent.change(screen.getByLabelText('Nova Senha'), { target: { value: SENHA } });
  fireEvent.change(screen.getByLabelText('Confirmar Senha'), { target: { value: SENHA } });
  fireEvent.click(screen.getByRole('button', { name: /Alterar Senha/i }));
  await flush();
}

beforeEach(() => {
  h.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  h.updateUser.mockResolvedValue({ error: null });
  h.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  h.signOut.mockResolvedValue({ error: null });
  // Sem 2º fator pendente: a tela libera o formulário (não é isso que estes
  // testes provam; é o piso do cenário).
  h.getAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
  h.listFactors.mockResolvedValue({
    data: { totp: [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'App' }] },
    error: null,
  });
  h.challenge.mockResolvedValue({ data: { id: 'ch1' }, error: null });
  h.verify.mockResolvedValue({ data: { access_token: 'tok2' }, error: null });
  h.invoke.mockResolvedValue({ data: { revoked_sessions: 2 }, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ResetPassword — 2º fator antes de gravar a senha (t_c3262e42)', () => {
  it('com TOTP pendente mostra o desafio e NÃO o formulário de senha', async () => {
    h.getAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } });

    cenario();

    // Prazo de 5 s (o padrão de 1 s estoura com o runner do CI carregado): só dá mais tempo, não relaxa nada.
    expect(await screen.findByText('Confirme o 2º fator', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByLabelText('Nova Senha')).toBeNull();

    // O MFAVerify carrega os fatores de forma assíncrona e só verifica um fator já carregado:
    // digitar antes disso (o runner do CI é mais lento que o notebook) cai em 'Nenhum fator MFA encontrado'.
    await waitFor(() => expect(h.listFactors).toHaveBeenCalled());
    await flush();

    // O código do autenticador destrava o formulário.
    fireEvent.change(screen.getByLabelText('Código de Verificação'), { target: { value: '123456' } });

    expect(await screen.findByLabelText('Nova Senha', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText('Confirme o 2º fator')).toBeNull();
    expect(h.verify).toHaveBeenCalledWith({ factorId: 'f1', challengeId: 'ch1', code: '123456' });
  });

  it('leva ao desafio quando o GoTrue responde insufficient_aal (e não afirma sucesso)', async () => {
    h.updateUser.mockResolvedValue({
      error: { code: 'insufficient_aal', message: 'AAL2 session is required to update the password' },
    });

    cenario();
    await screen.findByLabelText('Nova Senha');
    await preencherESubmeter();

    expect(await screen.findByText('Confirme o 2º fator')).toBeTruthy();
    expect(screen.queryByText('Senha Alterada!')).toBeNull();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('sem conseguir ler o nível de garantia não grava a senha e oferece tentar de novo', async () => {
    h.getAssuranceLevel.mockResolvedValue(null);

    cenario();

    expect(await screen.findByText(AVISO_ERRO_AAL)).toBeTruthy();
    expect(screen.queryByLabelText('Nova Senha')).toBeNull();

    // A nova tentativa, agora com a leitura funcionando, destrava a tela.
    h.getAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByLabelText('Nova Senha')).toBeTruthy();
  });
});

describe('ResetPassword — encerra as outras sessões (t_c3262e42)', () => {
  it('depois da troca encerra as outras sessões e avisa na tela', async () => {
    cenario();
    await screen.findByLabelText('Nova Senha');
    await preencherESubmeter();

    expect(await screen.findByText('Senha Alterada!')).toBeTruthy();
    expect(h.invoke).toHaveBeenCalledWith('revoke-auth-sessions', { body: { scope: 'others' } });
    expect(screen.getByText('As outras sessões desta conta foram encerradas.')).toBeTruthy();
  });

  it('se o encerramento falhar, a falha é visível e o sucesso não é afirmado', async () => {
    h.invoke.mockResolvedValue({ data: null, error: new Error('edge fora do ar') });

    cenario();
    await screen.findByLabelText('Nova Senha');
    await preencherESubmeter();

    expect(await screen.findByText('Senha Alterada!')).toBeTruthy();
    expect(
      screen.getByText(/não foi possível encerrar as outras sessões desta conta/i),
    ).toBeTruthy();
    expect(screen.queryByText('As outras sessões desta conta foram encerradas.')).toBeNull();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Senha alterada, mas não foi possível encerrar as outras sessões.',
      ),
    );
    expect(toast.success).not.toHaveBeenCalledWith(
      'Senha alterada com sucesso! As outras sessões foram encerradas.',
    );
  });
});

// A tela de troca de senha aberta de dentro do app (SecuritySettingsPanel →
// change_password) é a MESMA: sessão sem 2º fator pendente libera o formulário
// sem passar por "Link Inválido".
describe('ResetPassword — entrada logada (change_password) usa a mesma tela (t_c3262e42)', () => {
  it('com sessão já existente mostra o formulário, não "Link Inválido"', async () => {
    h.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    cenario();

    expect(await screen.findByLabelText('Nova Senha')).toBeTruthy();
    expect(screen.queryByText('Link Inválido')).toBeNull();
    expect(toast).toBeDefined();
  });
});
