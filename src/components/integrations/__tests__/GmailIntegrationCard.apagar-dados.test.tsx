/**
 * t_8b39959f (PM-48) — limpeza dos e-mails guardados de uma conta Gmail
 * DESCONECTADA, por acao explicita do ADMIN.
 *
 * Renderiza o componente REAL com o hook REAL (useGmailDataPurge): o unico mock
 * e o client do Supabase, entao o teste prova tambem o CONTRATO com o banco —
 * as contagens lidas antes e o RPC chamado com `p_account_id`/`p_confirm`
 * (migration 20261016033451, linhas 46-77).
 *
 * Cobre: quem nao e admin nao ve o gatilho; conta ATIVA nao oferece limpeza; o
 * dialogo mostra as contagens; so habilita depois do e-mail EXATO; o resultado
 * e confirmado na tela; foco inicial em Cancelar; falha explica o motivo.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { GmailAccount } from '@/hooks/integrations/useGmail';
import type { GmailPurgeResult } from '@/hooks/integrations/useGmailDataPurge';

const roleState = vi.hoisted(() => ({ isAdmin: true }));
const accountsState = vi.hoisted(() => ({ accounts: [] as GmailAccount[] }));

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    accounts: accountsState.accounts,
    activeAccount: accountsState.accounts.find((conta) => conta.is_active) ?? null,
    accountsLoading: false,
    accountsError: null,
    refetchAccounts: vi.fn(),
    disconnectGmail: { mutate: vi.fn() },
    syncInbox: { mutate: vi.fn(), isPending: false },
    connectGmail: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    isAdmin: roleState.isAdmin,
    isSupervisor: roleState.isAdmin,
    roles: roleState.isAdmin ? ['admin'] : ['agent'],
    loading: false,
  }),
}));

import { GmailIntegrationCard } from '../GmailIntegrationCard';

const EMAIL_DESCONECTADA = 'vendas@promobrindes.com.br';

const contaDesconectada = {
  id: 'acc-off-1',
  email_address: EMAIL_DESCONECTADA,
  is_active: false,
  sync_status: 'idle',
  last_sync_at: null,
  last_error: null,
  created_at: '2026-09-01T00:00:00Z',
} as unknown as GmailAccount;

const contaAtiva = { ...contaDesconectada, id: 'acc-on-1', is_active: true } as unknown as GmailAccount;

const resultado: GmailPurgeResult = {
  account_id: 'acc-off-1',
  email_masked: 'v***@***',
  deleted: { email_attachments: 27, email_messages: 340, email_threads: 12, email_drafts: 0 },
  total_rows: 379,
};

/** Contagens que `email_threads` / `email_messages` / `email_attachments` devolvem. */
function contagens(valores: Record<string, number> = { email_threads: 12, email_messages: 340, email_attachments: 27 }) {
  supabaseMock.from.mockImplementation((tabela: string) => ({
    select: () => ({ eq: () => Promise.resolve({ count: valores[tabela] ?? 0, error: null }) }),
  }));
}

function contagensFalhando() {
  supabaseMock.from.mockImplementation(() => ({
    select: () => ({ eq: () => Promise.resolve({ count: null, error: new Error('sem leitura das contagens') }) }),
  }));
}

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<GmailIntegrationCard />, { wrapper });
}

const gatilho = () => screen.queryByRole('button', { name: /apagar dados de e-mail/i });

async function abrirDialogo() {
  fireEvent.click(gatilho() as HTMLElement);
  return screen.findByRole('dialog');
}

beforeEach(() => {
  roleState.isAdmin = true;
  accountsState.accounts = [contaDesconectada];
  supabaseMock.from.mockReset();
  supabaseMock.rpc.mockReset();
  contagens();
  supabaseMock.rpc.mockResolvedValue({ data: resultado, error: null });
});

