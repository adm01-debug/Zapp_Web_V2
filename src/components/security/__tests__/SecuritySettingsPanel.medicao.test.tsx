import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// R2-AUTH-024 (mesma falha, segundo consumidor apontado pela auditoria):
// SecuritySettingsPanel criava a própria instância de useMFA sem buscar os
// fatores — exibia "Médio"/"Desativado" mesmo com TOTP verificado e também
// enquanto o dado nem havia sido lido.

interface FactorsState {
  data?: Array<{ id: string; factor_type: string; status: string }>;
  isLoading: boolean;
  isError: boolean;
}

const mfaState: { current: FactorsState } = {
  current: { data: [], isLoading: false, isError: false },
};

vi.mock('@/hooks/auth/useMFA', () => ({
  useMfaFactors: () => mfaState.current,
}));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1', email: 'a@b.c' } }) }));
vi.mock('@/hooks/auth/useReauthentication', () => ({
  useReauthentication: () => ({
    showReauthDialog: false,
    pendingAction: null,
    requireReauth: (_a: string, cb: () => void) => cb(),
    confirmReauth: vi.fn(),
    cancelReauth: vi.fn(),
    getActionLabel: () => '',
    isReauthenticating: false,
  }),
}));
vi.mock('@/components/mfa/MFASettings', () => ({ MFASettings: () => null }));
vi.mock('@/components/auth/ReauthDialog', () => ({ ReauthDialog: () => null }));

import { SecuritySettingsPanel } from '../SecuritySettingsPanel';

describe('SecuritySettingsPanel — medição válida de MFA (R2-AUTH-024)', () => {
  beforeEach(() => {
    mfaState.current = { data: [], isLoading: false, isError: false };
  });

  it('com fator verificado mostra nível Alto e a contagem lida', () => {
    mfaState.current = {
      data: [{ id: 'f1', factor_type: 'totp', status: 'verified' }],
      isLoading: false,
      isError: false,
    };

    render(
      <MemoryRouter>
        <SecuritySettingsPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText('Alto')).toBeInTheDocument();
    expect(screen.getByText('1 método(s) configurado(s)')).toBeInTheDocument();
    expect(screen.queryByText('Médio')).toBeNull();
  });

  it('enquanto carrega não afirma nível nem "Desativado"', () => {
    mfaState.current = { data: undefined, isLoading: true, isError: false };

    render(
      <MemoryRouter>
        <SecuritySettingsPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText('Verificando…')).toBeInTheDocument();
    expect(screen.getByText('Verificando os métodos configurados…')).toBeInTheDocument();
    expect(screen.queryByText('Médio')).toBeNull();
    expect(screen.queryByText('Desativado')).toBeNull();
  });

  it('erro na leitura mostra indisponível em vez de desativado', () => {
    mfaState.current = { data: undefined, isLoading: false, isError: true };

    render(
      <MemoryRouter>
        <SecuritySettingsPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText('Indisponível')).toBeInTheDocument();
    expect(
      screen.getByText('Não foi possível ler os métodos configurados; o nível não pôde ser medido'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Desativado')).toBeNull();
    expect(screen.queryByText('Médio')).toBeNull();
  });
});

// t_c3262e42 — o fluxo de troca de senha LOGADO (`change_password`) tem de cair
// na mesma tela que exige o 2º fator e encerra as outras sessões. A navegação
// passou a ser do router: no modo antigo a página inteira recarregava e a tela
// perdia o estado da sessão que ela mesma usa para ler o nível de garantia.
function SondaDaRota() {
  const { pathname } = useLocation();
  return <div>{pathname}</div>;
}

describe('SecuritySettingsPanel — troca de senha logado (change_password)', () => {
  it('leva à tela de troca de senha pela rota', async () => {
    mfaState.current = { data: [], isLoading: false, isError: false };

    render(
      <MemoryRouter initialEntries={['/seguranca']}>
        <SecuritySettingsPanel />
        <SondaDaRota />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Alterar Senha'));

    expect(await screen.findByText('/reset-password')).toBeTruthy();
  });
});
