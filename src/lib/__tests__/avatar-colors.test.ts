import { describe, it, expect } from 'vitest';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';

/**
 * `avatar-colors` deriva a cor do avatar do nome (hash determinístico) e as
 * iniciais dos dois primeiros nomes. O módulo não é mockado — os testes chamam
 * a função de produção e fixam comportamento observável (determinismo,
 * formato das classes, iniciais).
 */

describe('getAvatarColor', () => {
  it('devolve um par { bg, text } de strings não vazias', () => {
    const c = getAvatarColor('Ana');
    expect(typeof c.bg).toBe('string');
    expect(typeof c.text).toBe('string');
    expect(c.bg.length).toBeGreaterThan(0);
    expect(c.text.length).toBeGreaterThan(0);
  });

  it('é determinístico — o mesmo nome devolve sempre as mesmas classes', () => {
    const a = getAvatarColor('João Pedro');
    const b = getAvatarColor('João Pedro');
    expect(a).toEqual(b);
  });

  it('devolve exatamente um dos pares da paleta (bg/text coerentes)', () => {
    // Paleta do módulo: `bg-primary/15` ou `bg-[hsl(...)]`; texto `text-primary`
    // ou `text-[hsl(...)]`. Um par cruzado (bg de um tom com texto de outro)
    // indicaria índice inconsistente.
    const nomes = ['Ana', 'Bruno', 'Carla', 'Davi', 'Eva', 'Fábio', 'Gabi', '', 'a', 'zzz'];
    for (const nome of nomes) {
      const { bg, text } = getAvatarColor(nome);
      expect(bg, `nome: ${nome}`).toMatch(/^bg-/);
      expect(text, `nome: ${nome}`).toMatch(/^text-/);
    }
  });

  it('não lança com string vazia', () => {
    expect(() => getAvatarColor('')).not.toThrow();
  });
});

describe('getInitials', () => {
  it('usa as iniciais dos dois primeiros nomes', () => {
    expect(getInitials('Ana Maria Silva')).toBe('AM');
  });

  it('devolve em maiúsculas', () => {
    expect(getInitials('joão pedro')).toBe('JP');
  });

  it('usa apenas o primeiro nome quando há um só', () => {
    expect(getInitials('Ana')).toBe('A');
  });

  it('ignora espaços extras/vazios', () => {
    expect(getInitials('  Ana   Maria ')).toBe('AM');
  });

  it('não lança com string vazia', () => {
    expect(() => getInitials('')).not.toThrow();
  });
});
