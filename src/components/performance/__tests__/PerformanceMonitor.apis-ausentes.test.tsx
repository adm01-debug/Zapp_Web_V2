import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PerformanceMonitor } from '../PerformanceMonitor';

/**
 * R2-INF-029 (#375) — "Score de desempenho trata APIs ausentes como memória livre,
 * RTT zero e conexão 4g".
 *
 * `performance.memory` e `navigator.connection` só existem no Chromium. Sem elas o
 * monitor inventava 0 MB, RTT 0 ms e '4g', marcava as três métricas como "Bom" e
 * fechava o score em 100 ("Excelente!"). Aqui se prova que a ausência vira "N/D"
 * explícito, NÃO conta como métrica boa e não é gravada como zero no snapshot.
 */

const { insertMock } = vi.hoisted(() => ({
  insertMock: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'p1' }, user: { id: 'u1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        }),
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        }),
      })),
      insert: insertMock,
      delete: vi.fn().mockReturnValue({
        lt: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) }),
      }),
    })),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/formatters', () => ({
  formatRelativeTime: vi.fn(() => '1min atrás'),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => <div />,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

// As duas APIs de medição só existem no Chromium: cada teste define ou remove.
function setMemory(value: unknown) {
  Object.defineProperty(performance, 'memory', { value, configurable: true, writable: true });
}
function setConnection(value: unknown) {
  Object.defineProperty(navigator, 'connection', { value, configurable: true, writable: true });
}

const score = () => screen.getByTestId('overall-score').textContent;

describe('PerformanceMonitor — APIs de medição ausentes (R2-INF-029)', () => {
  beforeEach(() => {
    insertMock.mockClear();
    setMemory(undefined);
    setConnection(undefined);
  });

  afterEach(() => {
    setMemory(undefined);
    setConnection(undefined);
  });

  it('sem performance.memory e sem navigator.connection: N/D explícito, nunca 0 MB / 0 ms / 4g', async () => {
    render(<PerformanceMonitor />);
    await waitFor(() => expect(score()).not.toBe('100'));

    expect(screen.getAllByText('N/D')).toHaveLength(3);
    expect(screen.queryByText(/MB \/ 256MB/)).toBeNull();
    expect(screen.queryByText('4g')).toBeNull();
    // as três sem medição não podem aparecer como "Bom" (só as 5 medidas)
    expect(screen.getAllByText('Bom')).toHaveLength(5);
    // nada sumiu da tela: as métricas continuam listadas
    expect(screen.getByText('Memória JS')).toBeInTheDocument();
    expect(screen.getByText('RTT')).toBeInTheDocument();
    expect(screen.getByText('Conexão')).toBeInTheDocument();
    expect(screen.getByText(/3 métricas sem medição/)).toBeInTheDocument();
    // 5 métricas medidas, todas boas → 5/8, não 100
    expect(score()).toBe('63');
  });

  it('o snapshot persistido não grava zero/"4g" para o que não foi medido', async () => {
    render(<PerformanceMonitor />);
    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        memory_used: null,
        memory_total: null,
        rtt: null,
        network_type: null,
        overall_score: 63,
      }),
    );
  });

  it('navigator.connection sem rtt: só o RTT fica N/D; a conexão medida continua valendo', async () => {
    setMemory({ usedJSHeapSize: 50 * 1048576, totalJSHeapSize: 256 * 1048576 });
    setConnection({ effectiveType: '4g' });
    render(<PerformanceMonitor />);
    await waitFor(() => expect(screen.getAllByText('N/D')).toHaveLength(1));
    expect(screen.getByText('4g')).toBeInTheDocument();
    expect(screen.getAllByText('Bom')).toHaveLength(7);
    expect(score()).toBe('88'); // 7 de 8
  });

  it('APIs presentes e valores bons: as oito métricas contam e o score é 100', async () => {
    setMemory({ usedJSHeapSize: 50 * 1048576, totalJSHeapSize: 256 * 1048576 });
    setConnection({ effectiveType: '4g', rtt: 50 });
    render(<PerformanceMonitor />);
    await waitFor(() => expect(score()).toBe('100'));
    expect(screen.getAllByText('Bom')).toHaveLength(8);
    expect(screen.queryByText('N/D')).toBeNull();
    expect(screen.queryByText(/sem medição/)).toBeNull();
  });

  it('APIs presentes com valores ruins: crítico medido — ausência e medição ruim não se confundem', async () => {
    setMemory({ usedJSHeapSize: 240 * 1048576, totalJSHeapSize: 256 * 1048576 });
    setConnection({ effectiveType: '2g', rtt: 800 });
    render(<PerformanceMonitor />);
    await waitFor(() => expect(screen.getAllByText('Crítico')).toHaveLength(3));
    expect(screen.queryByText('N/D')).toBeNull();
    expect(screen.getByText('2g')).toBeInTheDocument();
    expect(score()).toBe('63');
  });
});
