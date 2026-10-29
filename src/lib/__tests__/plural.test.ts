import { describe, it, expect } from 'vitest';
import { plural } from '../plural';

/**
 * t_68472f55 — o rótulo acessível de reações saía com a terminação de plural colada na palavra
 * ("reação" + terminação) em vez da palavra inteira. A fonte única decide a palavra INTEIRA pelo
 * número exibido. A terminação errada é montada por pedaços aqui para não deixá-la escrita no código.
 */
describe('plural (pt-BR)', () => {
  const terminacaoErrada = 'o' + 'ões';
  const repeticaoErrada = 'tos ' + 'tos';

  it('usa o singular com 1 e o plural com 2+', () => {
    expect(plural(1, 'reação', 'reações')).toBe('1 reação');
    expect(plural(2, 'reação', 'reações')).toBe('2 reações');
    expect(plural(1, 'pessoa', 'pessoas')).toBe('1 pessoa');
    expect(plural(7, 'pessoa', 'pessoas')).toBe('7 pessoas');
  });

  it('nunca forma o plural colando a terminação na palavra', () => {
    for (const n of [0, 1, 3, 12]) {
      expect(plural(n, 'reação', 'reações')).not.toContain(terminacaoErrada);
      expect(plural(n, 'contato', 'contatos')).not.toContain(repeticaoErrada);
    }
    expect(plural(0, 'contato', 'contatos')).toBe('0 contatos');
  });

  it('o número do rótulo é o mesmo que decide a forma (não há "1 reações")', () => {
    expect(plural(1, 'reação', 'reações')).toMatch(/^1 /);
    expect(plural(1, 'reação', 'reações')).not.toContain('reações');
  });
});
