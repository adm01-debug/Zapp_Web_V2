import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GmailIntegrationCard } from '../GmailIntegrationCard';
import type { GmailAccount } from '@/hooks/integrations/useGmail';

// R2-API-059: conta ausente só pode ser lida como "Desconectado" quando a
// consulta terminou bem. Carregando / falhou são estados próprios.

const refetchAccounts = vi.fn();
const syncInboxMutate = vi.fn();
const connectGmailMutate = vi.fn();
const disconnectGmailMutate = vi.fn();

const config: {
  activeAccount: GmailAccount | null;
  accountsLoading: boolean;
  accountsError: Error | null;
} = {
  activeAccount: null,
  accountsLoading: false,
  accountsError: null,
};

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    activeAccount: config.activeAccount,
    accountsLoading: config.accountsLoading,
    accountsError: config.accountsError,
    refetchAccounts,
    disconnectGmail: { mutate: disconnectGmailMutate },
    syncInbox: { mutate: syncInboxMutate, isPending: false },
    connectGmail: { mutate: connectGmailMutate, isPending: false },
  }),
}));

const account: GmailAccount = {
  id: 'acc1',
  email_address: 'contato@promobrindes.com.br',
  is_active: true,
  sync_status: 'synced',
  last_sync_at: null,
  last_error: null,
  created_at: '2026-10-01T00:00:00Z',
} as GmailAccount;

describe('GmailIntegrationCard — falha de consulta (R2-API-059)', () => {
  beforeEach(() => {
    config.activeAccount = null;
    config.accountsLoading = false;
    config.accountsError = null;
    refetchAccounts.mockClear();
  });

  it('enquanto a consulta carrega, não afirma "Desconectado" e não oferece reconectar', () => {
    config.accountsLoading = true;
    render(<GmailIntegrationCard />);
    expect(screen.getByText('Verificando conta...')).toBeInTheDocument();
    expect(screen.queryByText('Desconectado')).not.toBeInTheDocument();
    expect(screen.queryByText('Não conectado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /conectar gmail/i })).not.toBeInTheDocument();
  });

  it('falha na consulta: mostra indisponível com recuperação, sem alegar desconexão', () => {
    config.accountsError = new Error('JWT expired');
    render(<GmailIntegrationCard />);
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível verificar a conexão')).toBeInTheDocument();
    expect(screen.getByText(/A conta pode continuar conectada/)).toBeInTheDocument();
    expect(screen.queryByText('Desconectado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /conectar gmail/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(refetchAccounts).toHaveBeenCalledTimes(1);
  });

  it('consulta bem-sucedida sem conta: aí sim mostra desconectado e o botão de conectar', () => {
    render(<GmailIntegrationCard />);
    expect(screen.getByText('Desconectado')).toBeInTheDocument();
    expect(screen.getByText('Não conectado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /conectar gmail/i })).toBeInTheDocument();
  });

  it('conta ativa continua mostrando conectado e o e-mail', () => {
    config.activeAccount = account;
    render(<GmailIntegrationCard />);
    expect(screen.getByText('Conectado')).toBeInTheDocument();
    expect(screen.getByText('contato@promobrindes.com.br')).toBeInTheDocument();
  });
});
