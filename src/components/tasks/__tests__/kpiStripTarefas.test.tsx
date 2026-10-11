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
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

import { TasksKpiStrip, TasksKpiStripSkeleton } from '@/components/tasks/shared/TasksKpiStrip';
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

/**
 * Etapas 023 e 025–028 (cartão T13, 11/10/2026) — o que este teste tranca:
 *   · 023 o recorte de PRAZO é do módulo; o card publica `onToggleDue('overdue'
 *     |'today')`, marca `aria-pressed` e mostra o selo do recorte ativo. Sem
 *     handler o card continua card (não inventa botão).
 *   · 025 na densidade compacta a faixa é UMA linha com separadores e sem os
 *     88px — é ela que o Quadro usa (D2).
 *   · 027 o esqueleto repete a grade e a altura dos cards (sem salto).
 *   · 028 a região viva narra o valor FINAL de cada leitura.
 */
describe('TasksKpiStrip — etapas 023/025/027/028 (interativo, densidade, esqueleto, narração)', () => {
  const cardDe = (label: string): HTMLElement =>
    screen.getByText(label).closest('[data-testid="kpi-card"]') as HTMLElement;

  it('023: Atrasadas e Para hoje publicam o recorte; os outros três não viram botão', () => {
    const recortes: string[] = [];
    render(<TasksKpiStrip kpis={CHEIO} activeDue={null} onToggleDue={(d) => recortes.push(d)} />);

    const atrasadas = within(cardDe('Atrasadas')).getByTestId('kpi-acao');
    const hoje = within(cardDe('Para hoje')).getByTestId('kpi-acao');
    // etapa 023 "Enter e Espaço funcionam": é `<button type=button>` de verdade —
    // o acionamento por teclado é o comportamento nativo, sem handler próprio.
    expect(atrasadas.tagName).toBe('BUTTON');
    expect(atrasadas.getAttribute('type')).toBe('button');
    expect(hoje.tagName).toBe('BUTTON');
    expect(atrasadas.getAttribute('aria-pressed')).toBe('false');
    expect(hoje.getAttribute('aria-pressed')).toBe('false');
    expect(within(cardDe('Atrasadas')).queryByTestId('kpi-chip')).toBeNull();

    fireEvent.click(atrasadas);
    fireEvent.click(atrasadas);
    fireEvent.click(hoje);
    expect(recortes).toEqual(['overdue', 'overdue', 'today']);

    for (const label of ['Fazendo', 'Concluídas · 7 dias', 'Tempo médio']) {
      expect(within(cardDe(label)).queryByTestId('kpi-acao')).toBeNull();
    }
  });

  it('023: sem handler de recorte nenhum card é botão (a faixa lê, não age)', async () => {
    const { container } = render(<TasksKpiStrip kpis={CHEIO} />);
    expect(screen.queryAllByTestId('kpi-acao')).toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('023: o card do recorte ativo fica pressionado, com selo, e o rótulo diz o que o clique faz', () => {
    render(<TasksKpiStrip kpis={CHEIO} activeDue="overdue" onToggleDue={() => {}} onOpenBoard={() => {}} />);

    const acao = within(cardDe('Atrasadas')).getByTestId('kpi-acao');
    expect(acao.getAttribute('aria-pressed')).toBe('true');
    expect(within(cardDe('Atrasadas')).getByTestId('kpi-chip').textContent).toContain('Filtrando');
    // o rótulo acessível anuncia o número e o desfecho do clique (remover)
    expect(acao.getAttribute('aria-label')).toContain('Atrasadas: 2');
    expect(acao.getAttribute('aria-label')).toMatch(/Remover/);
    // o selo não vaza para o vizinho, que segue só com o convite de filtrar
    expect(within(cardDe('Para hoje')).queryByTestId('kpi-chip')).toBeNull();
    expect(within(cardDe('Para hoje')).getByTestId('kpi-acao').getAttribute('aria-label')).toMatch(/vencem hoje/);
    // e o "Fazendo" leva ao Quadro (onde o limite de WIP se resolve)
    expect(within(cardDe('Fazendo')).getByTestId('kpi-acao').getAttribute('aria-label')).toMatch(/Abrir o Quadro/);
  });

  it('025: a densidade compacta vira uma faixa em linha, com separador e sem os 88px', () => {
    render(<TasksKpiStrip kpis={CHEIO} density="compact" />);

    const faixa = screen.getByTestId('tasks-kpi-strip');
    expect(faixa.getAttribute('data-density')).toBe('compact');
    expect(faixa.className).toContain('flex-wrap');
    expect(faixa.className).not.toContain('xl:grid-cols-5');

    const cards = screen.getAllByTestId('kpi-card');
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      expect(card.className).not.toContain('h-[88px]');
      expect(card.className).toContain('min-h-[44px]');
      expect(card.getAttribute('data-density')).toBe('compact');
    }
    // 4 separadores ENTRE os 5 itens — nunca antes do primeiro
    const celulas = Array.from(faixa.children) as HTMLElement[];
    expect(celulas).toHaveLength(5);
    expect(celulas[0].className).not.toContain('border-l');
    for (const celula of celulas.slice(1)) expect(celula.className).toContain('border-l');
    // o dado continua o mesmo da faixa cheia
    expect(within(cards[0]).getByTestId('kpi-value').textContent).toBe('2');
    expect(within(cards[4]).getByTestId('kpi-value').textContent).toBe('1,4 dias');
  });

  it('025: compacta e confortável leem os MESMOS números (muda o desenho, não o dado)', () => {
    const valoresDe = () =>
      screen.getAllByTestId('kpi-value').map((v) => v.textContent);
    const { unmount } = render(<TasksKpiStrip kpis={CHEIO} />);
    const confortavel = valoresDe();
    unmount();
    render(<TasksKpiStrip kpis={CHEIO} density="compact" />);
    expect(valoresDe()).toEqual(confortavel);
  });

  it('027: o esqueleto repete a grade da faixa e a altura do card (sem salto de layout)', () => {
    const { unmount } = render(<TasksKpiStrip kpis={CHEIO} />);
    const grade = screen.getByTestId('tasks-kpi-strip').className;
    unmount();

    render(<TasksKpiStripSkeleton />);
    const esqueleto = screen.getByTestId('tasks-kpi-strip-skeleton');
    expect(esqueleto.className).toBe(grade);
    // etapa 026: a grade responsiva é a mesma antes e depois do dado — 2 colunas
    // em 360px, 3 em 768px e 5 a partir de 1280px.
    expect(grade).toContain('grid-cols-2');
    expect(grade).toContain('md:grid-cols-3');
    expect(grade).toContain('xl:grid-cols-5');
    expect(esqueleto.getAttribute('aria-busy')).toBe('true');
    expect(esqueleto.getAttribute('role')).toBe('status');

    const caixas = screen.getAllByTestId('kpi-skeleton-card');
    expect(caixas).toHaveLength(5);
    for (const caixa of caixas) expect(caixa.className).toContain('h-[88px]');
    // nenhum valor de mentira na tela: o esqueleto não tem número
    expect(screen.queryAllByTestId('kpi-value')).toHaveLength(0);
  });

  it('027: o esqueleto também tem a variante compacta da faixa', () => {
    render(<TasksKpiStripSkeleton density="compact" />);
    const esqueleto = screen.getByTestId('tasks-kpi-strip-skeleton');
    expect(esqueleto.getAttribute('data-density')).toBe('compact');
    expect(esqueleto.className).toContain('flex-wrap');
    expect(screen.queryAllByTestId('kpi-skeleton-card')).toHaveLength(0);
  });

  it('028: cada card narra o valor FINAL numa região viva própria', () => {
    render(<TasksKpiStrip kpis={CHEIO} />);

    const vivas = screen.getAllByTestId('kpi-live');
    expect(vivas).toHaveLength(5);
    for (const viva of vivas) {
      expect(viva.getAttribute('role')).toBe('status');
      expect(viva.getAttribute('aria-live')).toBe('polite');
    }
    const anuncio = (label: string) =>
      cardDe(label).querySelector('[data-testid="kpi-live"]')?.textContent ?? '';
    expect(anuncio('Atrasadas')).toBe('Atrasadas: 2');
    expect(anuncio('Para hoje')).toBe('Para hoje: 4');
    expect(anuncio('Fazendo')).toBe('Fazendo: 3/3');
    expect(anuncio('Concluídas · 7 dias')).toBe('Concluídas · 7 dias: 5');
    expect(anuncio('Tempo médio')).toBe('Tempo médio: 1,4 dias');
  });

  it('028: a região viva anuncia o texto do dado (não o quadro da mola) e o faz também no compacto', async () => {
    const { unmount } = render(<TasksKpiStrip kpis={CHEIO} />);
    // o texto exibido é o valor exato já no primeiro render: o dado chegou
    // pronto do esqueleto e a mola é para o que MUDA depois.
    expect(screen.getByText('Atrasadas').closest('[data-testid="kpi-card"]')
      ?.querySelector('[data-testid="kpi-value"]')?.textContent).toBe('2');
    expect(screen.getAllByTestId('kpi-live')[0].textContent).toBe('Atrasadas: 2');
    unmount();

    render(<TasksKpiStrip kpis={CHEIO} density="compact" />);
    expect(screen.getAllByTestId('kpi-live')).toHaveLength(5);
  });

  it('axe: passa com os cards clicáveis (faixa cheia) e na faixa compacta', async () => {
    const { container, unmount } = render(
      <TasksKpiStrip kpis={CHEIO} activeDue="overdue" onToggleDue={() => {}} onOpenBoard={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
    unmount();

    const { container: compacta } = render(
      <TasksKpiStrip kpis={CHEIO} density="compact" onToggleDue={() => {}} />,
    );
    expect(await axe(compacta)).toHaveNoViolations();
  });
});
