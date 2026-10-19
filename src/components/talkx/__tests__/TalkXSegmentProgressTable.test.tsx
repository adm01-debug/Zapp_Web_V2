import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

/**
 * X149 — card "Fila por Segmento" (tela da campanha).
 *
 * Defeito que este teste trava: a tela da campanha não mostrava nada por público —
 * não havia como ver quanto de cada segmento (VIP, Recompra…) já recebeu e quanto
 * falta. O card passa a ler a RPC `talkx_campaign_segment_progress` (N-096/X142) e
 * mostrar Total / Enviadas / Restante / Progresso por público, na ordem de envio.
 *
 * Casos cobertos:
 *  1. payload de 6 segmentos mostra 4 linhas + "Ver todos";
 *  2. 398 de 400 mostra "99%" (trunca, não arredonda) e restante 2;
 *  3. segmento 100% pinta a barra de verde (bg-success); abaixo disso, bg-primary;
 *  4. clicar no público aplica o filtro com o id (e o público sem id vai como null);
 *  5. as linhas aparecem na ordem de envio (`position`), mesmo se a RPC vier fora de ordem;
 *  6. vazio mostra o estado vazio; erro mostra o erro com "Tentar novamente" (nunca o vazio);
 *  7. só tokens de cor (nenhum hex/rgb solto) e a única animação é motion-safe.
 */
import { TalkXSegmentProgressTable } from '../tracking/TalkXSegmentProgressTable';
import {
  SEGMENT_PREVIEW_SIZE,
  segmentPercent,
  toSegmentProgressItems,
  type TalkXSegmentProgressRpcRow,
} from '../tracking/talkxSegmentProgress';

function linha(over: Partial<TalkXSegmentProgressRpcRow> & { segment_id: string; position: number }): TalkXSegmentProgressRpcRow {
  return {
    total: 100,
    sent: 0,
    delivered: 0,
    failed: 0,
    remaining: 100,
    percent: 0,
    status: 'pending',
    total_segments: 6,
    pending_segments: 6,
    ...over,
  };
}

/** 6 públicos; a ordem no array é de propósito fora da ordem de envio. */
const seis: TalkXSegmentProgressRpcRow[] = [
  linha({ segment_id: 's3', position: 3, total: 120, sent: 30, remaining: 90, percent: 25, status: 'running' }),
  linha({ segment_id: 's1', position: 1, total: 400, sent: 398, delivered: 390, failed: 2, remaining: 2, percent: 99.5, status: 'running' }),
  linha({ segment_id: 's6', position: 6, total: 80, sent: 80, delivered: 78, remaining: 0, percent: 100, status: 'done' }),
  linha({ segment_id: 's2', position: 2, total: 250, sent: 250, delivered: 240, remaining: 0, percent: 100, status: 'done' }),
  linha({ segment_id: 's5', position: 5, total: 60, sent: 60, delivered: 59, remaining: 0, percent: 100, status: 'done' }),
  linha({ segment_id: 's4', position: 4, total: 200, sent: 200, delivered: 195, remaining: 0, percent: 100, status: 'done' }),
];

const nomes: Record<string, string> = {
  s1: 'VIP',
  s2: 'Recompra',
  s3: 'Novos',
  s4: 'Inativos',
  s5: 'Aniversariantes',
  s6: 'Carrinho abandonado',
};

