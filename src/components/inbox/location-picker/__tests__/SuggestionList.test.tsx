/**
 * A3-04 (auditoria adversarial, onda 2) — medido no bundle real de produção:
 *
 *   contador da pausa de 429: 57 s → 37 s → 15 s → 0 s → 0 s   (morria em 0 e ficava lá)
 *   botão "Tentar novamente": 0 ocorrências em TODAS as amostras
 *
 * Ou seja: a pausa por limite de uso não tinha nenhuma saída na tela. Estes testes cobram o aviso
 * honesto (nada de "0 s") e o caminho de retry enquanto a espera é transitória.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SuggestionList, type SuggestionListProps } from '../SuggestionList';

function props(extra: Partial<SuggestionListProps> = {}): SuggestionListProps {
  return {
    listboxId: 'lista',
    status: 'paused',
    query: 'rua a',
    suggestions: [],
    highlightedIndex: -1,
    retrievingId: null,
    error: null,
    blocked: 'rate_limited',
    pausedUntil: null,
    retrieveError: null,
    onSelect: () => {},
    onRetry: () => {},
    ...extra,
  };
}

describe('SuggestionList — pausa de 429 (A3-04)', () => {
  it('oferece "Tentar novamente" durante a contagem e a contagem existe', () => {
    const onRetry = vi.fn();
    render(<SuggestionList {...props({ pausedUntil: Date.now() + 45_000, onRetry })} />);

    const botao = screen.getByRole('button', { name: /tentar novamente/i });
    expect(screen.getByText(/(4[4-6]) s/)).toBeTruthy();

    fireEvent.click(botao);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('espera acabada não mostra "0 s" e diz que já dá para tentar de novo', () => {
    render(<SuggestionList {...props({ pausedUntil: Date.now() - 1_000 })} />);

    expect(screen.queryByText(/0 s/)).toBeNull();
    expect(screen.getByText(/já pode tentar de novo/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeTruthy();
  });

  it('teto de custo (não transitório) NÃO oferece botão de nova tentativa', () => {
    render(<SuggestionList {...props({ blocked: 'cost_guard', pausedUntil: null })} />);

    expect(screen.getByText(/pausadas este mês/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /tentar novamente/i })).toBeNull();
  });
});
