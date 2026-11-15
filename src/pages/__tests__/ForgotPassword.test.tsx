/**
 * Testes de `src/pages/ForgotPassword.tsx` — a tela "Esqueceu sua senha?" (P0 do
 * esqueci a senha, fluxo de solicitação aprovada pelo gestor).
 *
 * Como se prova aqui: a tela REAL é renderizada e a única fronteira dublada é o
 * banco. Quem esqueceu a senha não está logado (anon): não lê `profiles` nem sabe
 * o próprio user_id. A tela grava em `password_reset_requests` SÓ email/motivo/
 * navegador; o gatilho `sanitize_reset_request()` (migration 20261015182400)
 * resolve a conta no servidor e ignora e-mail sem conta, sem erro. A LIBERAÇÃO da
 * senha continua com o gestor (painel de pedidos + Edge approve-password-reset).
 *
 * Regras de produto que estes testes travam:
 *  - email inválido não gera chamada ao banco;
 *  - a tela NUNCA consulta `profiles` e NUNCA manda user_id (quem resolve é o servidor);
 *  - email válido grava email, motivo opcional e `user_agent`, e mostra a mesma tela
 *    de enviado (não revela se o e-mail existe);
 *  - falha ao gravar aparece como erro, não como "enviado".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({
  insert: vi.fn(),
  tabelas: [] as string[],
  toast: { success: vi.fn(), error: vi.fn() },
  auth: { user: null as null | { email?: string }, loading: false, signOut: vi.fn() },
  // Reautenticação dublada: guarda a ação pedida e o que roda depois da senha aceita.
  reauth: { acoes: [] as string[], depois: null as null | (() => Promise<void>) },
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => h.auth }));

vi.mock('@/hooks/auth/useReauthentication', () => ({
  useReauthentication: () => ({
    showReauthDialog: false,
    pendingAction: null,
    requireReauth: (acao: string, depois: () => Promise<void>) => {
      h.reauth.acoes.push(acao);
      h.reauth.depois = depois;
    },
    confirmReauth: vi.fn(),
    cancelReauth: vi.fn(),
    getActionLabel: () => '',
    isReauthenticating: false,
  }),
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (table: string) => {
    h.tabelas.push(table);
    if (table !== 'password_reset_requests') throw new Error(`tabela inesperada na tela: ${table}`);
    return { insert: (...a: unknown[]) => h.insert(...a) };
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

function Onde() {
  const loc = useLocation();
  return <div data-testid="onde">{loc.pathname + loc.search}</div>;
}

function cenario() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Onde />} />
      </Routes>
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
  h.tabelas.length = 0;
  h.auth = { user: null, loading: false, signOut: vi.fn().mockResolvedValue(undefined) };
  h.reauth = { acoes: [], depois: null };
  h.insert.mockResolvedValue({ error: null });
});

describe('ForgotPassword — validação', () => {
  it('email inválido mostra a mensagem e não chega a chamar o banco', async () => {
    cenario();
    preencherEEnviar('nao-e-email');

    expect(await screen.findByText('Email inválido')).toBeTruthy();
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.tabelas).toEqual([]);
    expect(screen.queryByText('Solicitação Enviada!')).toBeNull();
  });
});

describe('ForgotPassword — pedido resolvido no servidor', () => {
  it('grava só e-mail, motivo nulo quando vazio e user_agent — sem user_id e sem ler profiles', async () => {
    cenario();
    preencherEEnviar('ana@empresa.com');

    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    expect(h.insert).toHaveBeenCalledTimes(1);
    expect(h.insert).toHaveBeenCalledWith({
      email: 'ana@empresa.com',
      reason: null,
      user_agent: navigator.userAgent,
    });
    expect(h.tabelas).toEqual(['password_reset_requests']);
    expect(h.toast.success).toHaveBeenCalledWith(MSG_ENVIADO);
  });

  it('leva o motivo preenchido no pedido', async () => {
    cenario();
    preencherEEnviar('ana@empresa.com', 'Esqueci após as férias');

    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    const [pedido] = h.insert.mock.calls[0] as [Record<string, unknown>];
    expect(pedido.reason).toBe('Esqueci após as férias');
    expect('user_id' in pedido).toBe(false);
  });

  it('não revela se o e-mail existe: a resposta da tela é a mesma (o gatilho descarta e-mail sem conta sem erro)', async () => {
    cenario();
    preencherEEnviar('ninguem@empresa.com');

    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    expect(h.toast.success).toHaveBeenCalledWith(MSG_ENVIADO);
  });

  it('falha ao gravar aparece como erro e NÃO como enviado', async () => {
    h.insert.mockResolvedValue({ error: new Error('insert recusado') });
    cenario();
    preencherEEnviar('ana@empresa.com');

    expect(await screen.findByText('Erro ao enviar solicitação. Tente novamente.')).toBeTruthy();
    expect(screen.queryByText('Solicitação Enviada!')).toBeNull();
    expect(h.toast.error).toHaveBeenCalledWith('Erro ao enviar solicitação');
  });
});

describe('ForgotPassword — envio único', () => {
  it('dois submits antes da resposta gravam UM pedido só', async () => {
    let responder!: (v: unknown) => void;
    h.insert.mockReturnValue(new Promise((r) => { responder = r; }));
    cenario();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@empresa.com' } });
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    responder({ error: null });

    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    expect(h.insert).toHaveBeenCalledTimes(1);
  });
});

describe('ForgotPassword — usuário já logado', () => {
  it('mostra o aviso e não oferece o formulário nem grava pedido', () => {
    h.auth = { ...h.auth, user: { email: 'ana@empresa.com' } };
    cenario();

    expect(screen.getByText('Você já está conectado')).toBeTruthy();
    expect(screen.getByText('ana@empresa.com')).toBeTruthy();
    expect(document.querySelector('form')).toBeNull();
    expect(h.tabelas).toEqual([]);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('"Alterar minha senha" não manda para a tela de Segurança (só gestor): pede reautenticação e leva a /reset-password', async () => {
    // Regressão: o botão levava a /?view=security, view restrita a STAFF_ROLES —
    // o atendente comum caía em "acesso restrito" e não tinha como trocar a senha.
    h.auth = { ...h.auth, user: { email: 'ana@empresa.com' } };
    cenario();

    expect(screen.queryByRole('link', { name: /Segurança/ })).toBeNull();
    expect(document.querySelector('a[href*="view=security"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Alterar minha senha' }));
    // Antes da senha atual ser confirmada, nada de navegar.
    expect(h.reauth.acoes).toEqual(['change_password']);
    expect(screen.queryByTestId('onde')).toBeNull();

    await act(async () => {
      await h.reauth.depois?.();
    });
    expect(screen.getByTestId('onde').textContent).toBe('/reset-password');
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('"Sair desta conta" encerra a sessão (para quem quer pedir o reset de outra conta)', async () => {
    h.auth = { ...h.auth, user: { email: 'ana@empresa.com' } };
    cenario();
    fireEvent.click(screen.getByRole('button', { name: 'Sair desta conta' }));
    await vi.waitFor(() => expect(h.auth.signOut).toHaveBeenCalledTimes(1));
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('com a sessão ainda carregando, o botão fica desabilitado e o submit não grava', () => {
    h.auth = { ...h.auth, loading: true };
    cenario();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@empresa.com' } });
    expect((screen.getByRole('button', { name: /Solicitar Reset de Senha/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(document.querySelector('form')!);
    expect(h.insert).not.toHaveBeenCalled();
  });
});

describe('ForgotPassword — texto e acessibilidade', () => {
  it('a tela fala em "gestor", igual ao aviso de envio (nenhum "administrador")', async () => {
    cenario();
    expect(document.body.textContent).not.toMatch(/administrador/i);
    preencherEEnviar('ana@empresa.com');
    expect(await screen.findByText('Solicitação Enviada!')).toBeTruthy();
    expect(document.body.textContent).toContain('O gestor irá analisar sua solicitação');
    expect(document.body.textContent).not.toMatch(/administrador/i);
  });

  it('erro de validação é anunciado (role=alert) e ligado ao campo (aria-invalid/aria-describedby)', async () => {
    cenario();
    preencherEEnviar('nao-e-email');
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe('Email inválido');
    const campo = screen.getByLabelText('Email');
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toBe(alerta.id);
  });
});