describe('GmailIntegrationCard — limpeza dos dados guardados (PM-48)', () => {
  it('conta ATIVA nao oferece limpeza, nem para admin (o RPC recusa conta ativa)', () => {
    accountsState.accounts = [contaAtiva];
    renderizar();
    expect(gatilho()).not.toBeInTheDocument();
  });

  it('nao admin nao ve o gatilho mesmo com conta desconectada', () => {
    roleState.isAdmin = false;
    renderizar();
    expect(gatilho()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apagar definitivamente/i })).not.toBeInTheDocument();
  });

  it('admin abre o dialogo e ve as contagens lidas do banco', async () => {
    renderizar();
    await abrirDialogo();

    expect(await screen.findByText('Conversas:')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('340')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();
    expect(screen.getAllByText(EMAIL_DESCONECTADA).length).toBeGreaterThan(0);
  });

  it('contagem indisponivel nao trava o dialogo: avisa e mantem a confirmacao', async () => {
    contagensFalhando();
    renderizar();
    await abrirDialogo();

    expect(await screen.findByText(/N[ãa]o foi poss[íi]vel contar os dados guardados/)).toBeInTheDocument();
    expect(screen.getByLabelText(/para confirmar/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apagar definitivamente/i })).toBeDisabled();
  });

  it('o foco inicial cai em Cancelar', async () => {
    renderizar();
    const dialogo = await abrirDialogo();
    const cancelar = within(dialogo).getByRole('button', { name: /cancelar/i });
    await waitFor(() => expect(document.activeElement).toBe(cancelar));
  });

  it('so habilita o botao destrutivo com o e-mail EXATO da conta', async () => {
    renderizar();
    await abrirDialogo();
    await screen.findByText('Conversas:');

    const confirmar = screen.getByRole('button', { name: /apagar definitivamente/i });
    const campo = screen.getByLabelText(/para confirmar/i);
    expect(confirmar).toBeDisabled();

    fireEvent.change(campo, { target: { value: 'outro@promobrindes.com.br' } });
    expect(confirmar).toBeDisabled();

    // O RPC compara com `IS DISTINCT FROM email_address` (linha 77 da migration):
    // espaco sobrando e caixa alta contam como texto errado.
    fireEvent.change(campo, { target: { value: `${EMAIL_DESCONECTADA} ` } });
    expect(confirmar).toBeDisabled();
    fireEvent.change(campo, { target: { value: EMAIL_DESCONECTADA.toUpperCase() } });
    expect(confirmar).toBeDisabled();

    fireEvent.change(campo, { target: { value: EMAIL_DESCONECTADA } });
    expect(confirmar).toBeEnabled();
  });

  it('confirmar chama o RPC com a conta e o e-mail digitado, e confirma o resultado', async () => {
    renderizar();
    await abrirDialogo();
    await screen.findByText('Conversas:');

    fireEvent.change(screen.getByLabelText(/para confirmar/i), { target: { value: EMAIL_DESCONECTADA } });
    fireEvent.click(screen.getByRole('button', { name: /apagar definitivamente/i }));

    await waitFor(() =>
      expect(supabaseMock.rpc).toHaveBeenCalledWith('purge_gmail_account_data', {
        p_account_id: 'acc-off-1',
        p_confirm: EMAIL_DESCONECTADA,
      }),
    );
    expect(await screen.findByText('Limpeza concluída.')).toBeInTheDocument();
    expect(screen.getByText('379')).toBeInTheDocument();
  });

  it('Cancelar fecha o dialogo sem chamar o RPC', async () => {
    renderizar();
    const dialogo = await abrirDialogo();
    fireEvent.click(within(dialogo).getByRole('button', { name: /cancelar/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('falha do RPC (admin_required) explica o motivo e nao fecha o dialogo', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'admin_required' } });
    renderizar();
    await abrirDialogo();
    await screen.findByText('Conversas:');

    fireEvent.change(screen.getByLabelText(/para confirmar/i), { target: { value: EMAIL_DESCONECTADA } });
    fireEvent.click(screen.getByRole('button', { name: /apagar definitivamente/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/S[oó] administradores podem apagar os dados de e-mail/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
