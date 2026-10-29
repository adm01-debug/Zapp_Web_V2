import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

/**
 * Prova do painel de regressões de permissão (aba Admin da Central de Segurança).
 * A consulta é mockada no helper de dados (`@/lib/supabaseHelpers`) e a
 * apresentação é o componente REAL — o que o admin vê é o que o banco devolveu.
 */
const mocks = vi.hoisted(() => {
  const resultado = { data: [] as unknown[], error: null as { message?: string } | null };
  const consulta = {
    select: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  consulta.select.mockReturnValue(consulta);
  consulta.order.mockReturnValue(consulta);
  consulta.limit.mockImplementation(async () => ({
    data: resultado.data,
    error: resultado.error,
  }));
  const fromTable = vi.fn(() => consulta);
  return { resultado, consulta, fromTable };
});

vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: mocks.fromTable }));

import { AclAlertsPanel, ACL_ALERTS_LIMIT } from '../AclAlertsPanel';

const ABERTA = {
  id: 1,
  alert_type: 'SECDEF_ANON_EXECUTE',
  object_name: 'public.promogifts_sync()',
  role_name: 'anon',
  privilege: 'EXECUTE',
  severity: 'CRITICAL',
  detected_at: '2026-10-13T10:00:00.000Z',
  resolved_at: null,
};

const RESOLVIDA = {
  id: 2,
  alert_type: 'TABELA_SEM_RLS',
  object_name: 'public.legacy_import',
  role_name: 'authenticated',
  privilege: 'SELECT',
  severity: 'HIGH',
  detected_at: '2026-10-12T09:00:00.000Z',
  resolved_at: '2026-10-13T11:30:00.000Z',
};

beforeEach(() => {
  mocks.resultado.data = [];
  mocks.resultado.error = null;
  mocks.consulta.select.mockClear();
  mocks.consulta.order.mockClear();
  mocks.consulta.limit.mockClear();
  mocks.fromTable.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AclAlertsPanel — admin vê as regressões de permissão', () => {
  it('mostra a regressão aberta com tipo, objeto, papel, privilégio e severidade', async () => {
    mocks.resultado.data = [ABERTA];

    render(<AclAlertsPanel />);

    expect(await screen.findByText('Função SECURITY DEFINER executável por anon')).toBeInTheDocument();
    expect(screen.getByText('public.promogifts_sync()')).toBeInTheDocument();
    expect(screen.getByText('anon')).toBeInTheDocument();
    expect(screen.getByText('EXECUTE')).toBeInTheDocument();
    expect(screen.getByText('Crítico')).toBeInTheDocument();
    expect(screen.getByText('Aberta')).toBeInTheDocument();
    expect(screen.getByText(/1 aberta\(s\) · 0 resolvida\(s\)/)).toBeInTheDocument();
  });

  it('mostra a regressão resolvida identificada, com a data da resolução', async () => {
    mocks.resultado.data = [RESOLVIDA];

    render(<AclAlertsPanel />);

    expect(await screen.findByText('Resolvida')).toBeInTheDocument();
    expect(screen.getByText('Tabela sem RLS')).toBeInTheDocument();
    expect(screen.getByText(/resolvida em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByText(/0 aberta\(s\) · 1 resolvida\(s\)/)).toBeInTheDocument();
  });

  it('consulta security_acl_alerts com as abertas primeiro e teto de linhas', async () => {
    mocks.resultado.data = [ABERTA];

    render(<AclAlertsPanel />);
    await screen.findByText('Aberta');

    expect(mocks.fromTable).toHaveBeenCalledWith('security_acl_alerts');
    const [colunas] = mocks.consulta.select.mock.calls[0];
    for (const coluna of [
      'alert_type',
      'object_name',
      'role_name',
      'privilege',
      'severity',
      'detected_at',
      'resolved_at',
    ]) {
      expect(colunas).toContain(coluna);
    }
    expect(mocks.consulta.order).toHaveBeenNthCalledWith(1, 'resolved_at', {
      ascending: true,
      nullsFirst: true,
    });
    expect(mocks.consulta.order).toHaveBeenNthCalledWith(2, 'detected_at', { ascending: false });
    expect(mocks.consulta.limit).toHaveBeenCalledWith(ACL_ALERTS_LIMIT);
  });

  it('tem o nome acessível e o estado vazio quando não há regressão', async () => {
    mocks.resultado.data = [];

    render(<AclAlertsPanel />);

    expect(
      screen.getByRole('region', { name: 'Regressões de permissão' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Nenhuma regressão de permissão.')).toBeInTheDocument();
  });

  it('mostra o erro quando a leitura falha, sem sumir com o painel', async () => {
    mocks.resultado.error = { message: 'permission denied for table security_acl_alerts' };

    render(<AclAlertsPanel />);

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar os alertas de regressão de permissão.');
  });

  it('aguenta o abarrotamento: 200 linhas e avisa que o teto foi atingido', async () => {
    mocks.resultado.data = Array.from({ length: ACL_ALERTS_LIMIT }, (_, i) => ({
      ...ABERTA,
      id: i + 1,
      object_name: `public.objeto_${i + 1}`,
    }));

    render(<AclAlertsPanel />);

    expect(await screen.findByText('public.objeto_1')).toBeInTheDocument();
    expect(screen.getByText('public.objeto_200')).toBeInTheDocument();
    expect(screen.getAllByText('Aberta')).toHaveLength(ACL_ALERTS_LIMIT);
    expect(screen.getByText(/Mostrando os 200 alertas mais recentes/)).toBeInTheDocument();
  });
});

describe('AclAlertsPanel — atualização ao vivo sem recarregar a página', () => {
  it('reconsulta sozinho a cada 30 s (aba visível) e no clique de Atualizar', async () => {
    mocks.resultado.data = [ABERTA];
    vi.useFakeTimers();

    render(<AclAlertsPanel />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.fromTable).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.fromTable.mock.calls.length).toBeGreaterThanOrEqual(2);

    const antesDoClique = mocks.fromTable.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar alertas de permissão' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.fromTable.mock.calls.length).toBeGreaterThan(antesDoClique);
  });

  it('desenha a regressão que apareceu depois do refresh automático', async () => {
    mocks.resultado.data = [];
    vi.useFakeTimers();

    render(<AclAlertsPanel />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Nenhuma regressão de permissão.')).toBeInTheDocument();

    // A varredura horária gravou a regressão: o painel a mostra sem novo clique.
    mocks.resultado.data = [ABERTA];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByText('Função SECURITY DEFINER executável por anon')).toBeInTheDocument();
  });
});
