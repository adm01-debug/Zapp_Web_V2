/**
 * A3-04 (auditoria adversarial, onda 2) — medido no bundle real de produção:
 *
 *   contador da pausa de 429: 57 s → 37 s → 15 s → 0 s → 0 s   (morria em 0 e ficava lá)
 *   botão "Tentar novamente": 0 ocorrências em TODAS as amostras
 *
 * Ou seja: a pausa por limite de uso não tinha nenhuma saída na tela. Estes testes cobram o aviso
 * honesto (nada de "0 s") e o caminho de retry enquanto a espera é transitória.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('E57: a contagem de sugestões é anunciada em região viva (leitor de tela)', () => {
    // Quem usa leitor de tela não "vê" a lista aparecer: sem região viva, a busca pode
    // devolver 5 sugestões e o operador não ouve nada. A contagem vem do próprio DOM para o
    // teste não depender do formato dos fixtures.
    const tres = [
    { id: 's1', name: 'Rua A, 1', address: 'Rua A, 1, São Paulo', kind: 'street' },
    { id: 's2', name: 'Rua B, 2', address: 'Rua B, 2, São Paulo', kind: 'address' },
    { id: 's3', name: 'Rua C, 3', address: 'Rua C, 3, São Paulo', kind: 'poi' },
  ] as unknown as SuggestionListProps['suggestions'];
  render(<SuggestionList {...props({ status: 'ok', suggestions: tres })} />);
    const opcoes = document.querySelectorAll('[role="option"]').length;
    const viva = [...document.querySelectorAll('[aria-live]')].map((e) => e.textContent ?? '').join(' ');
    expect(opcoes).toBeGreaterThan(0);
    expect(viva).toContain(String(opcoes));
  });
  
  it('E57: a mudança de estado também é anunciada — "nada encontrado"', () => {
    render(<SuggestionList {...props({ status: 'empty' })} />);
    const viva = [...document.querySelectorAll('[aria-live]')].map((e) => e.textContent ?? '').join(' ');
    expect(viva.toLowerCase()).toMatch(/nenhuma sugestão/i);
  });
  
  it('E59: em tela pequena a lista ancora na tela com teto de 40vh (sem overflow em 360px)', () => {
    render(<SuggestionList {...props({ status: 'ok' })} />);
    const lista = screen.getByTestId('lista-sugestoes');
    const cls = lista.className;
    // < 640px (sem prefixo): fixa, presa as bordas da tela e com teto de 40vh — nao estoura a horizontal
    expect(cls).toContain('fixed');
    expect(cls).toContain('inset-x-4');
    expect(cls).toContain('max-h-[40vh]');
    // >= 640px (sm:): volta a ser ancorada no campo, com o teto de sempre
    expect(cls).toContain('sm:absolute');
    expect(cls).toContain('sm:max-h-64');
  });

  it('E60: o teclado virtual recalcula o teto da lista e o listener é removido no unmount', () => {
    const listeners: Record<string, () => void> = {};
    const add = vi.fn((t: string, fn: () => void) => { listeners[t] = fn; });
    const remove = vi.fn();
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { height: 500, addEventListener: add, removeEventListener: remove },
    });
    const { unmount } = render(<SuggestionList {...props({ status: 'ok' })} />);
    expect(add).toHaveBeenCalledWith('resize', expect.any(Function));
    const lista = screen.getByTestId('lista-sugestoes');
    const tetoInicial = lista.style.maxHeight;
    // o teclado abre: a area visivel encolhe e o teto da lista acompanha
    (window.visualViewport as { height: number }).height = 200;
    act(() => { listeners.resize?.(); });
    expect(screen.getByTestId('lista-sugestoes').style.maxHeight).not.toBe(tetoInicial);
    unmount();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('teto de custo (não transitório) NÃO oferece botão de nova tentativa', () => {
    render(<SuggestionList {...props({ blocked: 'cost_guard', pausedUntil: null })} />);

    expect(screen.getByText(/pausadas este mês/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /tentar novamente/i })).toBeNull();
  });
});

/**
 * E61 — alvo de toque ≥ 44 px. Em celular o dedo precisa de 44 px verticais (WCAG 2.5.5 /
 * Material) para acertar o item, o retry e o link de atribuição sem errar o vizinho. O projeto
 * usa a classe utilitária `min-h-11` (2.75rem = 44px). Cada teste abaixo trava um dos três alvos.
 */
