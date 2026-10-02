import { describe, expect, it, vi } from 'vitest';
import {
  BASE36_MAIUSCULO,
  secureRandomChars,
  secureRandomFloat,
  secureRandomInt,
} from '../secureRandom';

/**
 * Estes testes existem para que a troca de `Math.random()` por fonte
 * criptografica nao regrida em silencio: se alguem voltar a implementar com
 * `Math.random()`, o teste da fonte quebra.
 */
describe('secureRandomFloat', () => {
  it('devolve sempre um valor em [0, 1), como Math.random()', () => {
    for (let i = 0; i < 5000; i += 1) {
      const valor = secureRandomFloat();
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThan(1);
    }
  });

  it('usa crypto.getRandomValues como fonte (nao e Math.random)', () => {
    const espiao = vi.spyOn(globalThis.crypto, 'getRandomValues');
    secureRandomFloat();
    expect(espiao).toHaveBeenCalledTimes(1);
    espiao.mockRestore();
  });

  it('nao devolve o mesmo valor em 1000 chamadas seguidas', () => {
    const vistos = new Set<number>();
    for (let i = 0; i < 1000; i += 1) vistos.add(secureRandomFloat());
    expect(vistos.size).toBe(1000);
  });
});

describe('secureRandomInt', () => {
  it('respeita o intervalo [0, max)', () => {
    for (const max of [1, 2, 3, 6, 10, 36, 100, 2 ** 31]) {
      for (let i = 0; i < 500; i += 1) {
        const valor = secureRandomInt(max);
        expect(Number.isInteger(valor)).toBe(true);
        expect(valor).toBeGreaterThanOrEqual(0);
        expect(valor).toBeLessThan(max);
      }
    }
  });

  it('com max=1 devolve sempre 0', () => {
    for (let i = 0; i < 100; i += 1) expect(secureRandomInt(1)).toBe(0);
  });

  it('recusa max invalido', () => {
    for (const invalido of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => secureRandomInt(invalido)).toThrow(RangeError);
    }
  });

  it('cobre todos os valores possiveis (sem faixa morta)', () => {
    const vistos = new Set<number>();
    for (let i = 0; i < 2000; i += 1) vistos.add(secureRandomInt(6));
    expect(Array.from(vistos).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('secureRandomChars', () => {
  it('devolve exatamente o tamanho pedido, so com caracteres do alfabeto', () => {
    for (let i = 0; i < 200; i += 1) {
      const texto = secureRandomChars(8, BASE36_MAIUSCULO);
      expect(texto).toHaveLength(8);
      for (const caractere of texto) expect(BASE36_MAIUSCULO).toContain(caractere);
    }
  });

  it('recusa tamanho/alfabeto invalidos', () => {
    expect(() => secureRandomChars(0, BASE36_MAIUSCULO)).toThrow(RangeError);
    expect(() => secureRandomChars(-1, BASE36_MAIUSCULO)).toThrow(RangeError);
    expect(() => secureRandomChars(1.5, BASE36_MAIUSCULO)).toThrow(RangeError);
    expect(() => secureRandomChars(4, '')).toThrow(RangeError);
  });

  it('nao acumula repeticao suspeita em 500 sorteios de 4 caracteres (base do codigo de backup)', () => {
    // Com 36^4 = 1.679.616 combinacoes, 500 sorteios tem colisoes de aniversario
    // ESPERADAS: lambda = C(500,2)/36^4 = 0,0743. Exigir `size === 500` era um teste
    // flaky (~7,4% de falha por azar). Uma fonte viciada, que e o que este teste
    // guarda, produziria dezenas de repeticoes — 497 distintos ainda deixa folga de
    // ~1e-6 de falso alarme.
    const vistos = new Set<string>();
    for (let i = 0; i < 500; i += 1) vistos.add(secureRandomChars(4, BASE36_MAIUSCULO));
    expect(vistos.size).toBeGreaterThanOrEqual(497);
  });
});

describe('BASE36_MAIUSCULO', () => {
  it('e o mesmo conjunto que Math.random().toString(36).toUpperCase() produzia', () => {
    expect(BASE36_MAIUSCULO).toHaveLength(36);
    expect(new Set(BASE36_MAIUSCULO).size).toBe(36);
    expect(BASE36_MAIUSCULO).toBe('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  });
});
