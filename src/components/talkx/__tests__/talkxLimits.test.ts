import { describe, expect, it } from 'vitest';
import {
  intervalForProfile,
  isValidIntervalSeconds,
  msToSeconds,
  secondsToMs,
  LIMITS_MIN_S,
  LIMITS_MAX_S,
} from '../talkxLimits';

describe('talkxLimits (X006 — unidade ms × s)', () => {
  it('8000 ms abre como 8', () => {
    expect(msToSeconds(8000)).toBe(8);
  });

  it('10 s salva 10000', () => {
    expect(secondsToMs(10)).toBe(10000);
  });

  it('perfil slow devolve 15000–30000', () => {
    expect(intervalForProfile('slow')).toEqual([15000, 30000]);
  });

  it('perfil moderate devolve 8000–20000', () => {
    expect(intervalForProfile('moderate')).toEqual([8000, 20000]);
  });

  it('perfil fast devolve 3000–8000', () => {
    expect(intervalForProfile('fast')).toEqual([3000, 8000]);
  });

  it('2 s é recusado', () => {
    expect(isValidIntervalSeconds(2)).toBe(false);
  });

  it('piso 3 s e teto 600 s são aceitos', () => {
    expect(isValidIntervalSeconds(LIMITS_MIN_S)).toBe(true);
    expect(isValidIntervalSeconds(LIMITS_MAX_S)).toBe(true);
  });

  it('601 s é recusado', () => {
    expect(isValidIntervalSeconds(601)).toBe(false);
  });

  it('valor não finito é recusado', () => {
    expect(isValidIntervalSeconds(Number.NaN)).toBe(false);
  });

  it('conversão ida-e-volta preserva o valor', () => {
    expect(msToSeconds(secondsToMs(10))).toBe(10);
  });
});
