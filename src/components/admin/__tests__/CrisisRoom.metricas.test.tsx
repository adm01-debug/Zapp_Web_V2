import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * R2-AUTH-036 (item 260, P2) — Sala de Crise.
 *
 * A medição das quatro métricas de operação saiu do navegador para o agregado
 * `public.crisis_room_snapshot()` (hook `useCrisisRoomMetrics`); as regras de cálculo
 * no banco têm prova própria em `scripts/db-audit/crisis-room-snapshot.test.sh`. A
 * prova AQUI é o que a TELA mostra sobre o que o agregado devolve:
 *   1. nenhum recálculo no navegador — a tela não consulta tabela nenhuma;
 *   2. "zero medido" e "não medido" não se confundem: `queue_ratio` nulo sai "—";
 *   3. leitura que falha deixa TODOS os cartões em "—" com selo "Sem medição" —
 *      jamais "Operação normal" (nem zero) sobre um dado que não existe.
 *
 * Antes: `loadMetrics` tratava TODA mensagem `sender=contact` da última hora como
 * "sem resposta" (inclusive as já respondidas) e usava `profiles.is_active`
 * (conta habilitada) como se fosse presença de agente — o conserto dessas duas
 * regras vive no SQL, provado pelo harness do banco.
 */

const { mockFrom, HOOK } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  HOOK: { atual: {} as Record<string, unknown> },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// Mesmo caminho de mock do cartão de canais: sem conexão cadastrada ele sai "não
// medido" e nenhuma métrica de rede entra no diagnóstico deste teste.
vi.mock('@/hooks/connections/useConnectionsHealth', () => ({
  useConnectionsHealth: () => ({
    connections: [],
    loading: false,
    error: null,
    history: [],
    reconnecting: null,
    reconnectingAll: false,
  }),
}));

// O hook é substituído, mas as funções de contrato (`parseCrisisRoomSnapshot` e
// `buildCrisisMetricReadouts`) seguem REAIS: é o agregado cru da RPC que entra aqui.
vi.mock('@/hooks/business/useCrisisRoomMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/business/useCrisisRoomMetrics')>()),
  useCrisisRoomMetrics: () => HOOK.atual,
}));

import { CrisisRoom } from '@/components/admin/CrisisRoom';
import {
  parseCrisisRoomSnapshot,
  buildCrisisMetricReadouts,
} from '@/hooks/business/useCrisisRoomMetrics';

const BASE = {
  metrics: undefined,
  snapshot: undefined,
  isCrisis: null,
  isError: false,
  error: null,
  isFirstLoad: false,
  isRefreshing: false,
  dataUpdatedAt: 0,
  refetch: () => {},
  refetchIntervalMs: 45_000,
};

/** Agregado cru como a RPC devolve (`jsonb`), com os padrões já preenchidos. */
function agregado(overrides: Record<string, unknown>) {
  return {
    unanswered_messages: 0,
    unanswered_conversations: 0,
    online_agents: 4,
    total_agents: 4,
    sla_breached: 0,
    queue_ratio: 0,
    window_minutes: 60,
    sla_window_hours: 24,
    generated_at: '2026-11-26T22:00:00.000Z',
    ...overrides,
  };
}

/** Liga a tela a um agregado real, passando pelo parse do hook. */
function comAgregado(overrides: Record<string, unknown>) {
  const snapshot = parseCrisisRoomSnapshot(agregado(overrides));
  HOOK.atual = {
    ...BASE,
    snapshot,
    metrics: buildCrisisMetricReadouts(snapshot),
    isCrisis: buildCrisisMetricReadouts(snapshot).some((m) => m.severity === 'critical'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  HOOK.atual = { ...BASE };
});

/** Valor exibido no cartão cujo rótulo é `label` (o <p> do número precede o do rótulo). */
async function metricValue(label: string) {
  await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
  const labelEl = screen.getByText(label);
  return labelEl.previousElementSibling?.textContent ?? null;
}

describe('CrisisRoom — agregado da RPC vira cartão, sem recálculo no navegador', () => {
  it('mostra exatamente o que a RPC mediu, com os dois limiares de cada cartão', async () => {
    comAgregado({
      unanswered_messages: 42,
      unanswered_conversations: 12,
      online_agents: 3,
      total_agents: 9,
      sla_breached: 7,
      queue_ratio: 4,
    });

    render(<CrisisRoom />);

    expect(await metricValue('Msgs sem resposta (1h)')).toBe('42');
    expect(await metricValue('Carga por agente')).toBe('4');
    expect(await metricValue('SLA estourados')).toBe('7');
    expect(await metricValue('Agentes ativos')).toBe('3');
    // 42 > 30 = crítico; SLA 7 > 5 = atenção; 3 agentes < 4 = atenção.
    expect(screen.getByText('🔴 MODO CRISE ATIVO')).toBeInTheDocument();
    expect(screen.getByText('Operação em estado crítico!')).toBeInTheDocument();
    // Nenhuma consulta de tabela: a pendência não é recontada aqui.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('zero medido aparece como 0 e mantém "Operação normal"', async () => {
    comAgregado({ unanswered_messages: 0, online_agents: 4, sla_breached: 0, queue_ratio: 0 });

    render(<CrisisRoom />);

    expect(await metricValue('Msgs sem resposta (1h)')).toBe('0');
    expect(await metricValue('Carga por agente')).toBe('0');
    expect(screen.getByText('🟢 Operação normal')).toBeInTheDocument();
    // Zero medido NÃO é "sem medição": só o cartão de canais (sem conexão cadastrada
    // neste teste) sai como não medido.
    expect(screen.getAllByText('Sem medição').length).toBe(1);
  });

  it('sem agente online a carga sai "—" (não medida) e o zero medido de agentes é crítico', async () => {
    comAgregado({ online_agents: 0, queue_ratio: null, unanswered_messages: 0, sla_breached: 0 });

    render(<CrisisRoom />);

    // `queue_ratio` nulo NÃO pode virar 0: a carga por agente é indeterminada.
    expect(await metricValue('Carga por agente')).toBe('—');
    // `online_agents` = 0 é medida legítima (ninguém online), e é crítica.
    expect(await metricValue('Agentes ativos')).toBe('0');
    expect(screen.getByText('🔴 MODO CRISE ATIVO')).toBeInTheDocument();
  });

  it('leitura que falha deixa todos os cartões em "—" e nunca diz "Operação normal"', async () => {
    HOOK.atual = {
      ...BASE,
      isError: true,
      error: new Error('crisis_room_snapshot requires admin or supervisor'),
    };

    render(<CrisisRoom />);

    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4));
    expect(screen.getByText('⚪ Sem medição')).toBeInTheDocument();
    expect(screen.queryByText('🟢 Operação normal')).toBeNull();
    expect(screen.queryByText('🔴 MODO CRISE ATIVO')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('requires admin or supervisor');
  });

  it('primeira carga mostra esqueleto, não cartão zerado', async () => {
    HOOK.atual = { ...BASE, isFirstLoad: true };

    render(<CrisisRoom />);

    expect(screen.queryByText('Msgs sem resposta (1h)')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });
});
