import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import {
  BackendStatusBanner,
  DegradedConnectionsBanner,
  GlobalConnectionBanners,
} from '@/components/ui/global-connection-banners';

const h = vi.hoisted(() => ({
  degraded: [] as Array<{ id: string; label: string; lastHealthCheck: number }>,
  role: { isSupervisor: true },
  backend: {
    status: 'unknown' as string,
    restored: false,
    checking: false,
    checkNow: vi.fn(),
  },
}));

vi.mock('@/hooks/connections/useDegradedConnections', () => ({
  useDegradedConnections: () => ({ degraded: h.degraded, loading: false, error: null }),
}));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => h.role }));
vi.mock('@/hooks/system/useBackendHealth', () => ({ useBackendHealth: () => h.backend }));

describe('DegradedConnectionsBanner (numero instavel)', () => {
  beforeEach(() => {
    h.degraded = [];
    h.role = { isSupervisor: true };
  });

  it('staff com uma conexao degradada ve a faixa com o nome da conexao', () => {
    h.degraded = [{ id: 'c1', label: 'VENDAS-01', lastHealthCheck: Date.now() }];
    render(<DegradedConnectionsBanner />);

    expect(screen.getByTestId('degraded-connections-banner')).toBeInTheDocument();
    expect(screen.getByText('Conexão "VENDAS-01" está instável')).toBeInTheDocument();
    expect(screen.getByText('Saúde degradada nos últimos 10 minutos.')).toBeInTheDocument();
  });

  it('agente (nao staff) nao ve a faixa nem o atalho', () => {
    h.degraded = [{ id: 'c1', label: 'VENDAS-01', lastHealthCheck: Date.now() }];
    h.role = { isSupervisor: false };
    render(<DegradedConnectionsBanner onOpenConnections={vi.fn()} />);

    expect(screen.queryByTestId('degraded-connections-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('degraded-connections-open')).not.toBeInTheDocument();
  });

  it('varias conexoes degradadas viram contagem, nao nome', () => {
    h.degraded = [
      { id: 'c1', label: 'VENDAS-01', lastHealthCheck: Date.now() },
      { id: 'c2', label: 'SUPORTE-02', lastHealthCheck: Date.now() },
    ];
    render(<DegradedConnectionsBanner />);

    expect(screen.getByText('2 conexões estão instáveis')).toBeInTheDocument();
  });

  it('sem conexao degradada nao renderiza nada', () => {
    h.degraded = [];
    const { container } = render(<DegradedConnectionsBanner />);

    expect(container.querySelector('[data-testid="degraded-connections-banner"]')).toBeNull();
  });

  it('atalho leva para Conexoes', () => {
    h.degraded = [{ id: 'c1', label: 'VENDAS-01', lastHealthCheck: Date.now() }];
    const onOpenConnections = vi.fn();
    render(<DegradedConnectionsBanner onOpenConnections={onOpenConnections} />);

    fireEvent.click(screen.getByTestId('degraded-connections-open'));
    expect(onOpenConnections).toHaveBeenCalledTimes(1);
  });

  it('sem a prop de navegacao o atalho nao aparece (nao renderiza botao morto)', () => {
    h.degraded = [{ id: 'c1', label: 'VENDAS-01', lastHealthCheck: Date.now() }];
    render(<DegradedConnectionsBanner />);

    expect(screen.queryByTestId('degraded-connections-open')).not.toBeInTheDocument();
  });
});

describe('BackendStatusBanner (servidor)', () => {
  beforeEach(() => {
    h.backend = { status: 'unknown', restored: false, checking: false, checkNow: vi.fn() };
  });

  it('servidor fora do ar: faixa com o texto do cartao e o botao de tentar agora', () => {
    const checkNow = vi.fn().mockResolvedValue(undefined);
    h.backend = { status: 'down', restored: false, checking: false, checkNow };
    render(<BackendStatusBanner />);

    expect(screen.getByText('Servidor indisponível, tentando reconectar…')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('backend-status-retry'));
    expect(checkNow).toHaveBeenCalledTimes(1);
  });

  it('enquanto ja esta checando, o botao fica desabilitado', () => {
    h.backend = { status: 'down', restored: false, checking: true, checkNow: vi.fn() };
    render(<BackendStatusBanner />);

    expect(screen.getByTestId('backend-status-retry')).toBeDisabled();
  });

  it('servidor de volta: aviso "Conexao restaurada" com o motivo', () => {
    h.backend = { status: 'up', restored: true, checking: false, checkNow: vi.fn() };
    render(<BackendStatusBanner />);

    expect(screen.getByTestId('backend-restored')).toBeInTheDocument();
    expect(screen.getByText('Conexão restaurada')).toBeInTheDocument();
    expect(screen.getByText('O servidor voltou a responder.')).toBeInTheDocument();
    expect(screen.queryByTestId('backend-status-banner')).not.toBeInTheDocument();
  });

  it('servidor de pe e sem aviso pendente: nada na tela', () => {
    h.backend = { status: 'up', restored: false, checking: false, checkNow: vi.fn() };
    render(<BackendStatusBanner />);

    expect(screen.queryByTestId('backend-restored')).not.toBeInTheDocument();
    expect(screen.queryByTestId('backend-status-banner')).not.toBeInTheDocument();
  });

  it('primeira checagem ainda nao respondida nao vira alarme', () => {
    h.backend = { status: 'unknown', restored: false, checking: true, checkNow: vi.fn() };
    render(<BackendStatusBanner />);

    expect(screen.queryByTestId('backend-status-banner')).not.toBeInTheDocument();
  });
});

describe('GlobalConnectionBanners', () => {
  it('as duas faixas convivem, cada uma no seu testid', () => {
    h.degraded = [{ id: 'c1', label: 'VENDAS-01', lastHealthCheck: Date.now() }];
    h.backend = { status: 'down', restored: false, checking: false, checkNow: vi.fn() };
    render(<GlobalConnectionBanners />);

    expect(screen.getByTestId('backend-status-banner')).toBeInTheDocument();
    expect(screen.getByTestId('degraded-connections-banner')).toBeInTheDocument();
  });

  it('o aviso proprio do navegador offline segue com o texto dele (nao e duplicado aqui)', () => {
    h.degraded = [];
    h.backend = { status: 'down', restored: false, checking: false, checkNow: vi.fn() };
    render(<GlobalConnectionBanners />);

    expect(screen.getByText('Servidor indisponível, tentando reconectar…')).toBeInTheDocument();
    expect(screen.queryByText(/Você está offline/)).not.toBeInTheDocument();
  });
});

describe('a11y: as faixas sao landmarks nomeados', () => {
  beforeEach(() => {
    h.degraded = [{ id: 'c1', label: 'VENDAS-01', lastHealthCheck: Date.now() }];
    h.backend = { status: 'down', restored: false, checking: false, checkNow: vi.fn() };
    h.role = { isSupervisor: true };
  });

  it('cada faixa tem landmark nomeado e o texto DENTRO dele', () => {
    const { container } = render(<GlobalConnectionBanners />);

    const faixas = Array.from(container.querySelectorAll('[role="region"]'));
    const labels = faixas.map((faixa) => faixa.getAttribute('aria-label'));
    expect(labels).toEqual(['Servidor indisponível', 'Conexões instáveis do WhatsApp']);
    expect(faixas[0].textContent).toMatch(/Servidor indisponível, tentando reconectar/);
    expect(faixas[1].textContent).toMatch(/está instável/);
  });

  it('axe nao acusa conteudo fora de landmark (regra region)', async () => {
    render(<GlobalConnectionBanners />);

    // jsdom nao tem layout: contraste fica fora (declarado); `region` e estrutural.
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((violation) => violation.id === 'region')).toEqual([]);
  });
});
