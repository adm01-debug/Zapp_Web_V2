import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RateLimitDashboard from '@/pages/admin/RateLimitDashboard';
import { useRateLimitLogs } from '@/hooks/system/useRateLimitLogs';

vi.mock('@/hooks/system/useRateLimitLogs', () => ({ useRateLimitLogs: vi.fn() }));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: false }),
}));

const gancho = vi.mocked(useRateLimitLogs);

function pagina(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `log-${i + 1}`,
    ip_address: `10.9.9.${i + 1}`,
    endpoint: '/api/messages',
    request_count: 1,
    blocked: false,
    created_at: '2024-01-01T00:00:00Z',
  }));
}

function base(ajustes: Record<string, unknown> = {}) {
  return {
    logs: pagina(25),
    stats: null,
    loading: false,
    refetch: vi.fn(),
    filters: {
      ip: '', endpoint: '', blockedOnly: false,
      sortBy: 'created_at', sortDir: 'desc', page: 1, pageSize: 25,
    },
    setFilters: vi.fn(),
    resetFilters: vi.fn(),
    total: 60,
    totalPages: 3,
    error: null,
    ...ajustes,
  } as never;
}

function abrirAbaLogs() {
  render(<RateLimitDashboard />);
  // O Tabs do Radix usa ativação automática: o foco move o painel visível.
  fireEvent.focus(screen.getByRole('tab', { name: /logs/i }));
}

describe('RateLimitDashboard — aba de logs consome a página do servidor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renderiza a página inteira sem cortar no cliente e mostra o total do servidor', () => {
    gancho.mockReturnValue(base());
    abrirAbaLogs();
    // A página tem 25 linhas; o corte antigo (slice 20) esconderia a última.
    expect(screen.getAllByText(/10\.9\.9\./)).toHaveLength(25);
    expect(screen.getByText('10.9.9.25')).toBeInTheDocument();
    expect(screen.getByText(/total de 60 registros/i)).toBeInTheDocument();
    expect(screen.getByText(/página 1 de 3/i)).toBeInTheDocument();
  });

  it('mostra o erro do servidor com botão de tentar de novo', () => {
    const refetch = vi.fn();
    gancho.mockReturnValue(base({ logs: [], total: 0, totalPages: 1, error: 'permission denied', refetch }));
    abrirAbaLogs();
    expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível carregar os logs/i);
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('aplica filtros e troca de página pelo servidor', () => {
    const setFilters = vi.fn();
    gancho.mockReturnValue(base({ setFilters }));
    abrirAbaLogs();
    fireEvent.change(screen.getByLabelText(/filtrar por ip/i), { target: { value: '10.9' } });
    fireEvent.click(screen.getByRole('button', { name: /aplicar filtros/i }));
    expect(setFilters).toHaveBeenCalledWith({ ip: '10.9', endpoint: '' });
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(setFilters).toHaveBeenCalledWith({ page: 2 });
  });

  it('troca ordenação, tamanho da página, somente-bloqueados e limpa os filtros', () => {
    const setFilters = vi.fn();
    const resetFilters = vi.fn();
    gancho.mockReturnValue(base({ setFilters, resetFilters }));
    abrirAbaLogs();
    fireEvent.click(screen.getByLabelText(/somente bloqueados/i));
    expect(setFilters).toHaveBeenCalledWith({ blockedOnly: true });
    fireEvent.change(screen.getByLabelText(/ordenar por/i), { target: { value: 'ip_address' } });
    expect(setFilters).toHaveBeenCalledWith({ sortBy: 'ip_address' });
    fireEvent.change(screen.getByLabelText(/itens por página/i), { target: { value: '50' } });
    expect(setFilters).toHaveBeenCalledWith({ pageSize: 50 });
    fireEvent.click(screen.getByRole('button', { name: /limpar/i }));
    expect(resetFilters).toHaveBeenCalledTimes(1);
  });
});
