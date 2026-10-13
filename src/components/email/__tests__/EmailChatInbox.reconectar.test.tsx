import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Conta = {
  id: string; email_address: string; is_active: boolean;
  sync_status: 'pending' | 'syncing' | 'synced' | 'error' | 'reauth_required';
};

const CONTA_SAUDAVEL: Conta = { id: 'account-1', email_address: 'admin@example.com', is_active: true, sync_status: 'synced' };

const state = vi.hoisted(() => ({
  accounts: [] as Conta[],
  activeAccount: undefined as Conta | undefined,
  lastError: null as string | null,
  lastSyncedAt: null as string | null,
  needsReconnect: false,
  connectGmail: { mutate: vi.fn(), isPending: false },
  syncInbox: { mutate: vi.fn(), isPending: false },
}));

vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    accounts: state.accounts,
    accountsLoading: false,
    accountsError: null,
    activeAccount: state.activeAccount,
    refetchAccounts: vi.fn(),
    connectGmail: state.connectGmail,
    syncInbox: state.syncInbox,
    syncLabels: { mutate: vi.fn(), isPending: false },
    labels: [],
    threads: [],
    threadsLoading: false,
    threadsError: null,
    threadsTotalCount: 0,
    threadsPageCount: 1,
    unreadCount: 0,
    subscribeToThreads: () => vi.fn(),
    requestedThread: null,
    downloadAttachment: { mutate: vi.fn(), isPending: false },
    lastError: state.lastError,
    lastSyncedAt: state.lastSyncedAt,
    needsReconnect: state.needsReconnect,
  }),
}));
vi.mock('@/hooks/integrations/useEmailThreadForContact', () => ({
  useEmailThreadForContact: () => ({ status: 'none', threadId: null }),
}));
vi.mock('../EmailThreadList', () => ({ EmailThreadList: () => <div data-testid="thread-list" /> }));
vi.mock('../EmailChatThread', () => ({ EmailChatThread: () => <div data-testid="thread" /> }));
vi.mock('../EmailContactPanel', () => ({ EmailContactPanel: () => <div data-testid="contact-panel" /> }));
vi.mock('@/components/gmail/EmailComposer', () => ({ EmailComposer: () => <div data-testid="composer" /> }));

import { EmailChatInbox } from '../EmailChatInbox';

// O gatilho do Select (Radix) chama estas APIs no pointerdown que abre a lista;
// o jsdom não as implementa, então o clique nunca chega a abrir o menu.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};

describe('EmailChatInbox — faixa de reconexão do Gmail', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?view=email-chat');
    state.accounts = [CONTA_SAUDAVEL];
    state.activeAccount = CONTA_SAUDAVEL;
    state.lastError = null;
    state.lastSyncedAt = null;
    state.needsReconnect = false;
    state.connectGmail.mutate.mockClear();
    state.syncInbox.mutate.mockClear();
  });

  it('não mostra faixa quando a conta está saudável', () => {
    render(<EmailChatInbox />);
    expect(screen.queryByTestId('gmail-sync-banner')).not.toBeInTheDocument();
  });

  it('avisa a reconexão necessária e reconecta em um clique', () => {
    state.needsReconnect = true;
    state.activeAccount = { ...CONTA_SAUDAVEL, sync_status: 'reauth_required' };
    render(<EmailChatInbox />);

    const faixa = screen.getByRole('alert');
    expect(faixa).toHaveTextContent('Sua conta Gmail precisa ser reconectada');

    fireEvent.click(within(faixa).getByRole('button', { name: 'Reconectar' }));
    expect(state.connectGmail.mutate).toHaveBeenCalledTimes(1);
  });

  it('trata falha transitória como aviso mais brando e permite tentar de novo', () => {
    state.lastError = 'Não foi possível falar com o Gmail';
    state.lastSyncedAt = '2026-10-13T10:00:00.000Z';
    render(<EmailChatInbox />);

    const faixa = screen.getByRole('status');
    expect(faixa).toHaveTextContent('Falha ao sincronizar sua conta Gmail');
    expect(faixa).toHaveTextContent('Não foi possível falar com o Gmail');
    // Não é o alerta de reconexão: nada de aviso assertivo para erro passageiro.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(within(faixa).getByRole('button', { name: 'Tentar novamente' }));
    expect(state.syncInbox.mutate).toHaveBeenCalledTimes(1);
  });

  it('informa há quanto tempo ocorreu a última sincronização', () => {
    state.needsReconnect = true;
    state.lastSyncedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(<EmailChatInbox />);

    expect(screen.getByRole('alert')).toHaveTextContent('Última sincronização há cerca de 2 horas');
  });

  it('mostra o estado de cada conta no seletor', () => {
    const financeiro: Conta = { id: 'account-2', email_address: 'financeiro@example.com', is_active: true, sync_status: 'synced' };
    state.accounts = [{ ...CONTA_SAUDAVEL, sync_status: 'reauth_required' }, financeiro];
    state.activeAccount = state.accounts[0];
    render(<EmailChatInbox />);

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Conta de email ativa' }), {
      button: 0, ctrlKey: false, pointerType: 'mouse',
    });

    expect(screen.getByRole('option', { name: 'admin@example.com — precisa reconectar' })).toBeInTheDocument();
    // Conta saudável não ganha sufixo de estado.
    expect(screen.getByRole('option', { name: 'financeiro@example.com' })).toBeInTheDocument();
  });
});
