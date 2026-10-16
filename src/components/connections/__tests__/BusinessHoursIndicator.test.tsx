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
  rows: [] as Array<{
    day_of_week?: number;
    is_open: boolean;
    open_time?: string;
    close_time?: string;
  }>,
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
        in: (...args: unknown[]) => {
          h.filters.push(['in', ...args]);
          return builder;
        },
        order: (...args: unknown[]) => {
          h.filters.push(['order', ...args]);
          return builder;
        },
        limit: (...args: unknown[]) => {
          h.filters.push(['limit', ...args]);
          return builder;
        },
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
  resumoDoHorario,
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

/** Dia da semana de hoje e de ontem, na MESMA referência de fuso do componente. */
const DIA_HOJE = agoraBrasil().getDay();
const DIA_ONTEM = (DIA_HOJE + 6) % 7;

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [];
  h.error = null;
  h.filters = [];
});

describe('BusinessHoursIndicator — estados do selo', () => {
  it('sem linha para hoje, mostra “Fechado” e diz que não há horário configurado', async () => {
    const { container } = setup();
    expect(await screen.findByText('Fechado')).toBeTruthy();
    expect(screen.queryByText('Aberto')).toBeNull();

    const trigger = container.querySelector('div')!;
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerMove(trigger);
    expect(await screen.findByText('Sem horário configurado')).toBeTruthy();
  });

  it('sem linha para hoje, a madrugada herdada de ontem ainda abre', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date('2026-10-17T02:00:00-03:00')); // sábado, 02:00 em São Paulo
      h.rows = [
        { day_of_week: 5, is_open: true, open_time: '22:00:00', close_time: '06:00:00' },
      ];

      const { container } = setup();
      expect(await screen.findByText('Aberto')).toBeTruthy();

      const trigger = container.querySelector('div')!;
      fireEvent.pointerEnter(trigger);
      fireEvent.pointerMove(trigger);
      expect(
        await screen.findByText('Janela de ontem: 22:00 - 06:00 (vira o dia)'),
      ).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('dia marcado como fechado mostra “Fechado” e o motivo', async () => {
    h.rows = [
      { day_of_week: DIA_HOJE, is_open: false, open_time: '09:00:00', close_time: '18:00:00' },
    ];
    const { container } = setup();
    expect(await screen.findByText('Fechado')).toBeTruthy();

    const trigger = container.querySelector('div')!;
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerMove(trigger);
    expect(await screen.findByText('Horário hoje: Fechado hoje')).toBeTruthy();
  });

  it('dentro da janela do dia mostra “Aberto” com o horário de hoje', async () => {
    h.rows = [
      { day_of_week: DIA_HOJE, is_open: true, open_time: '00:00:00', close_time: '23:59:00' },
    ];
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
    h.rows = [
      {
        day_of_week: DIA_HOJE,
        is_open: true,
        open_time: `${janela.open}:00`,
        close_time: `${janela.close}:00`,
      },
    ];

    setup();
    expect(await screen.findByText('Fechado')).toBeTruthy();
    expect(screen.queryByText('Aberto')).toBeNull();
  });

  it('janela que vira o dia (início > fim) fica aberta e avisa que vira o dia', async () => {
    // Janela noturna em vigor AGORA: de madrugada ela vem da linha de ONTEM
    // (22:00→06:00); fora dela, da linha de hoje (início 1 h atrás, fim 2 h
    // atrás — início > fim).
    const agora = agoraBrasil();
    const agoraMinutos = agora.getHours() * 60 + agora.getMinutes();
    const madrugada = agoraMinutos <= 6 * 60;
    const abre = madrugada ? '22:00' : hojeDeslocado(-60);
    const fecha = madrugada ? '06:00' : hojeDeslocado(-120);
    h.rows = [
      {
        day_of_week: madrugada ? DIA_ONTEM : DIA_HOJE,
        is_open: true,
        open_time: `${abre}:00`,
        close_time: `${fecha}:00`,
      },
    ];

    const { container } = setup();
    expect(await screen.findByText('Aberto')).toBeTruthy();

    const trigger = container.querySelector('div')!;
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerMove(trigger);
    expect(
      await screen.findByText(
        madrugada
          ? `Janela de ontem: ${abre} - ${fecha} (vira o dia)`
          : `Horário hoje: ${abre} - ${fecha} (vira o dia)`,
      ),
    ).toBeTruthy();
  });

  it('madrugada: sábado 02:00 com a sexta aberta até as 06:00 mostra “Aberto” e a janela de ontem', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date('2026-10-17T02:00:00-03:00')); // sábado, 02:00 em São Paulo
      h.rows = [
        { day_of_week: 5, is_open: true, open_time: '22:00:00', close_time: '06:00:00' },
        { day_of_week: 6, is_open: false, open_time: '09:00:00', close_time: '18:00:00' },
      ];

      const { container } = setup();
      expect(await screen.findByText('Aberto')).toBeTruthy();

      const trigger = container.querySelector('div')!;
      fireEvent.pointerEnter(trigger);
      fireEvent.pointerMove(trigger);
      expect(
        await screen.findByText('Janela de ontem: 22:00 - 06:00 (vira o dia)'),
      ).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lê a conexão e os dois dias (hoje e ontem) de uma vez, com ordem e limite', async () => {
    setup();
    await waitFor(() =>
      expect(h.filters.some((f) => f[0] === 'in' && f[1] === 'day_of_week')).toBe(true),
    );
    expect(h.filters).toContainEqual(['eq', 'whatsapp_connection_id', 'conn-1']);
    expect(h.filters.find((f) => f[0] === 'in')?.[2]).toEqual([DIA_ONTEM, DIA_HOJE]);
    expect(h.filters).toContainEqual(['order', 'day_of_week', { ascending: true }]);
    expect(h.filters).toContainEqual(['limit', 2]);
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
    expect(minutosDoHorario('9:05')).toBe(545);
    expect(minutosDoHorario('25:00')).toBeNull();
    expect(minutosDoHorario('')).toBeNull();
    expect(minutosDoHorario(null)).toBeNull();
  });

  it('rejeita texto colado ao horário e segundos inválidos', () => {
    expect(minutosDoHorario('09:00xyz')).toBeNull();
    expect(minutosDoHorario('9:05abc')).toBeNull();
    expect(minutosDoHorario('09:00:99')).toBeNull();
    expect(minutosDoHorario('09:60')).toBeNull();
    expect(classificarJanela('09:00xyz', '18:00')).toBe('incompleta');
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

  it('janela noturna 22:00→06:00: o dia abre às 22:00; a madrugada é da linha de ontem', () => {
    expect(estaNaJanela(22 * 60, '22:00', '06:00')).toBe(true);
    expect(estaNaJanela(23 * 60 + 59, '22:00', '06:00')).toBe(true);
    expect(estaNaJanela(5 * 60, '22:00', '06:00')).toBe(false);
    expect(estaNaJanela(6 * 60, '22:00', '06:00')).toBe(false);
    expect(estaNaJanela(12 * 60, '22:00', '06:00')).toBe(false);
  });

  it('a madrugada não é coberta pela própria linha noturna (só pela de ontem)', () => {
    const resumo = resumoDoDia({ is_open: true, open_time: '22:00', close_time: '06:00' }, 2 * 60);
    expect(resumo.isOpen).toBe(false);
    expect(resumo.motivo).toBe('fora');
    expect(resumo.viraODia).toBe(true);
  });

  it('início igual ao fim não é janela: fica fechado e marcado como inválido', () => {
    const resumo = resumoDoDia({ is_open: true, open_time: '09:00', close_time: '09:00' }, 10 * 60);
    expect(resumo.motivo).toBe('horario-invalido');
    expect(resumo.isOpen).toBe(false);
    expect(resumo.intervalo).toBeNull();
  });

  it('janela igual no selo: “Fechado” com o aviso de horário inválido, nunca “vira o dia” da própria linha', async () => {
    h.rows = [
      { day_of_week: DIA_HOJE, is_open: true, open_time: '09:00:00', close_time: '09:00:00' },
    ];
    const { container } = setup();
    expect(await screen.findByText('Fechado')).toBeTruthy();
    expect(screen.queryByText('Aberto')).toBeNull();

    const trigger = container.querySelector('div')!;
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerMove(trigger);
    expect(
      await screen.findByText(
        'Horário de hoje inválido: início e fim iguais — ajuste em Horário de Atendimento',
      ),
    ).toBeTruthy();
  });

  it('janela igual nunca vira motivo fora/dentro da própria linha', () => {
    const sozinha = resumoDoHorario(
      { is_open: true, open_time: '09:00', close_time: '09:00' },
      10 * 60,
      null,
    );
    expect(sozinha.motivo).toBe('horario-invalido');
    expect(sozinha.isOpen).toBe(false);
    expect(sozinha.viraODia).toBe(false);
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

  it('madrugada pertence ao dia anterior: sábado fechado + sexta 22:00→06:00 abre às 02:00', () => {
    const sexta = { is_open: true, open_time: '22:00', close_time: '06:00' };
    const sabado = { is_open: false, open_time: '09:00', close_time: '18:00' };

    const madrugada = resumoDoHorario(sabado, 2 * 60, sexta);
    expect(madrugada.isOpen).toBe(true);
    expect(madrugada.motivo).toBe('dentro');
    expect(madrugada.origem).toBe('ontem');
    expect(madrugada.intervalo).toBe('22:00 - 06:00');
  });

  it('passada a madrugada, o sábado fechado volta a fechar e o dia aberto manda', () => {
    const sexta = { is_open: true, open_time: '22:00', close_time: '06:00' };
    const sabado = { is_open: false, open_time: '09:00', close_time: '18:00' };

    const fimDaMadrugada = resumoDoHorario(sabado, 7 * 60, sexta);
    expect(fimDaMadrugada.isOpen).toBe(false);
    expect(fimDaMadrugada.motivo).toBe('fechado-hoje');

    const sabadoAberto = resumoDoHorario(
      { is_open: true, open_time: '09:00', close_time: '18:00' },
      10 * 60,
      sexta,
    );
    expect(sabadoAberto.isOpen).toBe(true);
    expect(sabadoAberto.origem).toBe('hoje');
  });

  it('sem a linha de ontem, a madrugada fica fechada mesmo com a noturna de hoje', () => {
    const resumo = resumoDoHorario(
      { is_open: true, open_time: '22:00', close_time: '06:00' },
      2 * 60,
      null,
    );
    expect(resumo.isOpen).toBe(false);
    expect(resumo.motivo).toBe('fora');
  });

  it('janela normal de hoje não abre a madrugada: às 02:00 quem manda é a janela de ontem', () => {
    const sexta = { is_open: true, open_time: '22:00', close_time: '06:00' };
    const sabado = resumoDoHorario(
      { is_open: true, open_time: '09:00', close_time: '18:00' },
      2 * 60,
      sexta,
    );
    expect(sabado.isOpen).toBe(true);
    expect(sabado.origem).toBe('ontem');
    expect(sabado.intervalo).toBe('22:00 - 06:00');
  });
});
