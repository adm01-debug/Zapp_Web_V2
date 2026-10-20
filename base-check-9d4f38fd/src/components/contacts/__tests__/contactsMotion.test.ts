/**
 * RD-004 — Movimento do módulo Contatos.
 *
 * Prova os helpers do cartão: as três durações (120/220/550 ms), a curva do
 * retrato do modelo e a curva padrão reusada do movimento global, as variantes
 * de entrada da ficha e — o critério de pronto — que com `prefers-reduced-motion`
 * todas as durações viram 0 e o carrossel não anda.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { zappMotion } from '@/lib/motion';
import * as movimentoGlobal from '@/lib/motion';
import * as contatos from '../contactsMotion';

// `useReducedMotion` lê um singleton inicializado uma única vez; trocar o
// matchMedia no meio do arquivo não surte efeito. Só o hook é substituído — o
// resto do framer-motion segue real (mesmo padrão de SocialProof.test.tsx).
const reduceMotion = { value: false };

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

const fonte = () =>
  readFileSync(resolve(__dirname, '../contactsMotion.ts'), 'utf8');

beforeEach(() => {
  reduceMotion.value = false;
});

describe('contactsMotion — movimento do módulo Contatos (RD-004)', () => {
  it('1. exporta exatamente as três durações de 120, 220 e 550 ms', () => {
    expect(contatos.contactsDurationsMs).toEqual({ micro: 120, hover: 220, portrait: 550 });
    expect(Object.values(contatos.contactsDurationsMs).sort((a, b) => a - b)).toEqual([120, 220, 550]);
  });

  it('2. as durações em segundos são as mesmas, só na unidade do framer-motion', () => {
    expect(contatos.contactsDurations.micro * 1000).toBe(contatos.contactsDurationsMs.micro);
    expect(contatos.contactsDurations.hover * 1000).toBe(contatos.contactsDurationsMs.hover);
    expect(contatos.contactsDurations.portrait * 1000).toBe(contatos.contactsDurationsMs.portrait);
    expect(contatos.contactsDurations.hover).toBe(0.22);
  });

  it('3. a curva do retrato é a do modelo, no texto e no array equivalente', () => {
    expect(contatos.contactsEaseCss.portrait).toBe('cubic-bezier(.2,.8,.2,1)');
    expect(Array.from(contatos.contactsEase.portrait)).toEqual([0.2, 0.8, 0.2, 1]);

    // O array é o MESMO movimento do texto: mesmos 4 números, na mesma ordem.
    const numerosDoTexto = contatos.contactsEaseCss.portrait
      .replace('cubic-bezier(', '')
      .replace(')', '')
      .split(',')
      .map((n) => Number(n));
    expect(numerosDoTexto).toEqual(Array.from(contatos.contactsEase.portrait));
  });

  it('4. a curva padrão é o token do movimento global (reuso, não cópia)', () => {
    // `src/lib/motion.ts` já existe: o módulo reusa o token em vez de recriar.
    expect(contatos.contactsEase.standard).toBe(zappMotion.ease.standard);
    expect(contatos.contactsEaseCss.standard).toBe(
      `cubic-bezier(${zappMotion.ease.standard.join(',')})`,
    );
  });

  it('5. a ficha começa invisível e deslocada em 12 px', () => {
    expect(contatos.CONTACTS_FICHA_DISTANCE).toBe(12);
    expect(contatos.contactsFichaVariants.hidden).toEqual({ opacity: 0, y: 12 });
  });

  it('6. o estado final da ficha é visível e na posição (opacity 1, y 0)', () => {
    expect(contatos.contactsFichaVariants.visible).toMatchObject({ opacity: 1, y: 0 });
  });

  it('7. a transição da ficha usa a duração do módulo, não número solto', () => {
    const transicao = (contatos.contactsFichaVariants.visible as {
      transition?: { duration?: number };
    }).transition;
    expect(transicao?.duration).toBe(contatos.contactsDurations.hover);
  });

  it('8. com reduzir ligado, TODAS as durações viram 0', () => {
    expect(contatos.contactsDurationsFor(true)).toEqual({ micro: 0, hover: 0, portrait: 0 });
    expect(contatos.contactsDurationsFor(false)).toEqual({
      micro: 120,
      hover: 220,
      portrait: 550,
    });
  });

  it('9. com reduzir ligado, o carrossel não anda', () => {
    expect(contatos.contactsCarouselMotion(true)).toEqual({
      autoplay: false,
      scrollDurationMs: 0,
    });
  });

  it('10. sem reduzir, o carrossel anda nos 550 ms do módulo', () => {
    expect(contatos.contactsCarouselMotion(false)).toEqual({
      autoplay: true,
      scrollDurationMs: 550,
    });
  });

  it('11. com reduzir ligado, a ficha entra no estado final sem animar', () => {
    const normal = contatos.contactsFichaMotion(false);
    const reduzido = contatos.contactsFichaMotion(true);

    expect(normal.initial).toBe('hidden');
    expect(reduzido.initial).toBe(false);
    expect(reduzido.animate).toBe('visible');
    expect(reduzido.variants.visible).toMatchObject({ opacity: 1, y: 0 });
    expect(reduzido.durationMs).toBe(0);
  });

  it('12. o hook usa o useReducedMotion do framer-motion e só aí muda de modo', () => {
    const { result, rerender } = renderHook(() => contatos.useContactsMotion());
    expect(result.current.reduced).toBe(false);
    expect(result.current.durations.portrait).toBe(550);
    expect(result.current.carousel.autoplay).toBe(true);

    reduceMotion.value = true;
    rerender();
    expect(result.current.reduced).toBe(true);
    expect(result.current.durations).toEqual({ micro: 0, hover: 0, portrait: 0 });
    expect(result.current.carousel.autoplay).toBe(false);
    expect(result.current.ficha.initial).toBe(false);

    // E o hook vem mesmo do framer-motion, não de um estado próprio.
    expect(fonte()).toMatch(
      /import\s*\{[^}]*\buseReducedMotion\b[^}]*\}\s*from\s*'framer-motion'/,
    );
    expect(fonte()).toMatch(/=\s*useReducedMotion\(\)/);
  });

  it('13. não é cópia do movimento global e não mexe em cookie nem em localStorage', () => {
    // Nenhum nome de export se repete em relação a `src/lib/motion.ts`.
    const comuns = Object.keys(contatos).filter((nome) => nome in movimentoGlobal);
    expect(comuns).toEqual([]);
    expect(contatos.contactsEase.portrait).not.toBe(zappMotion.ease.standard);

    const conteudo = fonte();
    expect(conteudo).toMatch(/from '@\/lib\/motion'/);
    expect(conteudo).not.toMatch(/\bzappTransition\b|\bzappSubviewVariants\b/);
    expect(conteudo).not.toMatch(/document\.cookie/);
    expect(conteudo).not.toMatch(/localStorage|sessionStorage/);
  });
});