describe('SuggestionList — alvos de toque E61 (min-h-11)', () => {
  it('E61: todo item da lista tem alvo de toque de 44 px (min-h-11)', () => {
    const dois = [
      { id: 's1', name: 'Rua A, 1', address: 'Rua A, 1, São Paulo', kind: 'street' },
      { id: 's2', name: 'Rua B, 2', address: 'Rua B, 2, São Paulo', kind: 'address' },
    ] as unknown as SuggestionListProps['suggestions'];
    render(<SuggestionList {...props({ status: 'ok', suggestions: dois })} />);

    const itens = screen.getAllByRole('option');
    expect(itens.length).toBe(2);
    for (const item of itens) {
      expect(item.className).toContain('min-h-11');
    }
  });

  it('E61: o botão "Tentar novamente" tem alvo de toque de 44 px (min-h-11)', () => {
    render(<SuggestionList {...props({ status: 'paused', blocked: 'rate_limited', pausedUntil: Date.now() + 45_000 })} />);
    const botaoPausa = screen.getByRole('button', { name: /tentar novamente/i });
    expect(botaoPausa.className).toContain('min-h-11');

    // A mesma ação existe no estado de erro; o alvo precisa valer também lá.
    const { unmount } = render(
      <SuggestionList {...props({ status: 'error', blocked: null, pausedUntil: null, error: 'network' })} />
    );
    const botoesErro = screen.getAllByRole('button', { name: /tentar novamente/i });
    for (const b of botoesErro) {
      expect(b.className).toContain('min-h-11');
    }
    unmount();
  });

  it('E61: o link "Powered by Mapbox" tem alvo de toque de 44 px (min-h-11)', () => {
    render(<SuggestionList {...props({ status: 'ok', suggestions: [] })} />);
    const link = screen.getByRole('link', { name: /mapbox/i });
    expect(link.className).toContain('min-h-11');
  });
});

/**
 * E63 — redução de movimento. Quem pediu "menos movimento" no sistema operacional não pode receber
 * um esqueleto pulsando nem um spinner girando: o corpo responde a isso (vestibular/neurológico) e a
 * expectativa do `prefers-reduced-motion` é que a animação contínua pare. O projeto é Tailwind, então
 * a prova é a presença da variante `motion-reduce:` no PRÓPRIO elemento animado — é o que o checklist
 * da etapa exige (nada de media query solta nem CSS global).
 */
describe('SuggestionList — movimento reduzido E63 (variante motion-reduce:)', () => {
  const um = [
    { id: 's1', name: 'Rua A, 1', address: 'Rua A, 1, São Paulo', kind: 'street' },
  ] as unknown as SuggestionListProps['suggestions'];

  it('E63: o esqueleto de carregamento para de pulsar quando o sistema pede menos movimento', () => {
    render(<SuggestionList {...props({ status: 'loading' })} />);
    const esqueleto = screen.getByTestId('lista-sugestoes').querySelector('.animate-pulse');
    expect(esqueleto).not.toBeNull();
    expect(esqueleto!.className).toContain('motion-reduce:animate-none');
  });

  it('E63: o spinner do /retrieve para de girar quando o sistema pede menos movimento', () => {
    render(<SuggestionList {...props({ status: 'ok', suggestions: um, retrievingId: 's1' })} />);
    const spinner = screen.getByTestId('lista-sugestoes').querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
    // `className` de um elemento SVG é `SVGAnimatedString`, não string — lê o atributo.
    expect(spinner!.getAttribute('class')).toContain('motion-reduce:animate-none');
  });

  it('E63: a transição de realce do item desliga quando o sistema pede menos movimento', () => {
    render(<SuggestionList {...props({ status: 'ok', suggestions: um })} />);
    const item = screen.getByRole('option');
    expect(item.className).toContain('transition-colors');
    expect(item.className).toContain('motion-reduce:transition-none');
  });

  it('E63: o aviso de pausa (contagem de segundos) hoje é só texto — nada a desligar', () => {
    // A contagem da pausa é troca de TEXTO (o `setInterval` só muda o número); não existe animação
    // para reduzir. Este caso pina isso e, se um dia alguém animar o contador, cobra a variante.
    render(<SuggestionList {...props({ status: 'paused', blocked: 'rate_limited', pausedUntil: Date.now() + 45_000 })} />);
    const animados = [...screen.getByTestId('lista-sugestoes').querySelectorAll('[class*="animate-"]')];
    expect(animados).toEqual([]);
  });
});
