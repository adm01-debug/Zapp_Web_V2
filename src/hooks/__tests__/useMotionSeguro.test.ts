import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMotionSeguro } from '../useMotionSeguro';

// T75 — o aceite da etapa e: com `prefers-reduced-motion: reduce`, a duracao de transicao tem
// de ser 0s. O `useReducedMotion` do framer-motion le a preferencia UMA vez (cache de modulo) e
// por isso nao da para troca-la por `matchMedia` depois do import: o mock abaixo e o unico jeito
// de exercitar os DOIS ramos no mesmo arquivo. O que se testa aqui e a minha regra, nao o framer.
const prefereReduzir = vi.fn(() => false);
vi.mock('framer-motion', () => ({
  useReducedMotion: () => prefereReduzir(),
}));


beforeEach(() => prefereReduzir.mockReturnValue(false));

describe('useMotionSeguro (T75)', () => {
  it('COM reducao: duracao 0, atraso 0 e anima=false — nada anima', () => {
    prefereReduzir.mockReturnValue(true);
    const { result } = renderHook(() => useMotionSeguro());
    expect(result.current.anima).toBe(false);
    expect(result.current.duracao(150)).toBe(0);
    expect(result.current.duracao(120)).toBe(0);
    expect(result.current.atraso(0)).toBe(0);
    expect(result.current.atraso(4)).toBe(0);
  });

  it('SEM reducao: 150 ms e 120 ms viram segundos do framer-motion', () => {
    const { result } = renderHook(() => useMotionSeguro());
    expect(result.current.anima).toBe(true);
    expect(result.current.duracao(150)).toBeCloseTo(0.15);
    expect(result.current.duracao(120)).toBeCloseTo(0.12);
  });

  it('stagger tem TETO de 5 itens (o resto entra junto, sem fila de 50)', () => {
    const { result } = renderHook(() => useMotionSeguro());
    expect(result.current.atraso(0)).toBeCloseTo(0);
    expect(result.current.atraso(4)).toBeCloseTo(0.12);
    // Indice 5, 9 ou 49: mesmo atraso do 4 — o teto do plano.
    expect(result.current.atraso(5)).toBeCloseTo(0.12);
    expect(result.current.atraso(49)).toBeCloseTo(0.12);
  });

  it('preferencia ausente (null) NAO liga a animacao por acidente', () => {
    prefereReduzir.mockReturnValue(null as unknown as boolean);
    const { result } = renderHook(() => useMotionSeguro());
    expect(result.current.anima).toBe(true); // framer devolve null sem matchMedia: anima
  });
});
