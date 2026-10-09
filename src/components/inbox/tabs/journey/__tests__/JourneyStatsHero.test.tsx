/**
 * Testes do `JourneyStatsHero` (etapa S084 do
 * PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS; decisões D09 e D12).
 *
 * O que estes testes provam, e como:
 * - o componente REAL é renderizado e o que o usuário vê/ouve é afirmado (papel, nome
 *   acessível, texto, valor das barras, atributos do SVG) — não há mock do componente;
 * - `prefers-reduced-motion` é trocado pelo `matchMedia` (o componente lê esse matchMedia
 *   por `useSyncExternalStore`) e as duas leituras são provadas: ligado = estado final na
 *   hora; desligado = estado inicial da animação (número em 0, traço não desenhado, classe
 *   de entrada presente);
 * - `requestAnimationFrame` é substituído por um no-op para o teste ser determinístico: o
 *   quadro de animação nunca roda, então o "estado inicial" fica congelado e não há
 *   atualização de estado fora do `act`.
 *
 * O que o jsdom NÃO prova (e por isso não é afirmado aqui): cor, contraste, tamanho de
 * fonte e layout calculado. O que dá para afirmar sobre isso é a REGRA aplicada — nenhuma
 * cor literal (a varredura de classes no DOM) e nenhuma classe de corte nos rótulos — e é
 * isso que os testes abaixo fazem; a prova visual é de navegador e não pertence a este
 * cartão (os arquivos permitidos são só o componente e este teste).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { JourneyStatsHero } from '../JourneyStatsHero';
import type {
  JourneyStatsHeroContact,
  JourneyStatsHeroPeriod,
  JourneyStatsHeroProps,
} from '../JourneyStatsHero';

/** Sobrescritas de teste: `contact`/`period` aceitam só os campos que o caso quer trocar. */
type PropsOverride = Omit<Partial<JourneyStatsHeroProps>, 'contact' | 'period'> & {
  contact?: Partial<JourneyStatsHeroContact>;
  period?: Partial<JourneyStatsHeroPeriod>;
};

const CONSULTA_MOVIMENTO = '(prefers-reduced-motion: reduce)';
const matchMediaOriginal = window.matchMedia;

