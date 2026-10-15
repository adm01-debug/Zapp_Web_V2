import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { WarRoomAgent, WarRoomQueue } from '@/hooks/business/useWarRoomData';
import { WarRoomAgentCard } from '../war-room/WarRoomAgentCard';
import { WarRoomDashboard } from '../WarRoomDashboard';

// O hook real é substituído só na leitura; `useWarRoomMetrics` (pura) segue de verdade.
const h = vi.hoisted(() => ({
  state: { payload: {} as Record<string, unknown> },
  calls: [] as Array<{ refetchInterval?: number | false } | undefined>,
}));

vi.mock('@/hooks/business/useWarRoomData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/business/useWarRoomData')>();
  return {
    ...actual,
    useWarRoomData: (opts?: { refetchInterval?: number | false }) => {
      h.calls.push(opts);
      return h.state.payload;
    },
  };
});
vi.mock('@/hooks/business/useWarRoomAlerts', () => ({
  useWarRoomAlerts: () => ({ alerts: [], dismissAlert: vi.fn() }),
}));
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: { soundEnabled: true }, updateSettings: vi.fn() }),
}));
vi.mock('@/components/inbox/AgentReassignmentPanel', () => ({
  AgentReassignmentPanel: () => <div data-testid="stub-reassign" />,
}));

const agente = (over: Partial<WarRoomAgent> = {}): WarRoomAgent => ({
  id: 'a1', name: 'Ana Souza', status: 'online',
  activeChats: 0, maxChats: 0, avgResponseTime: null, resolvedToday: 0, satisfaction: null,
  ...over,
});

const fila = (over: Partial<WarRoomQueue> = {}): WarRoomQueue => ({
  id: 'q1', name: 'Comercial', color: '', waiting: 0, avgWaitTime: null,
  slaBreaches: 0, slaWarnings: null, inProgress: 0, ...over,
});

const refetch = vi.fn();

function payload(over: Record<string, unknown> = {}) {
  h.state.payload = {
    agents: [] as WarRoomAgent[], queues: [] as WarRoomQueue[], alerts: [],
    isLoading: false, isError: false, error: null, dataUpdatedAt: 0, refetch,
    ...over,
  };
}

const renderDash = (ui: ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

beforeEach(() => {
  h.calls = [];
  refetch.mockReset();
  payload();
});

describe('WarRoomAgentCard — nenhum zero falso', () => {
  it('sem 1ª resposta medida e sem teto de chats, mostra travessão nas duas casas', () => {
    render(<WarRoomAgentCard agent={agente()} onClick={vi.fn()} />);
    expect(screen.queryByText('0s')).toBeNull();
    expect(screen.queryByText('0/0')).toBeNull();
    expect(screen.getAllByText('—')).toHaveLength(2); // Resp. + Chats
  });

  it('com dado medido mostra o valor real', () => {
    render(<WarRoomAgentCard agent={agente({ activeChats: 3, maxChats: 5, avgResponseTime: 12, resolvedToday: 7 })} onClick={vi.fn()} />);
    expect(screen.getByText('3/5')).toBeInTheDocument();
    expect(screen.getByText('12s')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('é acionável por teclado (Enter)', () => {
    const onClick = vi.fn();
    render(<WarRoomAgentCard agent={agente({ name: 'Bruno Lima' })} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /Bruno Lima/i }), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('WarRoomDashboard — estados e atualização', () => {
  it('carregando: mostra esqueleto e nenhum cartão de métrica crava zero falso', () => {
    payload({ isLoading: true });
    renderDash(<WarRoomDashboard />);
    expect(screen.getAllByTestId('warroom-loading').length).toBeGreaterThan(0);
    // Nenhum número foi medido ainda: todo cartão de métrica mostra '—'.
    for (const rotulo of ['Na Fila', 'SLA Violados', 'Em Risco', 'Agentes Online', 'Resolvidos Hoje', 'Satisfação']) {
      const cartao = screen.getByText(rotulo).parentElement as HTMLElement;
      expect(within(cartao).getByText('—')).toBeInTheDocument();
    }
    expect(screen.queryByText('/0')).toBeNull(); // sem '0/0' em Agentes Online
    expect(screen.queryByText(/0\\.0/)).toBeNull();
  });

  it('erro: mostra aviso e "Tentar de novo" refaz a leitura', () => {
    payload({ isError: true, error: new Error('boom') });
    renderDash(<WarRoomDashboard />);
    expect(screen.getByText('Não foi possível carregar o War Room.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('vazio: "Nenhum agente ativo" e "Nenhuma fila ativa"', () => {
    payload({ agents: [], queues: [] });
    renderDash(<WarRoomDashboard />);
    expect(screen.getByText('Nenhum agente ativo')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma fila ativa')).toBeInTheDocument();
  });

  it('"Auto-atualização" liga/desliga o refetchInterval de verdade', () => {
    payload({ isLoading: false });
    renderDash(<WarRoomDashboard />);
    expect(h.calls[h.calls.length - 1]?.refetchInterval).toBe(30000);
    fireEvent.click(screen.getByRole('button', { name: 'Auto-atualização' }));
    expect(h.calls[h.calls.length - 1]?.refetchInterval).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Auto-atualização' }));
    expect(h.calls[h.calls.length - 1]?.refetchInterval).toBe(30000);
  });

  it('"Atualizar agora" chama o refetch', () => {
    payload({ isLoading: false });
    renderDash(<WarRoomDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('satisfação só vira número quando há amostra', () => {
    payload({ agents: [agente({ satisfaction: null })], queues: [fila()] });
    const { unmount } = renderDash(<WarRoomDashboard />);
    expect(screen.queryByText('/5')).toBeNull();
    unmount();

    // O RPC devolve percentual (0-100, % de notas >= 4): 80 vira '80%', nunca 'x.x/5'.
    payload({ agents: [agente({ satisfaction: 80 })], queues: [fila()] });
    renderDash(<WarRoomDashboard />);
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('Esc sai da tela cheia', () => {
    payload({ isLoading: false });
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
    renderDash(<WarRoomDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    expect(screen.getByRole('button', { name: 'Sair da tela cheia' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeInTheDocument();
  });
});
