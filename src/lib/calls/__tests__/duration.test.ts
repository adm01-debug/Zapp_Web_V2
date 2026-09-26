import { describe, it, expect } from 'vitest';

import {
  NO_DURATION_LABEL,
  formatClock,
  formatTalk,
  parseTimestamp,
  talkSeconds,
} from '../duration';

describe('talkSeconds', () => {
  it('usa talk_seconds quando existe', () => {
    expect(talkSeconds({ talk_seconds: 258 })).toBe(258);
  });

  it('respeita talk_seconds = 0 (não recalcula pelos timestamps)', () => {
    expect(
      talkSeconds({
        talk_seconds: 0,
        answered_at: '2026-09-26T10:00:00.000Z',
        ended_at: '2026-09-26T10:04:18.000Z',
      }),
    ).toBe(0);
  });

  it('calcula answered_at → ended_at quando talk_seconds é null', () => {
    expect(
      talkSeconds({
        talk_seconds: null,
        answered_at: '2026-09-26T10:00:00.000Z',
        ended_at: '2026-09-26T10:04:18.000Z',
      }),
    ).toBe(258);
  });

  it('sem talk_seconds e sem ended_at → null', () => {
    expect(
      talkSeconds({
        talk_seconds: null,
        answered_at: '2026-09-26T10:00:00.000Z',
        ended_at: null,
      }),
    ).toBeNull();
  });

  it('sem nenhum dado → null', () => {
    expect(talkSeconds({})).toBeNull();
    expect(talkSeconds(null)).toBeNull();
    expect(talkSeconds(undefined)).toBeNull();
  });

  it('intervalo negativo (relógio invertido) → null', () => {
    expect(
      talkSeconds({
        answered_at: '2026-09-26T10:04:18.000Z',
        ended_at: '2026-09-26T10:00:00.000Z',
      }),
    ).toBeNull();
  });

  it('talk_seconds inválido cai para os timestamps', () => {
    expect(
      talkSeconds({
        talk_seconds: 'abc',
        answered_at: '2026-09-26T10:00:00.000Z',
        ended_at: '2026-09-26T10:04:18.000Z',
      }),
    ).toBe(258);
  });

  it('talk_seconds em string numérica é aceito', () => {
    expect(talkSeconds({ talk_seconds: '42' })).toBe(42);
  });
});

describe('parseTimestamp', () => {
  it('aceita ISO, Date e epoch em ms', () => {
    expect(parseTimestamp('2026-09-26T10:00:00.000Z')).toBe(
      Date.parse('2026-09-26T10:00:00.000Z'),
    );
    expect(parseTimestamp(new Date('2026-09-26T10:00:00.000Z'))).toBe(
      Date.parse('2026-09-26T10:00:00.000Z'),
    );
    expect(parseTimestamp(1_758_888_000_000)).toBe(1_758_888_000_000);
  });

  it('devolve null para vazio e inválido', () => {
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
    expect(parseTimestamp('banana')).toBeNull();
    expect(parseTimestamp(new Date('invalid'))).toBeNull();
  });
});

describe('formatClock', () => {
  const cases: { seconds: number | null; expected: string }[] = [
    { seconds: 258, expected: '04:18' },
    { seconds: 3756, expected: '1:02:36' },
    { seconds: 59, expected: '00:59' },
    { seconds: 3600, expected: '1:00:00' },
    { seconds: 3599, expected: '59:59' },
    { seconds: 1, expected: '00:01' },
  ];

  for (const testCase of cases) {
    it(`${testCase.seconds}s → ${testCase.expected}`, () => {
      expect(formatClock(testCase.seconds)).toBe(testCase.expected);
    });
  }

  it('sem duração → —', () => {
    expect(formatClock(null)).toBe(NO_DURATION_LABEL);
    expect(formatClock(undefined)).toBe(NO_DURATION_LABEL);
    expect(formatClock(0)).toBe(NO_DURATION_LABEL);
    expect(formatClock(-12)).toBe(NO_DURATION_LABEL);
    expect(formatClock(Number.NaN)).toBe(NO_DURATION_LABEL);
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe(NO_DURATION_LABEL);
  });
});

describe('formatTalk', () => {
  const cases: { seconds: number | null; expected: string }[] = [
    { seconds: 45, expected: '45s' },
    { seconds: 222, expected: '3m 42s' },
    { seconds: 3720, expected: '1h 02m' },
    { seconds: 60, expected: '1m 00s' },
    { seconds: 3600, expected: '1h 00m' },
    { seconds: 7325, expected: '2h 02m' },
  ];

  for (const testCase of cases) {
    it(`${testCase.seconds}s → ${testCase.expected}`, () => {
      expect(formatTalk(testCase.seconds)).toBe(testCase.expected);
    });
  }

  it('sem duração → —', () => {
    expect(formatTalk(null)).toBe(NO_DURATION_LABEL);
    expect(formatTalk(undefined)).toBe(NO_DURATION_LABEL);
    expect(formatTalk(0)).toBe(NO_DURATION_LABEL);
    expect(formatTalk(-1)).toBe(NO_DURATION_LABEL);
    expect(formatTalk(Number.NaN)).toBe(NO_DURATION_LABEL);
  });
});