describe('Fila por Segmento — TalkXSegmentProgressTable (X149)', () => {
  it('mostra 4 linhas do preview e oferece "Ver todos" quando há mais públicos', () => {
    render(<TalkXSegmentProgressTable rows={seis} segmentNames={nomes} />);

    expect(screen.getByText('Fila por Segmento')).toBeTruthy();
    // preview: as 4 primeiras posições (1..4)
    for (const nome of ['VIP', 'Recompra', 'Novos', 'Inativos']) {
      expect(screen.getByText(nome)).toBeTruthy();
    }
    // posições 5 e 6 ficam para o painel
    expect(screen.queryByText('Aniversariantes')).toBeNull();
    expect(screen.queryByText('Carrinho abandonado')).toBeNull();
    expect(screen.getByRole('button', { name: /ver todos/i })).toBeTruthy();
    expect(screen.getByText(/Mostrando os 4 primeiros de 6 segmentos/)).toBeTruthy();
  });

  it('"Ver todos" abre o painel lateral com a lista completa na ordem de envio', async () => {
    render(<TalkXSegmentProgressTable rows={seis} segmentNames={nomes} />);

    fireEvent.click(screen.getByRole('button', { name: /ver todos/i }));
    const painel = await screen.findByRole('dialog');
    const linhas = within(painel).getAllByRole('row');
    // 1 linha de cabeçalho + 6 públicos
    expect(linhas).toHaveLength(7);
    expect(within(painel).getByText('Aniversariantes')).toBeTruthy();
    expect(within(painel).getByText('Carrinho abandonado')).toBeTruthy();
  });

  it('398 de 400 é 99% (trunca) com restante 2, e não vira 100%', () => {
    render(<TalkXSegmentProgressTable rows={seis} segmentNames={nomes} />);

    const linhaVip = screen.getByText('VIP').closest('tr') as HTMLTableRowElement;
    const conteudo = within(linhaVip).getByText('99%');
    expect(conteudo).toBeTruthy();
    // 400 total, 398 enviadas, 2 restantes na mesma linha
    const celulas = within(linhaVip).getAllByRole('cell').map((c) => c.textContent);
    expect(celulas[1]).toBe('400');
    expect(celulas[2]).toBe('398');
    expect(celulas[3]).toBe('2');
  });

  it('pinta a barra de verde no público 100% e de primary abaixo disso', () => {
    render(<TalkXSegmentProgressTable rows={seis} segmentNames={nomes} />);

    const vip = screen.getByText('VIP').closest('tr') as HTMLTableRowElement;
    expect(within(vip).getByTestId('talkx-segment-progress-bar').className).toContain('bg-primary');

    const recompra = screen.getByText('Recompra').closest('tr') as HTMLTableRowElement;
    expect(within(recompra).getByTestId('talkx-segment-progress-bar').className).toContain('bg-success');
    expect(within(recompra).getByText('100%')).toBeTruthy();
  });

  it('clicar no público aplica o filtro com o id; público sem id vira null', () => {
    const onSelectSegment = vi.fn();
    const comManual = [
      linha({ segment_id: 's1', position: 1, total: 10, sent: 5, remaining: 5, percent: 50 }),
      linha({ segment_id: null as unknown as string, position: 2, total: 3, sent: 0, remaining: 3, percent: 0 }),
    ];
    render(
      <TalkXSegmentProgressTable rows={comManual} segmentNames={nomes} onSelectSegment={onSelectSegment} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'VIP' }));
    expect(onSelectSegment).toHaveBeenCalledWith('s1');

    fireEvent.click(screen.getByRole('button', { name: 'Seleção manual' }));
    expect(onSelectSegment).toHaveBeenCalledWith(null);
  });

  it('ordena pela ordem de envio, mesmo com a RPC fora de ordem', () => {
    const itens = toSegmentProgressItems(seis, nomes);
    expect(itens.map((i) => i.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(itens.map((i) => i.label)).toEqual([
      'VIP', 'Recompra', 'Novos', 'Inativos', 'Aniversariantes', 'Carrinho abandonado',
    ]);
  });

  it('estado vazio: nenhum segmento', () => {
    render(<TalkXSegmentProgressTable rows={[]} />);

    expect(screen.getByText('Nenhum segmento nesta campanha')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('erro mostra o erro com retry e NUNCA o vazio', () => {
    const onRetry = vi.fn();
    render(<TalkXSegmentProgressTable rows={[]} isError onRetry={onRetry} />);

    expect(screen.queryByText('Nenhum segmento nesta campanha')).toBeNull();
    const retry = screen.getByRole('button', { name: /tentar novamente/i });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('carregando: mostra esqueleto e não mostra erro nem vazio', () => {
    const { container } = render(<TalkXSegmentProgressTable rows={null} isLoading />);

    expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy();
    expect(screen.queryByText('Nenhum segmento nesta campanha')).toBeNull();
  });

  it('usa só tokens de cor e a animação é exclusivamente motion-safe', () => {
    const { container } = render(<TalkXSegmentProgressTable rows={seis} segmentNames={nomes} />);
    const html = container.innerHTML;

    // nenhuma cor crua: hex, rgb( ou hsl( literal — mas hsl(var(--...)) é token CSS, não cor fixa
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/\brgba?\(/i);
    expect(html).not.toMatch(/\bhsla?\((?!var\(--)/i);

    const barra = screen.getAllByTestId('talkx-segment-progress-bar')[0];
    expect(barra.className).toContain('motion-safe:transition-[width]');
    // animação sem o guarda de movimento reduzido não pode existir
    expect(barra.className).not.toMatch(/(^|\s)animate-/);
    expect(barra.className).not.toContain('transition-all');
  });

  it('segmentPercent trunca e nunca sai de 0–100', () => {
    expect(segmentPercent(99.5, 400, 2)).toBe(99);
    expect(segmentPercent(100, 80, 0)).toBe(100);
    expect(segmentPercent(null, 400, 2)).toBe(99);
    expect(segmentPercent(null, 10, 10)).toBe(0);
    expect(segmentPercent(120, 10, 0)).toBe(100);
    expect(segmentPercent(-5, 10, 0)).toBe(0);
  });

  it('o preview usa o tamanho padrão de 4 linhas', () => {
    expect(SEGMENT_PREVIEW_SIZE).toBe(4);
  });
});
