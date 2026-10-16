import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// R2-AUTH-024: o overview exibia estado e pontuação SEM medição válida —
// instância própria de useMFA que nunca buscava os fatores (2FA sempre
// "desativado"), 25 pontos fixos para "Senha Forte" e falha na leitura de
// alertas virando "conta segura e sem atividades suspeitas".

interface FactorsState {
  data?: Array<{ id: string; factor_type: string; status: string }>;
  isLoading: boolean;
  isError: boolean;
}

const mfaState: { current: FactorsState } = {
  current: { data: [], isLoading: false, isError: false },
};
const devicesState: {
  devices: Array<{
    id: string;
    is_trusted: boolean;
    device_name?: string;
    browser?: string;
    os?: string;
    ip_address?: string;
    last_seen_at?: string;
  }>;
  sessions: Array<{ id: string }>;
  loading: boolean;
} = { devices: [], sessions: [], loading: false };
const authState: { user: { id: string } | null } = { user: { id: 'u-1' } };
const alertsState: { data: unknown[] | null; error: unknown } = { data: [], error: null };

vi.mock('@/hooks/auth/useMFA', () => ({
  useMfaFactors: () => mfaState.current,
}));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/ui/useDeviceDetection', () => ({ useDeviceDetection: () => devicesState }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ hasRole: () => false }) }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve(alertsState),
          }),
        }),
      }),
    }),
  },
}));

import { SecurityOverview } from '../SecurityOverview';

const verifiedFactor = { id: 'f1', factor_type: 'totp', status: 'verified' };

describe('SecurityOverview — medição válida (R2-AUTH-024)', () => {
  beforeEach(() => {
    mfaState.current = { data: [], isLoading: false, isError: false };
    devicesState.devices = [];
    devicesState.sessions = [];
    devicesState.loading = false;
    authState.user = { id: 'u-1' };
    alertsState.data = [];
    alertsState.error = null;
  });

  it('conta o fator verificado da fonte compartilhada e pontua por ele', async () => {
    mfaState.current = { data: [verifiedFactor], isLoading: false, isError: false };
    devicesState.devices = [
      {
        id: 'd1',
        is_trusted: true,
        device_name: 'Desktop',
        browser: 'Chrome',
        os: 'Windows',
        ip_address: '127.0.0.1',
        last_seen_at: new Date().toISOString(),
      },
    ];
    devicesState.sessions = [{ id: 's1' }];

    render(<SecurityOverview />);

    expect(await screen.findByText('1 método(s) verificado(s)')).toBeInTheDocument();
    expect(screen.getAllByText('25/25')).toHaveLength(3);
    // 25 (MFA) + 25 (dispositivo confiável) + 25 (1 sessão) = 75 — teto sem o item de senha.
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('de 75')).toBeInTheDocument();
  });

  it('conta perfeita (75/75) pinta de sucesso e enche a barra — escala segue o teto', async () => {
    mfaState.current = { data: [verifiedFactor], isLoading: false, isError: false };
    devicesState.devices = [
      {
        id: 'd1',
        is_trusted: true,
        device_name: 'Desktop',
        browser: 'Chrome',
        os: 'Windows',
        ip_address: '127.0.0.1',
        last_seen_at: new Date().toISOString(),
      },
    ];
    devicesState.sessions = [{ id: 's1' }];

    render(<SecurityOverview />);

    // 75/75 é 100% do que a tela mede: verde e barra cheia, não "warning" a 75%.
    const score = await screen.findByLabelText('Pontuação 75 de 75');
    expect(score).toHaveTextContent('75');
    expect(score).toHaveClass('text-success');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('sem fator (leitura concluída) mostra desativado — zero é diferente de erro', async () => {
    render(<SecurityOverview />);

    expect(await screen.findByText('Nenhum método de dois fatores verificado')).toBeInTheDocument();
    expect(screen.getByText('0/25')).toBeInTheDocument();
  });

  it('enquanto os fatores carregam não afirma desativado nem pontua', () => {
    mfaState.current = { data: undefined, isLoading: true, isError: false };

    render(<SecurityOverview />);

    expect(screen.getByText('Verificando os métodos configurados…')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum método de dois fatores verificado')).toBeNull();
    expect(screen.queryByText('0/25')).toBeNull();
    expect(screen.getByText('Medindo as configurações da conta…')).toBeInTheDocument();
  });

  it('erro na leitura dos fatores vira indisponível, nunca zero pontos', async () => {
    mfaState.current = { data: undefined, isLoading: false, isError: true };

    render(<SecurityOverview />);

    expect(await screen.findByText('Não foi possível verificar os fatores de MFA')).toBeInTheDocument();
    expect(
      screen.getByText('Não foi possível medir os fatores de autenticação: pontuação indisponível.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('0/25')).toBeNull();
  });

  it('não afirma força de senha e não dá pontos por ela', async () => {
    render(<SecurityOverview />);

    expect(await screen.findByText('Nenhum método de dois fatores verificado')).toBeInTheDocument();
    expect(
      screen.getByText('Não é medida por esta tela: depende do provedor de autenticação'),
    ).toBeInTheDocument();
    expect(screen.getByText('não medida')).toBeInTheDocument();
    expect(screen.queryByText(/atende aos requisitos/)).toBeNull();
    expect(screen.queryByText('de 100')).toBeNull();
  });

  it('falha ao consultar alertas mostra indisponibilidade, não "conta segura"', async () => {
    alertsState.data = null;
    alertsState.error = { message: 'permission denied' };

    render(<SecurityOverview />);

    expect(await screen.findByText('Não foi possível carregar os alertas')).toBeInTheDocument();
    expect(screen.queryByText(/conta está segura/)).toBeNull();
  });

  it('leitura concluída sem alertas mantém a mensagem de nenhum alerta', async () => {
    render(<SecurityOverview />);

    expect(await screen.findByText('Nenhum alerta recente')).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar os alertas')).toBeNull();
  });
});
