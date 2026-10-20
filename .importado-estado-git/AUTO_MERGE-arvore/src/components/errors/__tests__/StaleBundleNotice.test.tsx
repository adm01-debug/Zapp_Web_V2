/**
 * Prova da tela "Nova versao disponivel" sem framer-motion no grafo inicial.
 *
 * O componente deixou de importar `framer-motion` (que arrastava o chunk
 * `vendor-motion` para o pacote inicial via `ErrorBoundary`) e passou a animar so
 * com classes do tema, sempre com o guarda `motion-safe:`. E por isso que o render
 * aqui e o componente REAL, sem mock do runtime de animacao: o que se mede e o
 * markup que chega a tela (animacao de entrada, giro unico do icone e a acao do
 * botao), nao a configuracao que um mock devolveria.
 *
 * O contrato de movimento reduzido vive no CSS: `motion-safe:` (que casa com
 * `prefers-reduced-motion: no-preference`) nao entrega a animacao a quem pede
 * reducao, e a classe `reduced-motion` no <html> zera a duracao em
 * `accessibility.css`. O primeiro e observavel na classe renderizada; o segundo e
 * CSS pre-existente, fora do escopo deste arquivo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StaleBundleNotice } from '@/components/errors/StaleBundleNotice';

const reload = vi.fn();

beforeEach(() => {
  sessionStorage.clear();
  reload.mockClear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { reload },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Classes `animate-*` de um elemento, como estao no className. */
function animacoesDe(no: Element): string[] {
  return (no.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.includes('animate-'));
}

describe('StaleBundleNotice', () => {
  it('mostra a tela calma com o botao primario', () => {
    render(<StaleBundleNotice />);
    expect(screen.getByText(/Nova versão disponível/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atualizar agora/i })).toBeInTheDocument();
  });

  it('a entrada sobe com fade e o icone gira uma unica vez, com tokens do tema', () => {
    const { container } = render(<StaleBundleNotice />);

    // Entrada: `animate-slide-up` (translateY(10px) + opacity 0 -> estado final).
    const entrada = container.querySelector('.motion-safe\\:animate-slide-up');
    expect(entrada).not.toBeNull();

    // Giro unico e lento do icone: `spin` da 1 volta (iteration count 1), 1.2s.
    const giro = container.querySelector('[class*="animate-[spin_"]');
    expect(giro).not.toBeNull();
    expect(animacoesDe(giro as Element)).toEqual(['motion-safe:animate-[spin_1.2s_ease-out_1]']);
  });

  it('nenhuma animacao escapa do guarda de movimento reduzido (motion-safe:)', () => {
    const { container } = render(<StaleBundleNotice />);

    const comAnimacao = Array.from(container.querySelectorAll('[class*="animate-"]'));
    // A tela tem duas animacoes (entrada + giro); todas precisam ser guardadas.
    expect(comAnimacao.length).toBeGreaterThan(0);

    for (const no of comAnimacao) {
      const animacoes = animacoesDe(no);
      expect(animacoes.length).toBeGreaterThan(0);
      for (const classe of animacoes) {
        expect(classe.startsWith('motion-safe:')).toBe(true);
      }
    }
  });

  it('"Atualizar agora" zera a guarda da sessao e recarrega', () => {
    sessionStorage.setItem('__zapp_chunk_reload_count', '2');
    sessionStorage.setItem('__zapp_chunk_reload_at', '123');
    sessionStorage.setItem('zapp_chunk_reload_v1', '1');

    render(<StaleBundleNotice />);
    fireEvent.click(screen.getByRole('button', { name: /Atualizar agora/i }));

    expect(sessionStorage.getItem('__zapp_chunk_reload_count')).toBeNull();
    expect(sessionStorage.getItem('__zapp_chunk_reload_at')).toBeNull();
    expect(sessionStorage.getItem('zapp_chunk_reload_v1')).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
