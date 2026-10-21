/**
 * Selo de horário comercial da conexão — `BusinessHoursIndicator`.
 *
 * O sujeito é o componente REAL; a dublagem é só a fronteira de rede
 * (`supabase`). O dia consultado é o dia de hoje — calculado aqui, sem congelar
 * o relógio — e a janela de horário é montada para incluir (ou excluir) o
 * horário atual, provando a derivação de "Aberto/Fechado" a partir da hora.
 *
 * Cartão: falta teste de `BusinessHoursIndicator` na V2.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  rows: [] as Array<{ is_open: boolean; open_time?: string; close_time?: string }>,
  error: null as { message: string } | null,
  logError: vi.fn(),
  filters: [] as unknown[][],
}));

vi.mock('@/lib/logger', () => ({ log: { error: h.logError }, createLogger: () => ({ error: h.logError }) }));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      ...rest
    }: { children?: React.ReactNode; initial?: unknown; animate?: unknown }) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const builder = {
        select: () => builder,
        eq: (...args: unknown[]) => {
          h.filters.push(['eq', ...args]);
          return builder;
        },
        limit: () => builder,
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: h.rows, error: h.error }),
      };
      return builder;
    },
  },
}));

import { BusinessHoursIndicator } from '../BusinessHoursIndicator';

function setup(showLabel = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BusinessHoursIndicator connectionId="conn-1" showLabel={showLabel} />
    </QueryClientProvider>,
  );
}

/** Agora em São Paulo — a MESMA referência de fuso que o componente usa. */
function agoraBrasil(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

/** HH:MM em São Paulo, deslocado em `deltaMinutes` a partir de agora. */
function hojeDeslocado(deltaMinutes: number): string {
  const d = new Date(agoraBrasil().getTime() + deltaMinutes * 60000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [];
  h.error = null;
  h.filters = [];
});

describe('BusinessHoursIndicator — estados do selo', () => {
  it('sem linha para hoje, assume aberto e diz que não há horário configurado', async () => {
    const { container } = setup();
    expect(await screen.findByText('Aberto')).toBeTruthy();

    const trigger = container.querySelector('div')!;
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerMove(trigger);
    expect(await screen.findByText('Sem horário configurado')).toBeTruthy();
  });

  it('dia marcado como fechado mostra “Fechado” e o motivo', async () => {
    h.rows = [{ is_open: false, open_time: '09:00:00', close_time: '18:00:00' }];
    const { container } = setup();
    expect(await screen.findByText('Fechado')).toBeTruthy();

    const trigger = container.querySelector('div')!;
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerMove(trigger);
    expect(await screen.findByText('Horário hoje: Fechado hoje')).toBeTruthy();
  });

  it('dentro da janela do dia mostra “Aberto” com o horário de hoje', async () => {
    h.rows = [{ is_open: true, open_time: '00:00:00', close_time: '23:59:00' }];
    const { container } = setup();
    expect(await screen.findByText('Aberto')).toBeTruthy();

    const trigger = container.querySelector('div')!;
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerMove(trigger);
    expect(await screen.findByText('Horário hoje: 00:00 - 23:59')).toBeTruthy();
  });

  it('fora da janela do dia (hora atual fora do intervalo) mostra “Fechado”', async () => {
    // Monta, no MESMO fuso de São Paulo que o componente usa, uma janela que
    // comprovadamente não contém a hora atual — sem depender do fuso da máquina
    // e sem encostar no limite de minuto (que oscilaria na virada).
    const agora = agoraBrasil();
    const agoraMinutos = agora.getHours() * 60 + agora.getMinutes();
    const janela =
      agoraMinutos >= 120
        ? { open: '00:00', close: hojeDeslocado(-120) } // terminou duas horas atrás
        : { open: hojeDeslocado(5), close: '23:59' }; // só começa daqui a cinco minutos
    h.rows = [{ is_open: true, open_time: `${janela.open}:00`, close_time: `${janela.close}:00` }];

    setup();
    expect(await screen.findByText('Fechado')).toBeTruthy();
    expect(screen.queryByText('Aberto')).toBeNull();
  });

  it('filtra pela conexão e pelo dia de hoje', async () => {
    setup();
    await waitFor(() => expect(h.filters.some((f) => f[0] === 'eq' && f[1] === 'day_of_week')).toBe(true));
    expect(h.filters).toContainEqual(['eq', 'whatsapp_connection_id', 'conn-1']);
  });

  it('showLabel=false esconde o texto e mantém só o ícone', async () => {
    const { container } = setup(false);
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    expect(screen.queryByText('Aberto')).toBeNull();
    expect(screen.queryByText('Fechado')).toBeNull();
  });

  it('falha na leitura não renderiza selo nenhum e registra o erro', async () => {
    h.error = { message: 'network' };
    const { container } = setup();
    await waitFor(() => expect(h.logError).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});
