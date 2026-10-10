import { describe, expect, it } from 'vitest';
import { formatBirthday } from '../formatters';

const NOW = new Date(2026, 9, 2, 12, 0, 0); // 02/10/2026 12h local

describe('formatBirthday', () => {
  it('formata dd/MM/yyyy e calcula a idade em anos completos', () => {
    const { label, age } = formatBirthday('1985-03-14', NOW);
    expect(label).toBe('14/03/1985');
    expect(age).toBe(41);
  });

  it('não conta o aniversário que ainda não chegou no ano', () => {
    expect(formatBirthday('1985-12-25', NOW).age).toBe(40);
  });

  it('conta o aniversário no próprio dia', () => {
    const mesmoDia = new Date(2026, 9, 2);
    expect(formatBirthday('1990-10-02', mesmoDia).age).toBe(36);
  });

  it('ano bissexto: 29/02 conta no dia 28/02 de ano comum (regra de data local)', () => {
    const antesDoAniversario = new Date(2026, 1, 27);
    const noDia = new Date(2026, 1, 28);
    const depoisDoAniversario = new Date(2026, 2, 1);
    expect(formatBirthday('2000-02-29', antesDoAniversario).age).toBe(25);
    expect(formatBirthday('2000-02-29', noDia).age).toBe(26);
    expect(formatBirthday('2000-02-29', depoisDoAniversario).age).toBe(26);
  });

  it('data impossível que o construtor normaliza devolve null', () => {
    expect(formatBirthday('2025-02-30', NOW)).toEqual({ label: null, age: null });
    expect(formatBirthday('2025-13-01', NOW)).toEqual({ label: null, age: null });
    expect(formatBirthday('0085-01-15', NOW)).toEqual({ label: null, age: null });
  });

  it('data futura devolve label mas idade nula', () => {
    const { label, age } = formatBirthday('2030-01-01', NOW);
    expect(label).toBe('01/01/2030');
    expect(age).toBeNull();
  });

  it('data inválida ou ausente devolve null', () => {
    expect(formatBirthday('não-é-data', NOW)).toEqual({ label: null, age: null });
    expect(formatBirthday(null, NOW)).toEqual({ label: null, age: null });
    expect(formatBirthday(undefined, NOW)).toEqual({ label: null, age: null });
    expect(formatBirthday('', NOW)).toEqual({ label: null, age: null });
  });
});
