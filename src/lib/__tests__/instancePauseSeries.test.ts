import { describe, it, expect } from 'vitest';
import { buildPauseSeries, isPauseActive, type PauseRow } from '../instancePauseSeries';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const row = (minutesAgo: number, auto = false): PauseRow => ({
  created_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
  paused_until: new Date(NOW + 3_600_000).toISOString(),
  resumed_at: null,
  auto,
});

describe('buildPauseSeries', () => {
  it('24h: 24 baldes por hora, separando manual e automática', () => {
    const b = buildPauseSeries([row(10), row(30, true), row(90)], '24h', NOW);
    expect(b).toHaveLength(24);
    expect(b[23]).toMatchObject({ manual: 1, auto: 1 });
    expect(b[22].manual).toBe(1);
  });

  it('7d: 7 baldes por dia e ignora o que está fora da janela', () => {
    const b = buildPauseSeries([row(60), row(60 * 24 * 3), row(60 * 24 * 8)], '7d', NOW);
    expect(b).toHaveLength(7);
    expect(b.reduce((s, x) => s + x.manual, 0)).toBe(2);
  });

  it('sem linhas: tudo zero', () => {
    expect(buildPauseSeries([], '24h', NOW).every((x) => x.manual + x.auto === 0)).toBe(true);
  });
});

describe('isPauseActive', () => {
  it('ativa só se não retomada e dentro do prazo', () => {
    expect(isPauseActive({ paused_until: new Date(NOW + 1000).toISOString(), resumed_at: null }, NOW)).toBe(true);
    expect(isPauseActive({ paused_until: new Date(NOW - 1000).toISOString(), resumed_at: null }, NOW)).toBe(false);
    expect(isPauseActive({ paused_until: new Date(NOW + 1000).toISOString(), resumed_at: new Date(NOW).toISOString() }, NOW)).toBe(false);
  });
});
