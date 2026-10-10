import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import {
  ComparisonSummaryChart,
  PeriodAreaChart,
  DistributionPieChart,
  DailyMessagesChart,
  AgentsChart,
  ContactsCharts,
} from '@/components/reports/ReportCharts';

// N-092 (refazer 2) — o jsdom não dispara ResizeObserver de verdade e o
// ResponsiveContainer do recharts só pinta o <svg> com dimensão positiva.
// O setup global instala um ResizeObserver no-op; aqui ele é trocado por um
// stub funcional (configurable: true no setup permite a troca) que entrega
// 800x600, igual ao que o navegador entregaria. Sem isso nenhum <svg> de
// gráfico existe e o teste afirmaria sobre o vazio.
class ResizeObserverFuncional {
  cb: ResizeObserverCallback;

  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }

  observe = vi.fn(() => {
    this.cb(
      [{ contentRect: { width: 800, height: 600 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  });

  unobserve = vi.fn();

  disconnect = vi.fn();
}

function instalarRO() {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverFuncional,
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverFuncional,
  });
}

afterEach(() => {
  cleanup();
});

const mockDaily = [
  { date: '01/01', enviadas: 10, recebidas: 5, novos: 3, total: 15 },
  { date: '02/01', enviadas: 20, recebidas: 8, novos: 5, total: 28 },
];

const mockBySender = [
  { name: 'Agente', value: 60 },
  { name: 'Contato', value: 40 },
];

const mockByAgent = [
  { name: 'Agente A', mensagens: 100 },
  { name: 'Agente B', mensagens: 50 },
];

const mockByTag = [
  { name: 'VIP', contatos: 30 },
  { name: 'Lead', contatos: 70 },
];

const mockByType = [
  { name: 'WhatsApp', value: 80 },
  { name: 'SMS', value: 20 },
];

// O <svg> principal do recharts carrega class="recharts-surface" mais role;
// os ícones de legenda também são <svg>, mas sem role — o seletor abaixo
// pega só a superfície do gráfico, nunca o ícone do lucide nem da legenda.
function superficie(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg.recharts-surface[role]');
  expect(svg).not.toBeNull();
  return svg as unknown as SVGSVGElement;
}

describe('ReportCharts — descrição textual acessível no SVG', () => {
  it('ComparisonSummaryChart: svg tem aria-label e filhos <title> e <desc>', () => {
    instalarRO();
    const { container } = render(
      <ComparisonSummaryChart
        data={[{ name: 'M1', atual: 10, anterior: 5 }]}
        isLoading={false}
      />,
    );
    const svg = superficie(container);
    expect(svg.getAttribute('aria-label')).toBe(
      'Gráfico de comparação de métricas: período atual versus anterior',
    );
    expect(svg.querySelector(':scope > title')?.textContent).toBe(
      'Gráfico de comparação de métricas',
    );
    expect((svg.querySelector(':scope > desc')?.textContent ?? '').length).toBeGreaterThan(0);
  });

  it('PeriodAreaChart: svg tem aria-label, <title> e <desc> com o label', () => {
    instalarRO();
    const { container } = render(
      <PeriodAreaChart
        data={mockDaily}
        label="Período Atual"
        dateLabel="01/01 - 02/01"
        gradientId="g-probe"
        color="hsl(var(--primary))"
        total={43}
        isLoading={false}
      />,
    );
    const svg = superficie(container);
    expect(svg.getAttribute('aria-label')).toContain('Período Atual');
    expect(svg.querySelector(':scope > title')?.textContent).toContain('Período Atual');
    expect((svg.querySelector(':scope > desc')?.textContent ?? '').length).toBeGreaterThan(0);
  });

  it('DistributionPieChart: svg de pizza tem <title> e <desc>', () => {
    instalarRO();
    const { container } = render(
      <DistributionPieChart data={mockBySender} label="Distribuição Atual" isLoading={false} />,
    );
    const svg = superficie(container);
    expect(svg.getAttribute('aria-label')).toContain('Distribuição Atual');
    expect(svg.querySelector(':scope > title')?.textContent).toContain('Distribuição Atual');
    expect((svg.querySelector(':scope > desc')?.textContent ?? '').length).toBeGreaterThan(0);
  });

  it('DailyMessagesChart: área e pizza têm <title> e <desc> próprios', () => {
    instalarRO();
    const { container } = render(
      <DailyMessagesChart
        data={{ daily: mockDaily, bySender: mockBySender, byAgent: mockByAgent }}
        isLoading={false}
      />,
    );
    const svgs = [...container.querySelectorAll('svg.recharts-surface[role]')];
    expect(svgs.length).toBe(2);
    for (const svg of svgs) {
      expect(svg.getAttribute('aria-label')).toBeTruthy();
      expect((svg.querySelector(':scope > title')?.textContent ?? '').length).toBeGreaterThan(0);
      expect((svg.querySelector(':scope > desc')?.textContent ?? '').length).toBeGreaterThan(0);
    }
    const titulos = svgs.map((s) => s.querySelector(':scope > title')?.textContent);
    expect(titulos).toContain('Mensagens por dia');
    expect(titulos).toContain('Distribuição por remetente');
  });

  it('AgentsChart: svg tem <title> e <desc>', () => {
    instalarRO();
    const { container } = render(<AgentsChart data={mockByAgent} isLoading={false} />);
    const svg = superficie(container);
    expect(svg.getAttribute('aria-label')).toBe('Gráfico de mensagens por agente');
    expect(svg.querySelector(':scope > title')?.textContent).toBe('Mensagens por agente');
    expect((svg.querySelector(':scope > desc')?.textContent ?? '').length).toBeGreaterThan(0);
  });

  it('ContactsCharts: linha, pizza e barras têm <title> e <desc> próprios', () => {
    instalarRO();
    const { container } = render(
      <ContactsCharts
        data={{ daily: mockDaily, byType: mockByType, byTag: mockByTag }}
        isLoading={false}
      />,
    );
    const svgs = [...container.querySelectorAll('svg.recharts-surface[role]')];
    expect(svgs.length).toBe(3);
    const titulos = svgs.map((s) => s.querySelector(':scope > title')?.textContent);
    expect(titulos).toContain('Novos contatos por dia');
    expect(titulos).toContain('Contatos por tipo');
    expect(titulos).toContain('Contatos por tag');
    for (const svg of svgs) {
      expect((svg.querySelector(':scope > desc')?.textContent ?? '').length).toBeGreaterThan(0);
    }
  });
});
