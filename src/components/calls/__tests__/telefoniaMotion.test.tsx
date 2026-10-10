/**
 * T75 / seção 2.8 — o motion do módulo de Telefonia medido no DOM que o
 * framer-motion realmente pinta (nada de `readFileSync` + regex, que não prova
 * comportamento):
 *
 *  - KPI: fade de 150 ms na entrada do tile (`tel-kpi-card`).
 *  - Painel da ligação: troca em 120 ms (`tel-active-panel`).
 *  - Botões de ação principais: `whileTap` de 0,98.
 *  - Histórico: SEM stagger por linha — as linhas são `<tr>` planos.
 *  - Tudo sob `useReducedMotion`: com movimento reduzido a entrada já nasce no
 *    estado final e a duração da transição é 0 (o aceite do plano:
 *    `transitionDuration === '0s'` em KPIs/linhas/painéis).
 *
 * `useReducedMotion` lê um singleton inicializado uma única vez — trocar o
 * `matchMedia` no meio do arquivo não funciona. Só o hook é substituído; o resto
 * do framer-motion segue real, e o `motion` é embrulhado para expor no DOM o
 * gesto (`data-while-tap`) e a duração (`data-motion-duracao`) que cada elemento
 * animado recebeu de fato.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentType } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import type { SearchMyCallsRow } from '@/hooks/calls/useMyCalls';

const reduzirMovimento = vi.hoisted(() => ({ value: false }));

/** Um componente do `motion` (`motion.div`, `motion.tr`, ...). */
type Componente = ComponentType<Record<string, unknown>>;

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  const mapa = new Map<string, Componente>();
  const embrulhar = (Real: Componente): Componente => (props) => {
    const tap = props.whileTap as { scale?: number } | undefined;
    const duracao = (props.transition as { duration?: number } | undefined)?.duration;
    return (
      <Real
        {...props}
        data-while-tap={tap ? `scale:${String(tap.scale)}` : 'nenhum'}
        data-motion-duracao={duracao === undefined ? 'nenhuma' : String(duracao)}
      />
    );
  };
  // O `motion` de verdade continua por baixo: o embrulho só expõe no DOM o gesto
  // (`data-while-tap`) e a duração (`data-motion-duracao`) que cada elemento recebeu.
  const motion = new Proxy(actual.motion as unknown as Record<string, Componente>, {
    get(alvo, tag) {
      if (typeof tag !== 'string') return Reflect.get(alvo, tag) as Componente;
      if (!mapa.has(tag)) mapa.set(tag, embrulhar(alvo[tag]));
      return mapa.get(tag) as Componente;
    },
  });
  return {
    ...actual,
    motion: motion as unknown as typeof actual.motion,
    useReducedMotion: () => reduzirMovimento.value,
  };
});

import { CallKpiCard } from '../CallKpiCard';
import { ActiveCallPanel } from '../ActiveCallPanel';
import { CallHistoryTable } from '../CallHistoryTable';

// ── provider da sessão/linha (mesmos mocks do ActiveCallPanel.test.tsx) ──────
type Sessao = { status: string; channel: 'voip' | 'whatsapp'; phone: string | null; name: string | null };
let sessao: Sessao;

vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({
    session: sessao,
    currentNumber: sessao.phone ?? '',
    isMuted: false,
    acceptIncomingCall: vi.fn(),
    rejectIncomingCall: vi.fn(),
    hangUp: vi.fn(),
    toggleMute: vi.fn(),
    sendDTMF: vi.fn(),
  }),
}));
vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({ voip: { canDial: true, reason: null, canReject: true }, whatsapp: { canDial: true, reason: null } }),
}));

/** O `<motion.div>` que envolve o painel/card animado (o pai do testid). */
const wrapperDe = (testid: string) => screen.getByTestId(testid).parentElement as HTMLElement;

beforeEach(() => {
  reduzirMovimento.value = false;
  sessao = { status: 'active', channel: 'voip', phone: '+551****8888', name: 'Ana Paula' };
});
afterEach(cleanup);

