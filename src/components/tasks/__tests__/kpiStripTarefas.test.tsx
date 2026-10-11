/**
 * Etapas 017, 018, 019, 020 e 022 — faixa de KPIs de Tarefas no nível da
 * imagem 01 (planilha §3.1, linhas 41–45 da tabela de elementos).
 *
 * O que este teste tranca (comportamento, não marcação solta):
 *   · 017 Atrasadas — vermelho + "Requer atenção" quando > 0; neutro +
 *     "Tudo em dia" quando 0.
 *   · 018 Para hoje — âmbar + "Vencem hoje"; "Nada vence hoje" quando 0.
 *   · 019 Fazendo — "n/3" com anel SVG de progresso; "Em andamento" abaixo do
 *     limite e "Limite atingido" em tom destrutivo em 3/3 (D… §3.6 item 14).
 *   · 020 Concluídas · 7 dias — rótulo novo + "Últimos 7 dias", em verde.
 *   · 022 Tempo médio — usa `avgLeadTimeDays` (D13) com a formatação de
 *     `formatLeadTime` ("1,4 dias" / "1 dia" / "—") e NÃO o tempo de ciclo.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { axe } from 'vitest-axe';
import { render, screen, cleanup } from '@testing-library/react';

import { TasksKpiStrip } from '@/components/tasks/shared/TasksKpiStrip';
import { WIP_LIMITS } from '@/hooks/tasks/workItem.types';
import type { KpiSnapshot } from '@/hooks/tasks/workItemAggregates';

afterEach(() => cleanup());

/** 2 atrasadas · 4 para hoje · 3 fazendo (no limite) · 5 concluídas · 1,4 dias. */
const CHEIO: KpiSnapshot = {
  overdue: 2,
  dueToday: 4,
  doingCount: 3,
  done7d: 5,
  avgCycleTimeDays: 9,
  avgLeadTimeDays: 1.4,
};

const LIMITE = WIP_LIMITS.doing.hard ?? 0;

function parteDoCard(label: string, testid: string): string {
  const card = screen.getByText(label).closest('[data-testid="kpi-card"]') as HTMLElement;
  const el = card.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null;
  return el ? (testid === 'kpi-value' || testid === 'kpi-subtitle' ? el.textContent ?? '' : el.className) : '<sem elemento>';
}

const subtitulo = (label: string) => parteDoCard(label, 'kpi-subtitle');
const valor = (label: string) => parteDoCard(label, 'kpi-value');
const tile = (label: string) => parteDoCard(label, 'kpi-tile');
const subtituloClasse = (label: string) => {
  const card = screen.getByText(label).closest('[data-testid="kpi-card"]') as HTMLElement;
  return card.querySelector('[data-testid="kpi-subtitle"]')?.className ?? '';
};

describe('TasksKpiStrip — etapa 017 (Atrasadas)', () => {
  it('com atrasadas: tile vermelho e subtítulo "Requer atenção" em tom destrutivo', () => {
    render(<TasksKpiStrip kpis={CHEIO} />);
    expect(tile('Atrasadas')).toContain('bg-destructive/15');
    expect(subtitulo('Atrasadas')).toBe('Requer atenção');
    expect(subtituloClasse('Atrasadas')).toContain('text-destructive');
  });

  it('sem atrasadas: tile neutro e subtítulo "Tudo em dia", sem tom destrutivo', () => {
    render(<TasksKpiStrip kpis={{ ...CHEIO, overdue: 0 }} />);
    expect(valor('Atrasadas')).toBe('0');
    expect(tile('Atrasadas')).toContain('bg-muted');
    expect(tile('Atrasadas')).not.toContain('bg-destructive/15');
    expect(subtitulo('Atrasadas')).toBe('Tudo em dia');
    expect(subtituloClasse('Atrasadas')).not.toContain('text-destructive');
  });
});

describe('TasksKpiStrip — etapa 018 (Para hoje)', () => {
  it('tile âmbar e "Vencem hoje" quando há algo para hoje', () => {
    render(<TasksKpiStrip kpis={CHEIO} />);
    expect(tile('Para hoje')).toContain('bg-kpi-yellow');
    expect(subtitulo('Para hoje')).toBe('Vencem hoje');
  });

  it('com 0 diz "Nada vence hoje" e mantém o tile âmbar', () => {
    render(<TasksKpiStrip kpis={{ ...CHEIO, dueToday: 0 }} />);
    expect(valor('Para hoje')).toBe('0');
    expect(tile('Para hoje')).toContain('bg-kpi-yellow');
    expect(subtitulo('Para hoje')).toBe('Nada vence hoje');
  });
});

