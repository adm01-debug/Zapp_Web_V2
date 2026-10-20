import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the pure functions directly (not the hook)
// We extract the logic to test independently

type SLAStatus = 'ok' | 'warning' | 'breached';

interface StatusResult {
  status: SLAStatus;
  remainingMs: number;
  breached: boolean;
}

// Mirror the pure calculation logic from useSLACalculation
// Regra de negocio: alerta (warning) apos 2 min fixos; breach no deadline (5 min)
function calculateStatus(
  remainingMs: number,
  totalMs: number,
  warningMs: number,
  completed: boolean,
  completedAt?: Date | null,
  deadline?: Date
): StatusResult {
  if (completed && completedAt && deadline) {
    const breached = completedAt > deadline;
    return { status: breached ? 'breached' : 'ok', remainingMs: 0, breached };
  }
  if (remainingMs <= 0) return { status: 'breached', remainingMs, breached: true };
  // alerta (laranja) quando decorridos >= warningMinutes (restante <= total - warning)
  if (remainingMs <= totalMs - warningMs) return { status: 'warning', remainingMs, breached: false };
  return { status: 'ok', remainingMs, breached: false };
}

const WARNING_MS = 2 * 60_000; // 2 minutos fixos

function formatTimeRemaining(ms: number): string {
  const absMs = Math.abs(ms);
  const totalSeconds = Math.floor(absMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

describe('calculateStatus', () => {
  it('returns ok when completed on time', () => {
    const deadline = new Date('2026-01-01T12:05:00Z');
    const completedAt = new Date('2026-01-01T12:03:00Z');
    const result = calculateStatus(0, 300_000, WARNING_MS, true, completedAt, deadline);
    expect(result.status).toBe('ok');
    expect(result.breached).toBe(false);
    expect(result.remainingMs).toBe(0);
  });

  it('returns breached when completed late', () => {
    const deadline = new Date('2026-01-01T12:05:00Z');
    const completedAt = new Date('2026-01-01T12:10:00Z');
    const result = calculateStatus(0, 300_000, WARNING_MS, true, completedAt, deadline);
    expect(result.status).toBe('breached');
    expect(result.breached).toBe(true);
  });

  it('returns ok with plenty of time remaining', () => {
    const totalMs = 5 * 60_000; // 5 min
    const remainingMs = 4 * 60_000; // 4 min (80% left)
    const result = calculateStatus(remainingMs, totalMs, WARNING_MS, false);
    expect(result.status).toBe('ok');
    expect(result.remainingMs).toBe(remainingMs);
  });

  it('returns warning dentro da janela de 2 min (regra: laranja apos 2 min)', () => {
    const totalMs = 5 * 60_000; // deadline 5 min
    const remainingMs = 2.5 * 60_000; // decorridos 2.5 min (> 2 min, < 5 min)
    const result = calculateStatus(remainingMs, totalMs, WARNING_MS, false);
    expect(result.status).toBe('warning');
    expect(result.breached).toBe(false);
  });

  it('returns warning exatamente aos 2 min', () => {
    const totalMs = 5 * 60_000;
    const remainingMs = 3 * 60_000; // 3 min restantes = 2 min decorridos
    const result = calculateStatus(remainingMs, totalMs, WARNING_MS, false);
    expect(result.status).toBe('warning');
  });

  it('returns ok antes dos 2 min', () => {
    const totalMs = 5 * 60_000;
    const remainingMs = 3.1 * 60_000; // 1.9 min decorridos
    const result = calculateStatus(remainingMs, totalMs, WARNING_MS, false);
    expect(result.status).toBe('ok');
  });


  it('returns breached when remaining is 0', () => {
    const result = calculateStatus(0, 60_000, WARNING_MS, false);
    expect(result.status).toBe('breached');
    expect(result.breached).toBe(true);
  });

  it('returns breached when remaining is negative', () => {
    const result = calculateStatus(-30_000, 60_000, WARNING_MS, false);
    expect(result.status).toBe('breached');
    expect(result.remainingMs).toBe(-30_000);
  });

  it('deadline curto (1 min) permanece ok antes do prazo quando warningMinutes e maior que o prazo', () => {
    const totalMs = 60_000;
    const remainingMs = 55_000; // 5s decorridos; restante > total - 2min (negativo) -> ok
    const result = calculateStatus(remainingMs, totalMs, WARNING_MS, false);
    expect(result.status).toBe('ok');
  });
});

describe('formatTimeRemaining', () => {
  it('formats seconds only', () => {
    expect(formatTimeRemaining(45_000)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimeRemaining(125_000)).toBe('2m 5s');
  });

  it('formats hours and minutes', () => {
    expect(formatTimeRemaining(5_400_000)).toBe('1h 30m');
  });

  it('formats exact hours', () => {
    expect(formatTimeRemaining(7_200_000)).toBe('2h 0m');
  });

  it('handles zero', () => {
    expect(formatTimeRemaining(0)).toBe('0s');
  });

  it('handles negative values (uses absolute)', () => {
    expect(formatTimeRemaining(-60_000)).toBe('1m 0s');
  });

  it('formats large values', () => {
    expect(formatTimeRemaining(86_400_000)).toBe('24h 0m');
  });

  it('formats sub-second values', () => {
    expect(formatTimeRemaining(500)).toBe('0s');
  });
});

describe('worstStatus derivation', () => {
  function deriveWorstStatus(fr: SLAStatus, res: SLAStatus): SLAStatus {
    if (fr === 'breached' || res === 'breached') return 'breached';
    if (fr === 'warning' || res === 'warning') return 'warning';
    return 'ok';
  }

  it('breached wins over all', () => {
    expect(deriveWorstStatus('breached', 'ok')).toBe('breached');
    expect(deriveWorstStatus('ok', 'breached')).toBe('breached');
    expect(deriveWorstStatus('breached', 'warning')).toBe('breached');
  });

  it('warning wins over ok', () => {
    expect(deriveWorstStatus('warning', 'ok')).toBe('warning');
    expect(deriveWorstStatus('ok', 'warning')).toBe('warning');
  });

  it('ok when both ok', () => {
    expect(deriveWorstStatus('ok', 'ok')).toBe('ok');
  });
});