describe('T75 — KPI: fade de 150 ms', () => {
  it('o tile entra animando (opacidade 0 no primeiro paint) com duração de 0,15 s', () => {
    render(<CallKpiCard rotulo="Total" valor={42} />);

    const tile = screen.getByTestId('tel-kpi-card');
    expect(tile.style.opacity).toBe('0');
    expect(tile.getAttribute('data-motion-duracao')).toBe('0.15');
  });

  it('com movimento reduzido o tile já nasce visível e a transição tem duração 0', () => {
    reduzirMovimento.value = true;
    render(<CallKpiCard rotulo="Total" valor={42} />);

    const tile = screen.getByTestId('tel-kpi-card');
    expect(tile.style.opacity).not.toBe('0');
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(tile.getAttribute('data-motion-duracao')).toBe('0');
  });
});

describe('T75 — troca de painel da ligação: 120 ms', () => {
  it('o painel entra animando com 0,12 s', () => {
    render(<ActiveCallPanel segundos={0} />);

    const painel = wrapperDe('tel-active-panel');
    expect(painel.style.opacity).toBe('0');
    expect(painel.getAttribute('data-motion-duracao')).toBe('0.12');
  });

  it('com movimento reduzido o painel já nasce no lugar e a transição tem duração 0', () => {
    reduzirMovimento.value = true;
    render(<ActiveCallPanel segundos={0} />);

    const painel = wrapperDe('tel-active-panel');
    expect(painel.style.opacity).not.toBe('0');
    expect(painel.getAttribute('data-motion-duracao')).toBe('0');
  });

  it('os botões de ação principais usam whileTap de 0,98', () => {
    render(<ActiveCallPanel segundos={0} />);

    for (const testid of ['tel-mute', 'tel-dtmf-toggle', 'tel-hangup']) {
      expect(screen.getByTestId(testid).parentElement?.getAttribute('data-while-tap'), testid).toBe('scale:0.98');
    }
  });

  it('com movimento reduzido os botões não reagem ao toque', () => {
    reduzirMovimento.value = true;
    render(<ActiveCallPanel segundos={0} />);

    for (const testid of ['tel-mute', 'tel-dtmf-toggle', 'tel-hangup']) {
      expect(screen.getByTestId(testid).parentElement?.getAttribute('data-while-tap'), testid).toBe('nenhum');
    }
  });

  it('em chamada recebida Atender e Recusar também têm whileTap de 0,98', () => {
    sessao = { ...sessao, status: 'ringing_in' };
    render(<ActiveCallPanel segundos={0} />);

    expect(screen.getByTestId('tel-accept').parentElement?.getAttribute('data-while-tap')).toBe('scale:0.98');
    expect(screen.getByTestId('tel-reject').parentElement?.getAttribute('data-while-tap')).toBe('scale:0.98');
  });
});

describe('T75 — histórico sem stagger por linha', () => {
  const linha = (i: number) =>
    ({
      id: `call-${i}`,
      peer_name: `Contato ${i}`,
      contact_name: null,
      peer_number: '5511****9999',
      contact_phone: '5511****9999',
      contact_avatar_url: null,
      channel: 'voip',
      direction: 'outbound',
      status: 'ended',
      result: 'completed',
      started_at: '2026-10-05T14:00:00-03:00',
      answered_at: '2026-10-05T14:00:05-03:00',
      ended_at: '2026-10-05T14:01:05-03:00',
      duration_seconds: 60,
      recording_status: null,
    }) as unknown as SearchMyCallsRow;

  it('as linhas são <tr> planos: nenhum atraso/entrada animada por índice', () => {
    const rows = Array.from({ length: 8 }, (_, i) => linha(i));
    const { container } = render(
      <CallHistoryTable rows={rows} selecionadaId={null} onSelecionar={vi.fn()} onLigarDeVolta={vi.fn()} />,
    );

    const linhas = container.querySelectorAll('[data-testid="tel-row"]');
    expect(linhas.length).toBe(8);
    for (const l of linhas) {
      // Um `motion.tr` com stagger escreveria `style` (transform/opacity/delay)
      // inline em cada linha. Linha "<tr>" sem estilo nenhum = sem animação.
      expect((l as HTMLElement).getAttribute('style')).toBeNull();
    }
    expect(container.querySelectorAll('[data-motion-duracao]').length).toBe(0);
  });
});