describe('TasksKpiStrip — etapa 019 (Fazendo, anel do limite)', () => {
  it('mostra "n/3", anel azul de progresso e "Limite atingido" no limite', () => {
    render(<TasksKpiStrip kpis={CHEIO} />);
    expect(valor('Fazendo')).toBe(`3/${LIMITE}`);
    expect(subtitulo('Fazendo')).toBe('Limite atingido');
    expect(subtituloClasse('Fazendo')).toContain('text-destructive');

    const card = screen.getByText('Fazendo').closest('[data-testid="kpi-card"]') as HTMLElement;
    const anel = card.querySelector('[data-testid="kpi-ring"]') as SVGCircleElement | null;
    expect(anel).toBeTruthy();
    expect(tile('Fazendo')).toContain('bg-kpi-blue');

    // 3/3 = anel cheio: o traço restante (dashoffset) é zero.
    const progresso = anel!.querySelectorAll('circle')[1];
    expect(Number(progresso.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 5);
  });

  it('abaixo do limite: "Em andamento" e anel proporcional (1/3)', () => {
    render(<TasksKpiStrip kpis={{ ...CHEIO, doingCount: 1 }} />);
    expect(valor('Fazendo')).toBe(`1/${LIMITE}`);
    expect(subtitulo('Fazendo')).toBe('Em andamento');
    expect(subtituloClasse('Fazendo')).not.toContain('text-destructive');

    const card = screen.getByText('Fazendo').closest('[data-testid="kpi-card"]') as HTMLElement;
    const circulos = card.querySelectorAll('[data-testid="kpi-ring"] circle');
    const r = Number(circulos[0].getAttribute('r'));
    const circunferencia = 2 * Math.PI * r;
    const dashoffset = Number(circulos[1].getAttribute('stroke-dashoffset'));
    expect(dashoffset).toBeCloseTo(circunferencia * (1 - 1 / LIMITE), 3);
  });
});

describe('TasksKpiStrip — etapa 020 (Concluídas · 7 dias)', () => {
  it('usa o rótulo novo, o subtítulo "Últimos 7 dias" e o tile verde', () => {
    render(<TasksKpiStrip kpis={CHEIO} />);
    expect(valor('Concluídas · 7 dias')).toBe('5');
    expect(subtitulo('Concluídas · 7 dias')).toBe('Últimos 7 dias');
    expect(tile('Concluídas · 7 dias')).toContain('bg-kpi-green');
  });
});

describe('TasksKpiStrip — etapa 022 (Tempo médio, D13)', () => {
  it('usa avgLeadTimeDays com a formatação pt-BR do cartão T03, não o ciclo', () => {
    render(<TasksKpiStrip kpis={CHEIO} />);
    // ciclo = 9 dias: se o card lesse `avgCycleTimeDays` mostraria "9d"/"9 dias".
    expect(valor('Tempo médio')).toBe('1,4 dias');
    expect(subtitulo('Tempo médio')).toBe('Da criação à conclusão');
    expect(tile('Tempo médio')).toContain('bg-muted');
  });

  it('sem dados mostra o travessão (—)', () => {
    render(<TasksKpiStrip kpis={{ ...CHEIO, avgLeadTimeDays: null }} />);
    expect(valor('Tempo médio')).toBe('—');
  });

  it('um dia exato escreve "1 dia" no singular', () => {
    render(<TasksKpiStrip kpis={{ ...CHEIO, avgLeadTimeDays: 1 }} />);
    expect(valor('Tempo médio')).toBe('1 dia');
  });
});

describe('TasksKpiStrip — acessibilidade', () => {
  it('não tem violação de axe e mantém os 5 cards', async () => {
    const { container } = render(<TasksKpiStrip kpis={CHEIO} />);
    expect(screen.getAllByTestId('kpi-card')).toHaveLength(5);
    for (const s of screen.getAllByTestId('kpi-subtitle')) expect(s.textContent).not.toBe('');
    expect(await axe(container)).toHaveNoViolations();
  });
});
