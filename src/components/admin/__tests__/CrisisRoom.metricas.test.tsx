import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Sala de Crise — a TELA (PF-02 / R2-AUTH-036).
 *
 * A medição (RPC `crisis_room_snapshot`, regras de pendência/presença no banco)
 * vive no hook `useCrisisRoomMetrics` e é provada em
 * `src/hooks/business/__tests__/useCrisisRoomMetrics.test.tsx` e no
 * `scripts/db-audit/crisis-room-snapshot.test.sh`. Este arquivo substitui a prova
 * antiga que olhava as consultas `supabase.from(...)` DENTRO do componente: o
 * componente não fala mais com o banco e só renderiza o que o hook entrega.
 *
 * Aqui se prova o que a tela MOSTRA: erro nunca vira "Operação normal", o selo
 * anuncia severidade, os DOIS limiares aparecem e o esqueleto é só da 1ª carga.
 */

const h = vi.hoisted(() => {
  const estado: { resultado: Record<string, unknown> } = {
    resultado: {
      metrics: undefined,
      isCrisis: null,
      isError: false,
      error: null,
      isFirstLoad: false,
      isRefreshing: false,
      dataUpdatedAt: 0,
      refetch: () => {},
    },
  };
  return { estado };
});

// O hook é stubado; o resto do módulo (limiares, labels, builder) é o REAL —
// assim os cartões montados no teste saem do código de produção, não de um mock.
vi.mock('@/hooks/business/useCrisisRoomMetrics', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/business/useCrisisRoomMetrics')>();
  return { ...real, useCrisisRoomMetrics: () => h.estado.resultado };
});

import { CrisisRoom } from '@/components/admin/CrisisRoom';
import { buildCrisisMetricReadouts, parseCrisisRoomSnapshot } from '@/hooks/business/useCrisisRoomMetrics';

const SNAPSHOT = {
  unanswered_messages: 42,
  unanswered_conversations: 12,
  online_agents: 3,
  total_agents: 9,
  sla_breached: 7,
  queue_ratio: 4,
  window_minutes: 60,
  sla_window_hours: 24,
  generated_at: '2026-10-13T19:00:00.000Z',
};

function metricas(snapshot: Record<string, unknown>) {
  return buildCrisisMetricReadouts(parseCrisisRoomSnapshot(snapshot));
}

function setResultado(parcial: Record<string, unknown>) {
  h.estado.resultado = { ...h.estado.resultado, ...parcial };
}

beforeEach(() => {
  h.estado.resultado = {
    metrics: metricas(SNAPSHOT),
    isCrisis: true,
    isError: false,
    error: null,
    isFirstLoad: false,
    isRefreshing: false,
    dataUpdatedAt: Date.now(),
    refetch: vi.fn(),
  };
});

describe('CrisisRoom — erro não vira "Operação normal"', () => {
  it('falha mostra aviso com "Tentar de novo", "—" nos cartões e selo sem medição', async () => {
    setResultado({ metrics: undefined, isCrisis: null, isError: true, error: new Error('permission denied'), dataUpdatedAt: 0 });

    render(<CrisisRoom />);

    // O texto exato que nunca pode aparecer é o verde de operação normal.
    expect(screen.queryByText('🟢 Operação normal')).not.toBeInTheDocument();
    expect(screen.getByText('⚠️ Sem medição')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível medir a operação')).toBeInTheDocument();
    expect(screen.getByText('permission denied')).toBeInTheDocument();

    // Os 4 cartões continuam na tela, com "—" (não zero).
    const tracos = screen.getAllByText('—');
    expect(tracos).toHaveLength(4);
    expect(screen.getByText('Msgs sem resposta (1h)')).toBeInTheDocument();
    expect(screen.queryByText('42')).not.toBeInTheDocument();

    // Nem banner de crise nem valor inventado.
    expect(screen.queryByText('Operação em estado crítico!')).not.toBeInTheDocument();
  });

  it('"Tentar de novo" chama o refetch do hook', async () => {
    const refetch = vi.fn();
    setResultado({ metrics: undefined, isCrisis: null, isError: true, error: new Error('x'), refetch, dataUpdatedAt: 0 });

    render(<CrisisRoom />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('CrisisRoom — severidade anunciada e dois limiares', () => {
  it('banner de crise tem role="alert" e o cabeçalho é uma região viva', async () => {
    render(<CrisisRoom />);

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Operação em estado crítico!');
    expect(screen.getByText('🔴 MODO CRISE ATIVO')).toBeInTheDocument();

    // A troca de selo é anunciada: o selo vive dentro de um contêiner aria-live.
    const selo = screen.getByText('🔴 MODO CRISE ATIVO');
    expect(selo.closest('[aria-live]')).not.toBeNull();
  });

  it('não anuncia crise quando nada estourou', async () => {
    setResultado({ metrics: metricas({ ...SNAPSHOT, unanswered_messages: 0, sla_breached: 0, online_agents: 9 }), isCrisis: false });

    render(<CrisisRoom />);

    expect(screen.getByText('🟢 Operação normal')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cada cartão mostra os DOIS limiares (atenção e crítico)', async () => {
    render(<CrisisRoom />);

    expect(screen.getByText('Atenção: > 20 msgs')).toBeInTheDocument();
    expect(screen.getByText('Crítico: > 30 msgs')).toBeInTheDocument();
    expect(screen.getByText('Atenção: > 5 conversas')).toBeInTheDocument();
    expect(screen.getByText('Crítico: > 10 conversas')).toBeInTheDocument();
    // Métrica de piso (agentes): MENOR é pior — o sinal inverte.
    expect(screen.getByText('Atenção: < 4 online')).toBeInTheDocument();
    expect(screen.getByText('Crítico: < 2 online')).toBeInTheDocument();
  });
});

describe('CrisisRoom — carga, recarga e carimbo', () => {
  it('esqueleto só na primeira carga; recarga mantém os valores e marca aria-busy', async () => {
    setResultado({ metrics: undefined, isFirstLoad: true, isCrisis: null, dataUpdatedAt: 0 });
    const { unmount } = render(<CrisisRoom />);
    // 1ª carga: cartões ainda não renderizados (esqueleto), rótulo ausente.
    expect(screen.queryByText('Msgs sem resposta (1h)')).not.toBeInTheDocument();
    unmount();

    // Recarga de fundo: valores continuam na tela (não pisca esqueleto).
    setResultado({ metrics: metricas(SNAPSHOT), isFirstLoad: false, isRefreshing: true });
    render(<CrisisRoom />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Msgs sem resposta (1h)')).toBeInTheDocument();

    const botao = screen.getByRole('button', { name: /Atualizar métricas/ });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao).toBeDisabled();
  });

  it('"Atualizado há X" reflete o carimbo da última leitura boa', async () => {
    const primeira = render(<CrisisRoom />);
    await waitFor(() => expect(screen.getByText('Atualizado agora')).toBeInTheDocument());
    primeira.unmount();

    setResultado({ dataUpdatedAt: Date.now() - 5 * 60_000 });
    const { unmount } = render(<CrisisRoom />);
    expect(screen.getByText('Atualizado há 5 min')).toBeInTheDocument();
    unmount();

    setResultado({ metrics: undefined, isError: true, error: new Error('x'), dataUpdatedAt: 0 });
    render(<CrisisRoom />);
    expect(screen.getByText('Ainda sem medição')).toBeInTheDocument();
  });
});
