/**
 * Acessibilidade das ferramentas de IA da conversa.
 *
 * Prova, ponto a ponto:
 *  - ToolPanel se comporta como diálogo modal (role/aria-modal/nome, Esc, foco preso);
 *  - PeriodFilterSelector não tem mais controle interativo aninhado, os controles
 *    são <button type="button"> com 44px de toque e a escala de 0.7 saiu;
 *  - botões só-ícone (áudio) têm nome acessível;
 *  - o histórico não inventa "null%" / "null msgs" quando o valor não veio;
 *  - desempenho do atendente com valor não numérico não quebra a tela.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';

import { ToolPanel } from '@/components/inbox/ai-tools/ToolPanel';
import { VisionIcon } from '@/components/inbox/ai-tools/VisionIcon';
import { PeriodFilterSelector, type AnalysisPeriod } from '@/components/inbox/ai-tools/PeriodFilterSelector';
import { HistoryTab } from '@/components/inbox/ai-tools/HistoryTab';
import { SentimentTab } from '@/components/inbox/ai-tools/SentimentTab';
import { SummaryResult } from '@/components/inbox/summary/SummaryResult';
import type { AnalysisData } from '@/components/inbox/ai-tools/analysisConfigs';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

describe('ToolPanel — diálogo modal com teclado', () => {
  function renderPanel() {
    const onClose = vi.fn();
    const utils = render(
      <ToolPanel isOpen onClose={onClose} icon={<VisionIcon />} title="Visão" subtitle="Análise Profunda">
        <button type="button">Ação interna</button>
      </ToolPanel>,
    );
    return { onClose, ...utils };
  }

  it('expõe role=dialog, aria-modal e nome pelo título', () => {
    renderPanel();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId as string)).toHaveTextContent('Visão');
  });

  it('fecha com Esc a partir do painel', () => {
    const { onClose } = renderPanel();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('prende o foco: Tab no último controle volta ao primeiro e Shift+Tab no primeiro vai ao último', () => {
    renderPanel();
    const dialog = screen.getByRole('dialog');
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    expect(focusables.length).toBeGreaterThan(1);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('não tem violação de axe', async () => {
    const { container } = renderPanel();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('VisionIcon — decorativo', () => {
  it('esconde o ícone dos leitores de tela', () => {
    const { container } = render(<VisionIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });
});

describe('PeriodFilterSelector — filtro de data', () => {
  function renderSelector(period: AnalysisPeriod) {
    const onPeriodChange = vi.fn();
    const onClearCustom = vi.fn();
    render(
      <PeriodFilterSelector
        period={period}
        onPeriodChange={onPeriodChange}
        onCustomFromChange={vi.fn()}
        onCustomToChange={vi.fn()}
        onClearCustom={onClearCustom}
        filteredCount={2}
        totalCount={5}
      />,
    );
    return { onPeriodChange, onClearCustom };
  }

  it('o controle de remover filtro é um <button> irmão (nunca aninhado) com nome acessível', () => {
    renderSelector('7d');
    const limpar = screen.getByRole('button', { name: 'Remover filtro de data' });
    expect(limpar.tagName).toBe('BUTTON');
    expect(limpar).toHaveAttribute('type', 'button');
    expect(limpar.closest('button')).toBe(limpar);
    // item 3 do cartão: área de toque mínima de 44px (min-h-11/min-w-11 = 2.75rem = 44px)
    expect(limpar.className).toContain('min-h-11');
    expect(limpar.className).toContain('min-w-11');
  });

  it('o controle de remover é focável e reseta o período ao ser acionado', () => {
    const { onPeriodChange, onClearCustom } = renderSelector('7d');
    const limpar = screen.getByRole('button', { name: 'Remover filtro de data' });
    limpar.focus();
    expect(document.activeElement).toBe(limpar);
    fireEvent.click(limpar);
    expect(onPeriodChange).toHaveBeenCalledWith('all');
    expect(onClearCustom).toHaveBeenCalledTimes(1);
  });

  it('não aparece quando não há filtro ativo', () => {
    renderSelector('all');
    expect(screen.queryByRole('button', { name: 'Remover filtro de data' })).not.toBeInTheDocument();
  });

  it('os atalhos do popover são <button type="button"> com área de toque de 44px', () => {
    renderSelector('7d');
    fireEvent.click(screen.getByRole('button', { name: /Últimos 7 dias/ }));
    const atalho = screen.getByRole('button', { name: 'Hoje' });
    expect(atalho).toHaveAttribute('type', 'button');
    expect(atalho.className).toContain('min-h-11');
  });

  it('o popover não é mais reduzido por escala (scale-[0.7] removido)', () => {
    renderSelector('7d');
    fireEvent.click(screen.getByRole('button', { name: /Últimos 7 dias/ }));
    expect(document.body.innerHTML).not.toContain('scale-[0.7]');
  });
});

describe('SummaryResult — botões de áudio com nome acessível', () => {
  it('cada botão só-ícone de ouvir tem aria-label', () => {
    render(
      <SummaryResult
        summary={{ summary: 'Resumo da conversa', keyPoints: ['ponto 1'], nextSteps: [] }}
        isTtsPlaying={false}
        isTtsLoading={false}
        lastTtsText={null}
        onPlayTts={vi.fn()}
        buildFullNarrationText={() => 'texto completo'}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ouvir o resumo em voz alta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvir os pontos-chave em voz alta' })).toBeInTheDocument();
  });
});

describe('HistoryTab — não inventa valor ausente', () => {
  it('mostra "—" no lugar de "%" / "msgs" quando a nota e a contagem não vieram', () => {
    render(
      <HistoryTab
        analyses={[
          {
            id: 'analise-1',
            summary: 'Resumo salvo',
            status: 'resolvido',
            key_points: [],
            next_steps: [],
            sentiment: 'positivo',
            sentiment_score: null,
            topics: [],
            urgency: null,
            customer_satisfaction: null,
            message_count: null,
            created_at: '2026-10-01T12:00:00Z',
          },
        ]}
        historyLoading={false}
        onLoadHistory={vi.fn()}
      />,
    );

    expect(screen.queryByText('%')).not.toBeInTheDocument();
    expect(screen.queryByText('msgs')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});

describe('SentimentTab — desempenho do atendente com valor inválido', () => {
  it('ignora chaves que não são número em vez de renderizar barra inválida', () => {
    const analysis = {
      summary: 'Resumo',
      status: 'resolvido',
      keyPoints: [],
      sentiment: 'positivo',
      agentPerformance: { empathy: 8, clarity: 'não é número' },
    } as unknown as AnalysisData;

    render(<SentimentTab analysis={analysis} sentimentScore={70} currentSentiment="positivo" analyses={[]} />);

    expect(screen.getByText('Empatia')).toBeInTheDocument();
    expect(screen.queryByText('Clareza')).not.toBeInTheDocument();
  });
});