/** Troca a resposta de `prefers-reduced-motion` — é o mesmo matchMedia que o componente lê. */
function definirMovimentoReduzido(reduzido: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query === CONSULTA_MOVIMENTO ? reduzido : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function props(over: PropsOverride = {}): JourneyStatsHeroProps {
  const base: JourneyStatsHeroProps = {
    loading: false,
    contact: {
      messages: 128,
      sent: 70,
      received: 58,
      calls: 12,
      emails: 9,
      since: '2024-03-05',
      last: '2026-10-06',
      lastLabel: 'há 1 dia',
      avgResponseLabel: '12min',
      episodes: 7,
      csat: { average: 4.5, count: 6 },
    },
    period: {
      label: 'Últimos 30 dias',
      total: 42,
      totalTrendPct: 12,
      lastContactLabel: 'Hoje, 6 de outubro de 2026',
      avgResponseLabel: '9min',
      avgResponseTrendPct: -25,
      resolutions: 5,
      calls: { total: 8, answered: 6, missed: 2, talkLabel: '32min' },
      emails: { sent: 11, received: 7, unanswered: 3 },
      tasks: { open: 4, done: 9, overdue: 1 },
      notes: 6,
      files: 5,
      deals: { count: 2, valueLabel: 'R$ 4.500,00' },
    },
    series: [
      { date: '2026-10-01', count: 3 },
      { date: '2026-10-02', count: 7 },
      { date: '2026-10-03', count: 2 },
      { date: '2026-10-04', count: 9 },
      { date: '2026-10-05', count: 4 },
    ],
    distribution: [
      { key: 'mensagens', label: 'Mensagens', count: 30, barClass: 'bg-primary', dotClass: 'bg-primary' },
      { key: 'ligacoes', label: 'Ligações', count: 10, barClass: 'bg-success', dotClass: 'bg-success' },
    ],
    ranking: [
      { id: 'u1', name: 'Maria Souza', avatarUrl: 'https://exemplo.invalido/maria.png', count: 12, pct: 40 },
      { id: 'u2', name: 'João Lima', avatarUrl: null, count: 9, pct: 30 },
      { id: 'u3', name: 'Ana Reis', avatarUrl: null, count: 6, pct: 20 },
      { id: 'u4', name: 'Fora do topo', avatarUrl: null, count: 3, pct: 10 },
    ],
    peak: { hourLabel: '10h', weekdayLabel: 'terça-feira' },
  };

  return {
    ...base,
    ...over,
    contact: { ...base.contact, ...(over.contact ?? {}) },
    period: { ...base.period, ...(over.period ?? {}) },
  };
}

beforeEach(() => {
  // Sem quadro real: o callback de rAF nunca roda e a animação fica no estado inicial.
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  definirMovimentoReduzido(true);
});

afterEach(() => {
  window.matchMedia = matchMediaOriginal;
  vi.unstubAllGlobals();
});

describe('JourneyStatsHero — estrutura e dados', () => {
  it('renderiza os dois blocos com os valores do contato e do período', () => {
    render(<JourneyStatsHero {...props()} />);

    expect(screen.getByRole('region', { name: 'Estatísticas do contato' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Do contato' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /No período/ })).toBeInTheDocument();
    expect(screen.getByTestId('journey-stats-hero-period-label')).toHaveTextContent('Últimos 30 dias');

    // valores do contato (movimento reduzido = número final na hora)
    expect(screen.getByTestId('journey-stat-mensagens-value')).toHaveTextContent('128');
    expect(screen.getByTestId('journey-stat-mensagens-sublabel')).toHaveTextContent('70 enviadas · 58 recebidas');
    expect(screen.getByTestId('journey-stat-ligacoes-value')).toHaveTextContent('12');
    expect(screen.getByTestId('journey-stat-emails-value')).toHaveTextContent('9');
    expect(screen.getByTestId('journey-stat-atendimentos-value')).toHaveTextContent('7');
    expect(screen.getByTestId('journey-stat-tempo-resposta')).toHaveTextContent('12min');
    expect(screen.getByTestId('journey-stat-csat')).toHaveTextContent('4,5');
    expect(screen.getByTestId('journey-stat-csat-sublabel')).toHaveTextContent('6 avaliações');
    expect(screen.getByTestId('journey-stat-desde')).toHaveTextContent('05/03/2024');

    // valores do período
    expect(screen.getByTestId('journey-stat-total-value')).toHaveTextContent('42');
    expect(screen.getByTestId('journey-stat-ultimo-contato')).toHaveTextContent('Hoje, 6 de outubro de 2026');
    expect(screen.getByTestId('journey-stat-resolucoes-value')).toHaveTextContent('5');

    // detalhe do período
    expect(screen.getByTestId('journey-stat-ligacoes-periodo-value')).toHaveTextContent('8');
    expect(screen.getByTestId('journey-stat-ligacoes-periodo-sublabel')).toHaveTextContent(
      '6 atendidas · 2 perdidas · 32min falados',
    );
    expect(screen.getByTestId('journey-stat-emails-periodo-value')).toHaveTextContent('18');
    expect(screen.getByTestId('journey-stat-tarefas-periodo-value')).toHaveTextContent('13');
    expect(screen.getByTestId('journey-stat-notas-periodo-value')).toHaveTextContent('6');
    expect(screen.getByTestId('journey-stat-arquivos-periodo-value')).toHaveTextContent('5');
    expect(screen.getByTestId('journey-stat-propostas-periodo-value')).toHaveTextContent('2');
    expect(screen.getByTestId('journey-stat-propostas-periodo-sublabel')).toHaveTextContent('R$ 4.500,00');
  });

  it('mantém a grade de 2 colunas no celular e 4 no desktop nos dois blocos de cartões', () => {
    render(<JourneyStatsHero {...props()} />);

    for (const grid of ['journey-stats-hero-contact-grid', 'journey-stats-hero-period-grid']) {
      const classe = screen.getByTestId(grid).className;
      expect(classe).toContain('grid-cols-2');
      expect(classe).toContain('md:grid-cols-4');
    }
  });

  it('com dados vazios mostra traços e estados vazios, sem quebrar', () => {
    render(
      <JourneyStatsHero
        {...props({
          contact: {
            messages: 0,
            sent: 0,
            received: 0,
            calls: 0,
            emails: 0,
            since: null,
            last: null,
            lastLabel: 'sem contato registrado',
            avgResponseLabel: '—',
            episodes: 0,
            csat: { average: null, count: 0 },
          },
          period: {
            total: 0,
            totalTrendPct: null,
            lastContactLabel: '—',
            avgResponseLabel: '—',
            avgResponseTrendPct: null,
            resolutions: 0,
            calls: { total: 0, answered: 0, missed: 0, talkLabel: '0min' },
            emails: { sent: 0, received: 0, unanswered: 0 },
            tasks: { open: 0, done: 0, overdue: 0 },
            notes: 0,
            files: 0,
            deals: { count: 0, valueLabel: '—' },
          },
          series: [],
          distribution: [],
          ranking: [],
          peak: null,
        })}
      />,
    );

    expect(screen.getByTestId('journey-stat-csat')).toHaveTextContent('—');
    expect(screen.getByTestId('journey-stat-csat-sublabel')).toHaveTextContent('Sem avaliações');
    expect(screen.getByTestId('journey-stat-desde')).toHaveTextContent('—');
    expect(screen.getAllByText('Sem dados no período.')).toHaveLength(2); // gráfico + distribuição
    expect(screen.getByText('Sem atendimentos no período.')).toBeInTheDocument();
    expect(screen.queryByTestId('journey-stats-hero-peak')).not.toBeInTheDocument();
    expect(screen.queryByTestId('journey-stat-total-trend')).not.toBeInTheDocument();
  });

  it('em carga mostra o esqueleto com shimmer e nenhum cartão', () => {
    const { container } = render(<JourneyStatsHero {...props({ loading: true })} />);

    const status = screen.getByRole('status', { name: 'Carregando estatísticas do contato' });
    expect(status).toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton-shimmer').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('journey-stat-mensagens')).not.toBeInTheDocument();
    expect(screen.queryByTestId('journey-stats-hero-series')).not.toBeInTheDocument();
  });
});

describe('JourneyStatsHero — tendência', () => {
  it('tendência positiva mostra seta de alta, sinal + e a cor de sucesso', () => {
    render(<JourneyStatsHero {...props({ period: { totalTrendPct: 12 } })} />);

    const selo = screen.getByTestId('journey-stat-total-trend');
    expect(selo).toHaveTextContent('+12%');
    expect(selo).toHaveTextContent('Tendência: aumento de 12%');
    expect(selo.className).toContain('text-success');
  });

  it('tendência negativa mostra seta de queda, sinal − e a cor de perigo', () => {
    render(<JourneyStatsHero {...props({ period: { totalTrendPct: -8 } })} />);

    const selo = screen.getByTestId('journey-stat-total-trend');
    expect(selo).toHaveTextContent('\u22128%');
    expect(selo).toHaveTextContent('Tendência: queda de 8%');
    expect(selo.className).toContain('text-destructive');
  });

  it('tendência nula (sem base de comparação) não desenha selo', () => {
    render(<JourneyStatsHero {...props({ period: { totalTrendPct: null } })} />);

    expect(screen.queryByTestId('journey-stat-total-trend')).not.toBeInTheDocument();
  });

  it('no tempo de resposta a queda é MELHOR: −25% sai verde, e a alta sai vermelha', () => {
    const { unmount } = render(<JourneyStatsHero {...props({ period: { avgResponseTrendPct: -25 } })} />);

    const caiu = screen.getByTestId('journey-stat-tempo-periodo-trend');
    expect(caiu).toHaveTextContent('Tendência: queda de 25%');
    expect(caiu.className).toContain('text-success');
    unmount();

    render(<JourneyStatsHero {...props({ period: { avgResponseTrendPct: 40 } })} />);

    const subiu = screen.getByTestId('journey-stat-tempo-periodo-trend');
    expect(subiu).toHaveTextContent('Tendência: aumento de 40%');
    expect(subiu.className).toContain('text-destructive');
  });
});

describe('JourneyStatsHero — rótulos e escalonamento', () => {
  it('nenhum rótulo ou sublabel carrega classe de corte e o texto longo aparece inteiro', () => {
    const rotuloLongo = 'Último contato há 3 meses e 2 dias';
    const { container } = render(<JourneyStatsHero {...props({ contact: { lastLabel: rotuloLongo } })} />);

    const classesDeCorte = /(^|\s)(truncate|text-ellipsis|line-clamp-\d+)(\s|$)/;
    const rotulos = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid$="-label"], [data-testid$="-sublabel"]'),
    );
    expect(rotulos.length).toBeGreaterThan(0);

    for (const rotulo of rotulos) {
      expect(rotulo.textContent?.trim().length).toBeGreaterThan(0);
      let no: HTMLElement | null = rotulo;
      while (no) {
        expect(`${no.tagName}:${no.className}`).not.toMatch(classesDeCorte);
        no = no.parentElement;
      }
    }

    // o defeito do print ("Tempo médio de respos…") não volta: rótulo inteiro, sem reticências
    const tempo = screen.getByTestId('journey-stat-tempo-resposta-label');
    expect(tempo).toHaveTextContent('Tempo médio de resposta');
    expect(tempo.textContent).not.toContain('…');
    expect(screen.getByTestId('journey-stat-desde-sublabel')).toHaveTextContent(rotuloLongo);
  });

  it('a entrada é escalonada por 60 ms e o teto é de 8 cartões', () => {
    definirMovimentoReduzido(false);
    render(<JourneyStatsHero {...props()} />);

    // 1º cartão: sem atraso; 8º (índice 7): 420 ms; do 9º em diante o atraso NÃO cresce.
    expect(screen.getByTestId('journey-stat-mensagens').style.animationDelay).toBe('');
    expect(screen.getByTestId('journey-stat-total').style.animationDelay).toBe('420ms');
    expect(screen.getByTestId('journey-stat-tempo-periodo').style.animationDelay).toBe('420ms');
    expect(screen.getByTestId('journey-stat-propostas-periodo').style.animationDelay).toBe('420ms');
  });
});

describe('JourneyStatsHero — gráfico da série diária', () => {
  it('com 0 pontos mostra o resumo textual e não desenha traço', () => {
    const grafico = (render(<JourneyStatsHero {...props({ series: [] })} />), screen.getByTestId('journey-stats-hero-series'));

    expect(within(grafico).getByRole('img', { name: 'Série diária: sem dados no período.' })).toBeInTheDocument();
    expect(grafico.querySelector('polyline')).toBeNull();
    expect(grafico.querySelector('circle')).toBeNull();
    expect(grafico).toHaveTextContent('Sem dados no período.');
  });

  it('com 1 ponto desenha o ponto e nenhum traço', () => {
    render(<JourneyStatsHero {...props({ series: [{ date: '2026-10-06', count: 5 }] })} />);

    const grafico = screen.getByTestId('journey-stats-hero-series');
    expect(grafico.querySelector('circle')).not.toBeNull();
    expect(grafico.querySelector('polyline')).toBeNull();
    expect(
      screen.getByRole('img', {
        name: 'Série diária: 1 dia, de 2026-10-06 a 2026-10-06, 5 interações no total, máximo de 5 em um dia.',
      }),
    ).toBeInTheDocument();
  });

  it('com N pontos desenha um traço com um ponto por dia e resume o período', () => {
    render(<JourneyStatsHero {...props()} />);

    const traco = screen.getByTestId('journey-stats-hero-series').querySelector('polyline');
    expect(traco).not.toBeNull();
    expect(traco!.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(5);
    expect(
      screen.getByRole('img', {
        name: 'Série diária: 5 dias, de 2026-10-01 a 2026-10-05, 25 interações no total, máximo de 9 em um dia.',
      }),
    ).toBeInTheDocument();
  });

  it('desenha o traço em movimento e entrega o traço pronto em movimento reduzido', () => {
    definirMovimentoReduzido(false);
    const { unmount } = render(<JourneyStatsHero {...props()} />);
    const comMovimento = screen
      .getByTestId('journey-stats-hero-series')
      .querySelector('polyline') as SVGPolylineElement;
    expect(Number.parseFloat(comMovimento.style.strokeDashoffset)).toBeGreaterThan(0);
    expect(comMovimento.style.strokeDashoffset).toBe(comMovimento.style.strokeDasharray);
    expect(comMovimento.style.transition).toBe('stroke-dashoffset 600ms ease-out');
    unmount();

    definirMovimentoReduzido(true);
    render(<JourneyStatsHero {...props()} />);
    const semAnimacao = screen
      .getByTestId('journey-stats-hero-series')
      .querySelector('polyline') as SVGPolylineElement;
    expect(semAnimacao.style.strokeDashoffset).toBe('0');
    expect(semAnimacao.style.transition).toBe('');
    expect(semAnimacao.style.strokeDasharray).toBe(comMovimento.style.strokeDasharray);
  });
});

describe('JourneyStatsHero — distribuição, ranking e pico', () => {
  it('a barra empilhada é proporcional e a legenda traz rótulo e contagem', () => {
    render(<JourneyStatsHero {...props()} />);

    const barra = screen.getByRole('img', {
      name: 'Distribuição no período: Mensagens 30, Ligações 10.',
    });
    expect(barra).toBeInTheDocument();
    expect(screen.getByTestId('journey-stats-hero-distribution-mensagens').style.width).toBe('75%');
    expect(screen.getByTestId('journey-stats-hero-distribution-ligacoes').style.width).toBe('25%');
    expect(screen.getByTestId('journey-stats-hero-legend-mensagens')).toHaveTextContent('Mensagens');
    expect(screen.getByTestId('journey-stats-hero-legend-mensagens')).toHaveTextContent('30');
  });

  it('o ranking mostra só o top 3, com foto quando existe e iniciais quando não existe', () => {
    const { container } = render(<JourneyStatsHero {...props()} />);

    const comFoto = screen.getByTestId('journey-stats-hero-ranking-u1');
    expect(comFoto.querySelector('img')?.getAttribute('src')).toBe('https://exemplo.invalido/maria.png');
    expect(comFoto).toHaveAccessibleName('1º lugar: Maria Souza, 12 atendimentos, 40% do total');

    const semFoto = screen.getByTestId('journey-stats-hero-ranking-u2');
    expect(semFoto.querySelector('img')).toBeNull();
    expect(within(semFoto).getByText('JL')).toBeInTheDocument();
    expect(semFoto).toHaveTextContent('João Lima');
    expect(semFoto).toHaveTextContent('30%');

    expect(screen.queryByTestId('journey-stats-hero-ranking-u4')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid^="journey-stats-hero-ranking-u"]')).toHaveLength(3);
  });

  it('mostra o horário/dia mais ativo quando existe e some quando não existe', () => {
    const { unmount } = render(<JourneyStatsHero {...props()} />);

    const pico = screen.getByTestId('journey-stats-hero-peak');
    expect(pico).toHaveTextContent('10h · terça-feira');
    expect(pico).toHaveAccessibleName('Horário mais ativo: 10h; dia mais ativo: terça-feira');
    unmount();

    render(<JourneyStatsHero {...props({ peak: null })} />);
    expect(screen.queryByTestId('journey-stats-hero-peak')).not.toBeInTheDocument();
  });
});

describe('JourneyStatsHero — movimento reduzido', () => {
  it('com movimento ligado os números começam em 0 e os cartões entram animando', () => {
    definirMovimentoReduzido(false);
    render(<JourneyStatsHero {...props()} />);

    expect(screen.getByTestId('journey-stat-mensagens-value')).toHaveTextContent('0');
    expect(screen.getByTestId('journey-stat-total-value')).toHaveTextContent('0');
    expect(screen.getByTestId('journey-stat-mensagens').className).toContain('motion-safe:animate-in');
    expect(screen.getByTestId('journey-stats-hero-distribution-mensagens').className).toContain(
      'motion-safe:animate-in',
    );
  });

  it('com movimento reduzido entrega os números finais e desliga TODA animação de entrada', () => {
    definirMovimentoReduzido(true);
    render(<JourneyStatsHero {...props()} />);

    expect(screen.getByTestId('journey-stat-mensagens-value')).toHaveTextContent('128');
    expect(screen.getByTestId('journey-stat-mensagens').className).not.toContain('animate-in');
    expect(screen.getByTestId('journey-stats-hero-distribution-mensagens').className).not.toContain('animate-in');
    // nenhum cartão/barra fica invisível por causa de um atraso de animação
    expect(screen.getByTestId('journey-stat-mensagens').style.animationDelay).toBe('');
  });
});

describe('JourneyStatsHero — regras de cor e acessibilidade', () => {
  it('não usa nenhuma cor literal: só classes de token do projeto', () => {
    const { container } = render(<JourneyStatsHero {...props()} />);

    const proibido = /(^|[\s:])(bg|text|border|ring|fill|stroke)-(white|black)\b|#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(/;
    const infratores = Array.from(container.querySelectorAll<HTMLElement>('*'))
      .filter((el) => proibido.test(el.getAttribute('class') ?? '') || proibido.test(el.getAttribute('style') ?? ''))
      .map((el) => `${el.tagName}.${el.getAttribute('class') ?? ''}`);

    expect(infratores).toEqual([]);
  });

  it('cada cartão tem nome acessível completo e o gráfico tem resumo textual', () => {
    render(<JourneyStatsHero {...props()} />);

    expect(screen.getByRole('group', { name: 'Mensagens: 128 no total, 70 enviadas e 58 recebidas' })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Tempo médio de resposta do contato: 12min' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'CSAT: média 4,5 de 5 em 6 avaliações' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Cliente desde 05/03/2024; último contato em 06/10/2026' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Total de interações no período Últimos 30 dias: 42' })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Resoluções no período Últimos 30 dias: 5' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /^Série diária: 5 dias/ }),
    ).toBeInTheDocument();
  });

  it('não tem violação de acessibilidade apontada pelo axe', async () => {
    const { container } = render(<JourneyStatsHero {...props()} />);

    const resultado = await axe(container);
    // Mesmo critério do revisor na área: nenhuma violação, de qualquer impacto.
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});
