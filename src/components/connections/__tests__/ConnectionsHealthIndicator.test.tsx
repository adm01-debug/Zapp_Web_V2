/**
 * GL2 — indicador fixo da saúde das conexões do WhatsApp na barra lateral.
 *
 * Prova pela tela (componente REAL; só o hook de dados e o papel entram
 * mockados, porque quem fala com o banco é o store do GL1):
 *  - o ponto muda de cor/estado: verde (tudo conectado), amarelo (parcial),
 *    vermelho (tudo offline) e estado sem conexão;
 *  - o pulso do ponto só existe em degradado/desconectado e some com
 *    `prefers-reduced-motion: reduce`;
 *  - a lista filtra por status (Todas / Conectadas / Offline) e navega por seta;
 *  - o histórico de quedas aparece e o staff pode limpar;
 *  - o AGENTE vê só o estado; o STAFF vê as ações (reconectar uma, todas);
 *  - o aviso da ação só aparece DEPOIS da resposta;
 *  - carregando = esqueleto; erro de leitura não mente sobre o estado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { axe } from 'vitest-axe';
import type {
  ConnectionHealth,
  ConnectionsHealthData,
  ReconnectAllSummary,
  ReconnectResult,
} from '@/hooks/connections/useConnectionsHealth';

// ── "reduzir movimento" (o singleton do framer-motion é lido uma vez) ──────
const reduceMotion = { value: false };
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

// ── PAPEL (staff vê ações; agente não) ────────────────────────────────────
const staff = { value: true };
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isSupervisor: staff.value }),
}));

// ── DADOS (store do GL1) ──────────────────────────────────────────────────
const reconnectMock = vi.fn<(id: string) => Promise<ReconnectResult>>();
const reconnectAllMock = vi.fn<() => Promise<ReconnectAllSummary>>();
const clearHistoryMock = vi.fn<() => void>();
const health = { value: null as unknown as ConnectionsHealthData };

vi.mock('@/hooks/connections/useConnectionsHealth', () => ({
  useConnectionsHealth: () => health.value,
}));

import { ConnectionsHealthIndicator } from '@/components/connections/ConnectionsHealthIndicator';
import { TooltipProvider } from '@/components/ui/tooltip';

const conn = (over: Partial<ConnectionHealth> = {}): ConnectionHealth => ({
  id: 'c1',
  name: 'Comercial',
  phoneNumber: '+55 11 90000-0001',
  instanceId: 'inst-1',
  status: 'connected',
  isDefault: true,
  healthy: true,
  ...over,
});

function setHealth(
  connections: ConnectionHealth[],
  over: Partial<ConnectionsHealthData> = {},
): ConnectionsHealthData {
  const disconnected = connections.filter((c) => !c.healthy);
  health.value = {
    connections,
    disconnected,
    total: connections.length,
    connectedCount: connections.length - disconnected.length,
    hasIssue: disconnected.length > 0,
    loading: false,
    error: null,
    history: [],
    reconnecting: null,
    reconnectingAll: false,
    reconnect: reconnectMock,
    reconnectAll: reconnectAllMock,
    clearHistory: clearHistoryMock,
    refresh: vi.fn(async () => undefined),
    ...over,
  };
  return health.value;
}

const renderIndicator = (collapsed = false) =>
  render(
    <TooltipProvider>
      <ConnectionsHealthIndicator collapsed={collapsed} />
    </TooltipProvider>,
  );

const dot = () => screen.getByTestId('conexoes-ponto');
const trigger = () => screen.getByTestId('conexoes-indicador');

const openPopover = async () => {
  fireEvent.click(trigger());
  return screen.findByText('WhatsApp — Conexões');
};

beforeEach(() => {
  reduceMotion.value = false;
  staff.value = true;
  reconnectMock.mockReset();
  reconnectMock.mockResolvedValue({ ok: true });
  reconnectAllMock.mockReset();
  reconnectAllMock.mockResolvedValue({ total: 0, ok: 0, skipped: 0, failed: 0 });
  clearHistoryMock.mockReset();
  setHealth([]);
});

afterEach(() => cleanup());

// ── estados do ponto ──────────────────────────────────────────────────────
describe('estado do indicador', () => {
  it('tudo conectado: ponto verde, contagem e rótulo de estado', () => {
    setHealth([conn(), conn({ id: 'c2', name: 'Suporte', phoneNumber: null })]);
    renderIndicator();

    expect(dot()).toHaveAttribute('data-tone', 'ok');
    expect(dot().className).toContain('bg-success');
    expect(trigger().getAttribute('aria-label')).toBe('Conexões WhatsApp — 2 de 2 conectadas');
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });

  it('parcial: ponto amarelo com pulso', () => {
    setHealth([conn(), conn({ id: 'c2', name: 'Suporte', healthy: false, status: 'close' })]);
    renderIndicator();

    expect(dot()).toHaveAttribute('data-tone', 'warn');
    expect(dot().className).toContain('bg-warning');
    expect(dot()).toHaveAttribute('data-motion', 'full');
    expect(trigger().getAttribute('aria-label')).toBe('Conexões WhatsApp — 1 de 2 offline');
  });

  it('tudo offline: ponto vermelho com pulso e rótulo próprio', () => {
    setHealth([conn({ healthy: false }), conn({ id: 'c2', healthy: false })]);
    renderIndicator();

    expect(dot()).toHaveAttribute('data-tone', 'down');
    expect(dot().className).toContain('bg-destructive');
    expect(dot()).toHaveAttribute('data-motion', 'full');
    expect(trigger().getAttribute('aria-label')).toBe('Conexões WhatsApp — todas as 2 offline');
  });

  it('sem conexões: estado neutro, sem mentir sobre saúde', () => {
    setHealth([]);
    renderIndicator();

    expect(dot()).toHaveAttribute('data-tone', 'empty');
    expect(trigger().getAttribute('aria-label')).toBe('Conexões WhatsApp — nenhuma conexão');
  });

  it('carregando: esqueleto com brilho, sem ponto', () => {
    setHealth([], { loading: true });
    renderIndicator();

    expect(screen.getAllByTestId('shimmer-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('conexoes-ponto')).toBeNull();
    expect(trigger()).toHaveAttribute('aria-busy', 'true');
  });

  it('erro de leitura: rótulo diz indisponível e o erro aparece no popover', async () => {
    setHealth([], { error: 'permission denied' });
    renderIndicator();

    expect(trigger().getAttribute('aria-label')).toContain('indisponível: permission denied');
    await openPopover();
    expect(screen.getByText(/Não foi possível ler as conexões: permission denied/)).toBeInTheDocument();
  });

  it('barra recolhida: só o ponto, sem texto', () => {
    setHealth([conn()]);
    renderIndicator(true);

    expect(dot()).toBeInTheDocument();
    expect(screen.queryByText('Conexões ativas')).toBeNull();
  });
});

// ── reduzir movimento ─────────────────────────────────────────────────────
describe('prefers-reduced-motion', () => {
  it('com redução, o ponto não pulsa (data-motion=reduced)', () => {
    reduceMotion.value = true;
    setHealth([conn(), conn({ id: 'c2', healthy: false })]);
    renderIndicator();

    expect(dot()).toHaveAttribute('data-motion', 'reduced');
    expect(dot()).toHaveAttribute('data-tone', 'warn');
  });

  it('contrato de fonte: pulso e entrada condicionados a prefersReducedMotion', () => {
    const src = readFileSync(
      path.resolve(__dirname, '..', 'ConnectionsHealthIndicator.tsx'),
      'utf8',
    );
    expect(src).toMatch(/import\s*\{[^}]*\buseReducedMotion\b[^}]*\}\s*from\s*'framer-motion'/);
    // sem movimento: nada de keyframe no ponto, nada de deslocamento na lista
    expect(src).toMatch(/pulse && !prefersReducedMotion/);
    expect(src).toMatch(/initial=\{prefersReducedMotion \? false :/);
    // nada de listener global de teclado nesta tela
    expect(src).not.toMatch(/addEventListener\('keydown'/);
  });
});

// ── popover: lista, filtro, histórico ─────────────────────────────────────
describe('popover das conexões', () => {
  const tres = [
    conn(),
    conn({ id: 'c2', name: 'Suporte', phoneNumber: null }),
    conn({ id: 'c3', name: 'Vendas', phoneNumber: null, healthy: false, status: 'close' }),
  ];

  it('lista todas as conexões com o estado de cada uma', async () => {
    setHealth(tres);
    renderIndicator();
    await openPopover();

    const lista = within(screen.getByRole('list'));
    expect(lista.getByText('Comercial')).toBeInTheDocument();
    expect(lista.getByText('Suporte')).toBeInTheDocument();
    expect(lista.getByText('Vendas')).toBeInTheDocument();
    expect(lista.getByText('Online')).toBeInTheDocument();
    expect(lista.getByText('Desconectada')).toBeInTheDocument();
  });

  it('filtra por status e navega entre as abas com as setas', async () => {
    setHealth(tres);
    renderIndicator();
    await openPopover();

    const tablist = screen.getByRole('tablist', { name: /Filtrar conexões por status/ });
    const conectadas = screen.getByRole('tab', { name: /Conectadas/ });
    const offline = screen.getByRole('tab', { name: /Offline/ });

    // seta direita a partir de "Todas" cai em "Conectadas" e foca a nova aba
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(conectadas).toHaveAttribute('aria-selected', 'true');
    expect(conectadas).toHaveFocus();
    // a linha offline sai da lista depois da animação de saída
    await waitFor(() =>
      expect(within(screen.getByRole('list')).queryByText('Vendas')).toBeNull(),
    );

    // seta esquerda volta para "Todas"
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: /Todas/ })).toHaveAttribute('aria-selected', 'true');
    expect(await within(screen.getByRole('list')).findByText('Vendas')).toBeInTheDocument();

    // seta esquerda de novo dá a volta até "Offline"
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(offline).toHaveAttribute('aria-selected', 'true');
    await waitFor(() =>
      expect(within(screen.getByRole('list')).queryByText('Comercial')).toBeNull(),
    );
    expect(within(screen.getByRole('list')).getByText('Vendas')).toBeInTheDocument();
  });

  it('lista vazia tem microcopy útil por filtro', async () => {
    setHealth([conn()]);
    renderIndicator();
    await openPopover();

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(screen.getByText('Nenhuma conexão offline — tudo em ordem.')).toBeInTheDocument();
  });

  it('histórico de quedas aparece e o staff limpa', async () => {
    setHealth([conn()], {
      history: [
        { connectionId: 'c1', instanceId: 'inst-1', name: 'Comercial', at: Date.now() - 90_000 },
      ],
    });
    renderIndicator();
    await openPopover();

    expect(screen.getByText('Últimas quedas')).toBeInTheDocument();
    expect(screen.getByText('1 min')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar histórico de quedas' }));
    expect(clearHistoryMock).toHaveBeenCalledTimes(1);
  });
});

// ── ações por papel ───────────────────────────────────────────────────────
describe('ações', () => {
  const parcial = [conn(), conn({ id: 'c2', name: 'Suporte', healthy: false })];

  it('agente vê só o estado: nenhuma ação de reconexão', async () => {
    staff.value = false;
    setHealth(parcial);
    renderIndicator();
    await openPopover();

    expect(screen.getByText('Suporte')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reconectar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Limpar/ })).toBeNull();
  });

  it('staff reconecta uma conexão e o aviso só sai DEPOIS da resposta', async () => {
    let resolve!: (value: ReconnectResult) => void;
    reconnectMock.mockImplementation(
      () => new Promise<ReconnectResult>((r) => { resolve = r; }),
    );
    setHealth(parcial);
    renderIndicator();
    await openPopover();

    fireEvent.click(screen.getByRole('button', { name: 'Reconectar Suporte' }));
    expect(reconnectMock).toHaveBeenCalledWith('c2');
    // antes da resposta não há aviso nenhum
    expect(screen.queryByTestId('conexoes-aviso')).toBeNull();

    resolve({ ok: true });
    expect(await screen.findByTestId('conexoes-aviso')).toHaveTextContent('Suporte reconectada.');
  });

  it('falha na reconexão é anunciada com o motivo', async () => {
    reconnectMock.mockResolvedValue({ ok: false, error: 'instance offline' });
    setHealth(parcial);
    renderIndicator();
    await openPopover();

    fireEvent.click(screen.getByRole('button', { name: 'Reconectar Suporte' }));
    expect(await screen.findByTestId('conexoes-aviso')).toHaveTextContent(
      'Falha ao reconectar Suporte: instance offline',
    );
  });

  it('reconectar todas resume o resultado e só aparece com 2+ offline', async () => {
    reconnectAllMock.mockResolvedValue({ total: 3, ok: 2, skipped: 0, failed: 1 });
    setHealth([
      conn({ healthy: false }),
      conn({ id: 'c2', name: 'Suporte', healthy: false }),
      conn({ id: 'c3', name: 'Vendas', healthy: false }),
    ]);
    renderIndicator();
    await openPopover();

    fireEvent.click(screen.getByRole('button', { name: /Reconectar todas as 3/ }));
    expect(reconnectAllMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('conexoes-aviso')).toHaveTextContent(
      '2 de 3 reconectadas · 1 com falha',
    );
  });

  it('com uma só offline, a ação é a individual (sem "Reconectar todas")', async () => {
    setHealth(parcial);
    renderIndicator();
    await openPopover();

    expect(screen.queryByRole('button', { name: /Reconectar todas/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reconectar Suporte' })).toBeInTheDocument();
  });

  it('sem violações de acessibilidade com o popover aberto', async () => {
    setHealth(parcial, {
      history: [
        { connectionId: 'c1', instanceId: 'inst-1', name: 'Comercial', at: Date.now() - 60_000 },
      ],
    });
    const { container } = renderIndicator();
    await openPopover();

    expect(await axe(container)).toHaveNoViolations();
  });
});
