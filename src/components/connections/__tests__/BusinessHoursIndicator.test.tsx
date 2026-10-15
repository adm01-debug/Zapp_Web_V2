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

vi.mock('@/lib/logger', () => ({ log: { error: h.logError } }));

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

import {
  BusinessHoursIndicator,
  minutosDoHorario,
  classificarJanela,
  estaNaJanela,
  resumoDoDia,
} from '../BusinessHoursIndicator';

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

  it('janela que vira o dia (início > fim) fica aberta e avisa que vira o dia', async () => {
    // Início 1 h atrás, fim 2 h atrás: início > fim (janela noturna) e o
    // horário atual cai dentro dela — mesmo quando a hora atual é perto da
    // meia-noite, porque o cálculo noturno atravessa o dia.
    const abre = hojeDeslocado(-60);
    const fecha = hojeDeslocado(-120);
    h.rows = [{ is_open: true, open_time: `${abre}:00`, close_time: `${fecha}:00` }];

    const { container } = setup();
    expect(await screen.findByText('Aberto')).toBeTruthy();

    const trigger = container.querySelector('div')!;
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerMove(trigger);
    expect(
      await screen.findByText(`Horário hoje: ${abre} - ${fecha} (vira o dia)`),
    ).toBeTruthy();
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

/**
 * Regra de horário que o selo e o diálogo compartilham. A regra vem de
 * `BusinessHoursIndicator` e é a mesma dos dois consumidores — por isso os
 * casos de janela normal, noturna e dia fechado ficam aqui, com minutos fixos.
 */
describe('regra de horário comercial (função pura)', () => {
  it('lê HH:MM e HH:MM:SS e recusa valor inválido', () => {
    expect(minutosDoHorario('09:30')).toBe(570);
    expect(minutosDoHorario('22:15:00')).toBe(1335);
    expect(minutosDoHorario('25:00')).toBeNull();
    expect(minutosDoHorario('')).toBeNull();
    expect(minutosDoHorario(null)).toBeNull();
  });

  it('classifica janela normal, noturna e inválida', () => {
    expect(classificarJanela('09:00', '18:00')).toBe('normal');
    expect(classificarJanela('22:00', '06:00')).toBe('noturna');
    expect(classificarJanela('09:00', '09:00')).toBe('igual');
    expect(classificarJanela('09:00', '99:00')).toBe('incompleta');
  });

  it('janela normal: dentro das 09:00 às 18:00 (inclusive nas bordas)', () => {
    expect(estaNaJanela(12 * 60, '09:00', '18:00')).toBe(true);
    expect(estaNaJanela(9 * 60, '09:00', '18:00')).toBe(true);
    expect(estaNaJanela(18 * 60, '09:00', '18:00')).toBe(true);
    expect(estaNaJanela(8 * 60 + 59, '09:00', '18:00')).toBe(false);
    expect(estaNaJanela(18 * 60 + 1, '09:00', '18:00')).toBe(false);
  });

  it('janela noturna 22:00→06:00: aberta de noite E de madrugada, fechada à tarde', () => {
    expect(estaNaJanela(23 * 60, '22:00', '06:00')).toBe(true);
    expect(estaNaJanela(5 * 60, '22:00', '06:00')).toBe(true);
    expect(estaNaJanela(22 * 60, '22:00', '06:00')).toBe(true);
    expect(estaNaJanela(6 * 60, '22:00', '06:00')).toBe(true);
    expect(estaNaJanela(12 * 60, '22:00', '06:00')).toBe(false);
    expect(estaNaJanela(6 * 60 + 1, '22:00', '06:00')).toBe(false);
  });

  it('início igual ao fim não é janela: fica fechado e marcado como inválido', () => {
    const resumo = resumoDoDia({ is_open: true, open_time: '09:00', close_time: '09:00' }, 10 * 60);
    expect(resumo.motivo).toBe('horario-invalido');
    expect(resumo.isOpen).toBe(false);
    expect(resumo.intervalo).toBeNull();
  });

  it('fim de semana fechado: motivo "fechado-hoje"', () => {
    const domingo = resumoDoDia({ is_open: false, open_time: '09:00', close_time: '18:00' }, 10 * 60);
    expect(domingo.motivo).toBe('fechado-hoje');
    expect(domingo.isOpen).toBe(false);
  });

  it('janela noturna no resumo do dia: aberto, "vira o dia" e intervalo do cadastro', () => {
    const resumo = resumoDoDia({ is_open: true, open_time: '22:00', close_time: '06:00' }, 23 * 60);
    expect(resumo.isOpen).toBe(true);
    expect(resumo.viraODia).toBe(true);
    expect(resumo.intervalo).toBe('22:00 - 06:00');
  });
});
