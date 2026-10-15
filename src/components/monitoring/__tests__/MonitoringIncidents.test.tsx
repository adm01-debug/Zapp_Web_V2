/**
 * `MonitoringIncidents` — painel real (componente + hook + service) renderizado
 * com o client do Supabase mockado, provando pela TELA:
 *  1. uptime de 24 h por conexão e incidentes (início, duração, causa) visíveis;
 *  2. alerta ativo só da conexão fora do ar, com severidade;
 *  3. estado vazio quando não há histórico;
 *  4. caminho de erro exibido (não engolido);
 *  5. o botão de atualização recarrega e repinta com o dado novo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  from: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  queryError: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => h.from(...args) },
}));

import { MonitoringIncidents } from '@/components/monitoring/MonitoringIncidents';
import { CONNECTION_HEALTH_LOAD_ERROR } from '@/services/connection-health.service';

/** Cadeia fluente do supabase-js; `limit()` resolve com o fixture da vez. */
function makeQuery() {
  const api: Record<string, unknown> = {};
  api.select = () => api;
  api.gte = () => api;
  api.order = () => api;
  api.limit = () => Promise.resolve({ data: h.rows, error: h.queryError });
  return api;
}

const MIN = 60 * 1000;
const ago = (min: number) => new Date(Date.now() - min * MIN).toISOString();

const healthy = (id: string, connection: string, instance: string, min: number, status = 'connected') => ({
  id, connection_id: connection, instance_id: instance, status,
  response_time_ms: 120, error_message: null, checked_at: ago(min),
});
const failing = (id: string, connection: string, instance: string, min: number, status = 'error', msg = 'timeout') => ({
  id, connection_id: connection, instance_id: instance, status,
  response_time_ms: null, error_message: msg, checked_at: ago(min),
});

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [];
  h.queryError = null;
  h.from.mockImplementation(() => makeQuery());
});

describe('MonitoringIncidents — uptime e incidentes na tela', () => {
  it('mostra o uptime de 24h por conexão (33.3% e 100%) e o incidente em aberto com causa', async () => {
    h.rows = [
      healthy('l1', 'conn-1', 'inst-A', 180),
      failing('l2', 'conn-1', 'inst-A', 120),
      failing('l3', 'conn-1', 'inst-A', 60),
      healthy('l4', 'conn-2', 'inst-B', 30),
    ];

    render(<MonitoringIncidents />);

    // Uptime: 1 de 3 checks saudáveis na conn-1; 1 de 1 na conn-2.
    expect(await screen.findByText('33.3%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('1/3 checks saudáveis')).toBeInTheDocument();

    // Incidente em aberto (sem check saudável depois) com causa e duração.
    expect(screen.getByText('Em aberto')).toBeInTheDocument();
    expect(screen.getByText('Causa: timeout')).toBeInTheDocument();
    expect(screen.getByText(/duração/)).toBeInTheDocument();

    // Alerta ativo só da conexão fora do ar.
    expect(screen.getByRole('status', { name: 'Alertas ativos' })).toBeInTheDocument();
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
    expect(screen.queryByText('Sem incidentes nas últimas 24 horas.')).toBeNull();
  });

  it('exibe a barra de uptime acessível por conexão', async () => {
    h.rows = [healthy('l1', 'conn-1', 'inst-A', 30)];

    render(<MonitoringIncidents />);

    expect(await screen.findByRole('progressbar', { name: 'Uptime de inst-A' })).toBeInTheDocument();
  });

  it('sem histórico, anuncia o estado vazio em vez de zeros', async () => {
    h.rows = [];

    render(<MonitoringIncidents />);

    expect(await screen.findByText('Sem incidentes nas últimas 24 horas.')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('mostra o erro da consulta quando a leitura falha', async () => {
    h.queryError = { message: 'boom' };

    render(<MonitoringIncidents />);

    expect(await screen.findByRole('alert')).toHaveTextContent(CONNECTION_HEALTH_LOAD_ERROR);
  });

  it('o botão de atualizar recarrega e repinta com o dado novo', async () => {
    h.rows = [];
    render(<MonitoringIncidents />);
    expect(await screen.findByText('Sem incidentes nas últimas 24 horas.')).toBeInTheDocument();

    // Novo histórico aparece na releitura; a tela tem de refletir.
    h.rows = [healthy('l1', 'conn-3', 'inst-C', 10)];
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar incidentes' }));

    expect(await screen.findByText('100%')).toBeInTheDocument();
    expect(screen.queryByText('Sem incidentes nas últimas 24 horas.')).toBeNull();
  });
});
