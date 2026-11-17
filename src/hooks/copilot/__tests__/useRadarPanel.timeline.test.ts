/**
 * CV-055 — historico de insights do painel RADAR.
 *
 * Resgate da branch claude/feat-radar-fase6-261108-1933 (nunca mergeada): a `main`
 * so mostrava a sugestao mais recente, e o que a IA disse antes saia da tela sem
 * deixar rastro. Aqui entram `timeline` e `pushInsight`.
 *
 * A deduplicacao e o reset por conversa NAO vinham da branch: sem eles o chamador
 * (RadarLive) empurra a mesma sugestao a cada render, e o insight de uma conversa
 * apareceria na proxima.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useRadarPanel } from '../useRadarPanel';

beforeEach(() => {
  localStorage.clear();
});

describe('useRadarPanel: historico de insights (CV-055)', () => {
  it('guarda os insights na ordem em que chegaram', () => {
    const { result } = renderHook(() => useRadarPanel('user-1', 'conversa-A'));

    expect(result.current.timeline).toEqual([]);

    act(() => result.current.pushInsight('cliente perguntou prazo', 'msg-1'));
    act(() => result.current.pushInsight('cliente pediu desconto', 'msg-2'));

    expect(result.current.timeline.map((i) => i.text)).toEqual([
      'cliente perguntou prazo',
      'cliente pediu desconto',
    ]);
    expect(result.current.timeline[0].messageId).toBe('msg-1');
    expect(result.current.timeline[0].id).not.toBe(result.current.timeline[1].id);
  });

  it('o mesmo insight empurrado de novo nao duplica', () => {
    const { result } = renderHook(() => useRadarPanel('user-1', 'conversa-A'));

    act(() => result.current.pushInsight('mesmo texto', 'msg-1'));
    act(() => result.current.pushInsight('mesmo texto', 'msg-1'));
    act(() => result.current.pushInsight('mesmo texto', 'msg-1'));

    expect(result.current.timeline).toHaveLength(1);
  });

  it('mesmo texto em mensagem diferente conta como insight novo', () => {
    const { result } = renderHook(() => useRadarPanel('user-1', 'conversa-A'));

    act(() => result.current.pushInsight('cliente pediu desconto', 'msg-1'));
    act(() => result.current.pushInsight('cliente pediu desconto', 'msg-9'));

    expect(result.current.timeline).toHaveLength(2);
  });

  it('texto vazio nao entra no historico', () => {
    const { result } = renderHook(() => useRadarPanel('user-1', 'conversa-A'));

    act(() => result.current.pushInsight('', 'msg-1'));

    expect(result.current.timeline).toEqual([]);
  });

  it('trocar de conversa zera o historico: insight da conversa A nao aparece na B', () => {
    const { result, rerender } = renderHook(
      ({ conversa }: { conversa: string }) => useRadarPanel('user-1', conversa),
      { initialProps: { conversa: 'conversa-A' } },
    );

    act(() => result.current.pushInsight('segredo da conversa A', 'msg-1'));
    expect(result.current.timeline).toHaveLength(1);

    rerender({ conversa: 'conversa-B' });

    expect(result.current.timeline).toEqual([]);
  });

  it('A -> B sem sugestoes -> A NAO traz o historico de A de volta', () => {
    // Revisao do Devin e do Codex na #3223: esconder a lista nao basta. Se o registro
    // continuar pertencendo a A enquanto B nao empurra nada, voltar para A ressuscita
    // o historico. B aqui nao recebe nenhum insight, de proposito.
    const { result, rerender } = renderHook(
      ({ conversa }: { conversa: string }) => useRadarPanel('user-1', conversa),
      { initialProps: { conversa: 'conversa-A' } },
    );

    act(() => result.current.pushInsight('segredo da conversa A', 'msg-1'));
    act(() => result.current.pushInsight('outro segredo de A', 'msg-2'));
    expect(result.current.timeline).toHaveLength(2);

    rerender({ conversa: 'conversa-B' });
    expect(result.current.timeline).toEqual([]);

    rerender({ conversa: 'conversa-A' });
    expect(result.current.timeline).toEqual([]);
  });

  it('o historico nao vaza para o localStorage (e conteudo de conversa)', () => {
    const { result } = renderHook(() => useRadarPanel('user-1', 'conversa-A'));

    act(() => result.current.pushInsight('cliente mencionou CPF', 'msg-1'));

    const salvo = localStorage.getItem('radar-panel:user-1') ?? '';
    expect(salvo).not.toContain('cliente mencionou CPF');
    expect(salvo).not.toContain('timeline');
  });

  it('as preferencias que a main ja tinha continuam funcionando', () => {
    const { result } = renderHook(() => useRadarPanel('user-1', 'conversa-A'));

    act(() => result.current.setMode('focus'));
    act(() => result.current.toggleCollapsed());
    act(() => result.current.toggleCard('alerts'));

    expect(result.current.mode).toBe('focus');
    expect(result.current.collapsed).toBe(true);
    expect(result.current.collapsedCards).toContain('alerts');
    expect(localStorage.getItem('radar-panel:user-1')).toContain('focus');
  });
});
