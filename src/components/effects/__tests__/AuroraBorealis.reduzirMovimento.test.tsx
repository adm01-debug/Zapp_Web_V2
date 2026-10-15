/**
 * Acessibilidade — reduzir movimento (`prefers-reduced-motion: reduce`).
 *
 * Contrato: com o movimento reduzido ligado, `AuroraBorealis` mantém o fundo
 * estático (as ondas continuam na tela, sem `transform`/`opacity` animados) e
 * não monta as faíscas — nada se move depois do primeiro paint.
 *
 * A preferência vem do `window.matchMedia` SIMULADO abaixo; o hook
 * `useReducedMotion` do framer-motion (o mesmo que o app usa) é trocado por uma
 * leitura desse matchMedia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuroraBorealis } from '../AuroraBorealis';

let preferenciaReduzida = false;

function simularMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: preferenciaReduzida && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    useReducedMotion: () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
});

beforeEach(() => {
  preferenciaReduzida = false;
  simularMatchMedia();
});

describe('AuroraBorealis — reduzir movimento', () => {
  it('com reduzir movimento as ondas ficam paradas e sem faíscas', () => {
    preferenciaReduzida = true;
    render(<AuroraBorealis />);

    expect(screen.queryAllByTestId('aurora-sparkle')).toHaveLength(0);

    const ondas = screen.getAllByTestId('aurora-wave');
    expect(ondas).toHaveLength(5);
    for (const onda of ondas) {
      const el = onda as HTMLElement;
      expect(el.style.opacity).toBe('');
      expect(el.style.transform).toBe('');
    }

    const linha = screen.getByTestId('aurora-glow-line') as HTMLElement;
    expect(linha.style.opacity).toBe('');
  });

  it('sem reduzir movimento as ondas animam e as 8 faíscas aparecem', () => {
    render(<AuroraBorealis />);

    expect(screen.queryAllByTestId('aurora-sparkle')).toHaveLength(8);

    const ondas = screen.getAllByTestId('aurora-wave');
    expect(ondas[0].style.opacity).not.toBe('');
  });
});
