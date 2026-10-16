/**
 * CV-051–060 — Testes do RadarPanel e useRadarPanel.
 * CV-051: floating panel render.
 * CV-052: three display modes.
 * CV-053: collapsible cards.
 * CV-054: thinking indicator + timeout message.
 * CV-056: keyboard shortcuts.
 * CV-058: DND mode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { RadarPanel } from '../RadarPanel';
import { renderHook } from '@testing-library/react';
import { useRadarPanel } from '@/hooks/copilot/useRadarPanel';
import type { RadarPanelProps } from '../RadarPanel';

const baseProps: RadarPanelProps = {
  mode: 'normal',
  collapsed: false,
  collapsedCards: [],
  cardOrder: ['stage', 'brinde', 'suggestions', 'next_step', 'alerts', 'products', 'decision_maker'],
  isDnd: false,
  onSetMode: vi.fn(),
  onToggleCollapsed: vi.fn(),
  onToggleCard: vi.fn(),
  onEnableDnd: vi.fn(),
  onClearDnd: vi.fn(),
  session: null,
  sessionLoading: false,
  suggestions: [],
  suggestionsLoading: false,
  onUseSuggestion: vi.fn(),
};

describe('RadarPanel CV-051', () => {
  it('renderiza o painel com aria-label "RADAR Copiloto"', () => {
    render(<RadarPanel {...baseProps} />);
    expect(screen.getByRole('complementary', { name: /RADAR Copiloto/i })).toBeTruthy();
  });

  it('renderiza versão recolhida com botão de expandir', () => {
    render(<RadarPanel {...baseProps} collapsed={true} />);
    expect(screen.getByLabelText(/Expandir painel RADAR/i)).toBeTruthy();
  });

  it('chama onToggleCollapsed ao clicar em recolher', () => {
    const fn = vi.fn();
    render(<RadarPanel {...baseProps} onToggleCollapsed={fn} />);
    fireEvent.click(screen.getByLabelText(/Recolher painel RADAR/i));
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('RadarPanel CV-052 modos', () => {
  it('renderiza 3 botões de modo', () => {
    render(<RadarPanel {...baseProps} />);
    expect(screen.getByRole('button', { name: /Mini/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Normal/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Foco/i })).toBeTruthy();
  });

  it('modo Mini exibe apenas o card de sugestões resumido', () => {
    render(<RadarPanel {...baseProps} mode="mini" />);
    // Mini não exibe os títulos dos cartões separados
    expect(screen.queryByRole('region', { name: /Etapa da venda/i })).toBeNull();
  });

  it('modo Normal exibe cartões', () => {
    render(<RadarPanel {...baseProps} mode="normal" />);
    expect(screen.getByRole('region', { name: /Etapa da venda/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /B·R·I·N·D·E/i })).toBeTruthy();
  });

  it('chama onSetMode ao clicar em Foco', () => {
    const fn = vi.fn();
    render(<RadarPanel {...baseProps} onSetMode={fn} />);
    fireEvent.click(screen.getByRole('button', { name: /Foco/i }));
    expect(fn).toHaveBeenCalledWith('focus');
  });
});

describe('RadarPanel CV-053 cartões recolhíveis', () => {
  it('chama onToggleCard ao clicar no header do cartão Stage', () => {
    const fn = vi.fn();
    render(<RadarPanel {...baseProps} onToggleCard={fn} />);
    fireEvent.click(screen.getByRole('button', { name: /Etapa da venda/i }));
    expect(fn).toHaveBeenCalledWith('stage');
  });

  it('cartão recolhido não mostra conteúdo (aria-expanded=false)', () => {
    render(<RadarPanel {...baseProps} collapsedCards={['stage']} />);
    const btn = screen.getByRole('button', { name: /Etapa da venda/i });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('RadarPanel CV-054 indicador de pensamento', () => {
  it('exibe ping de carregamento quando suggestionsLoading=true', () => {
    render(<RadarPanel {...baseProps} suggestionsLoading={true} />);
    // O botão de RADAR tem animate-pulse
    const radar = document.querySelector('.animate-ping');
    expect(radar).toBeTruthy();
  });

  it('exibe mensagem de timeout após THINKING_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    render(<RadarPanel {...baseProps} suggestionsLoading={true} />);
    act(() => { vi.advanceTimersByTime(9000); });
    expect(screen.getByText(/Não consegui analisar agora/i)).toBeTruthy();
    vi.useRealTimers();
  });
});

describe('RadarPanel CV-058 DND', () => {
  it('exibe banner quando isDnd=true', () => {
    render(<RadarPanel {...baseProps} isDnd={true} />);
    expect(screen.getByText(/RADAR silenciado/i)).toBeTruthy();
  });

  it('botão "Retomar" chama onClearDnd', () => {
    const fn = vi.fn();
    render(<RadarPanel {...baseProps} isDnd={true} onClearDnd={fn} />);
    fireEvent.click(screen.getByText('Retomar'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('botão silenciar chama onEnableDnd com conversationId', () => {
    const fn = vi.fn();
    render(<RadarPanel {...baseProps} isDnd={false} onEnableDnd={fn} conversationId="conv-1" />);
    fireEvent.click(screen.getByLabelText(/Silenciar RADAR/i));
    expect(fn).toHaveBeenCalledWith('conv-1');
  });
});

describe('useRadarPanel CV-052/058', () => {
  beforeEach(() => localStorage.clear());

  it('modo inicial é normal', () => {
    const { result } = renderHook(() => useRadarPanel('user1'));
    expect(result.current.mode).toBe('normal');
  });

  it('setMode persiste', () => {
    const { result } = renderHook(() => useRadarPanel('user1'));
    act(() => result.current.setMode('focus'));
    expect(result.current.mode).toBe('focus');
  });

  it('isDnd=false por padrão', () => {
    const { result } = renderHook(() => useRadarPanel('user1', 'conv-1'));
    expect(result.current.isDnd).toBe(false);
  });

  it('enableDnd por conversa ativa isDnd para aquela conversa', () => {
    const { result } = renderHook(() => useRadarPanel('user1', 'conv-1'));
    act(() => result.current.enableDnd('conv-1'));
    expect(result.current.isDnd).toBe(true);
  });

  it('enableDnd por conversa NÃO ativa isDnd para outra conversa', () => {
    const { result } = renderHook(() => useRadarPanel('user1', 'conv-2'));
    act(() => result.current.enableDnd('conv-1'));
    expect(result.current.isDnd).toBe(false);
  });

  it('clearDnd desativa isDnd', () => {
    const { result } = renderHook(() => useRadarPanel('user1', 'conv-1'));
    act(() => result.current.enableDnd('conv-1'));
    act(() => result.current.clearDnd());
    expect(result.current.isDnd).toBe(false);
  });

  it('toggleCard adiciona e remove de collapsedCards', () => {
    const { result } = renderHook(() => useRadarPanel('user1'));
    act(() => result.current.toggleCard('stage'));
    expect(result.current.collapsedCards).toContain('stage');
    act(() => result.current.toggleCard('stage'));
    expect(result.current.collapsedCards).not.toContain('stage');
  });
});
