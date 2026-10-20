import { describe, it, expect } from 'vitest';
import { deriveSystemHealth } from '../systemHealth';
import type { SystemHealthSignals } from '@/hooks/system/useSystemHealthSignals';

function signals(over: Partial<SystemHealthSignals> = {}): SystemHealthSignals {
  return { connections: [], failedRecent: 0, totalRecent: 0, stalledSending: 0, ...over };
}

const connected = { status: 'connected', healthStatus: 'healthy' };

describe('deriveSystemHealth — nota 0-100 do painel', () => {
  it('melhor caso: conexões saudáveis, sem falha e sem fila presa → 100 Excelente', () => {
    const r = deriveSystemHealth(signals({ connections: [connected, connected], failedRecent: 0, totalRecent: 50 }));
    expect(r.score).toBe(100);
    expect(r.grade).toBe('excelente');
    expect(r.tone).toBe('success');
    expect(r.items.map((i) => i.score)).toEqual([40, 30, 30]);
  });

  it('pior caso: nenhuma conexão, 20% de falha e 3+ presas → 0 Crítico', () => {
    const r = deriveSystemHealth(
      signals({
        connections: [{ status: 'disconnected', healthStatus: null }, { status: 'connecting', healthStatus: null }],
        failedRecent: 20,
        totalRecent: 100,
        stalledSending: 4,
      }),
    );
    expect(r.score).toBe(0);
    expect(r.grade).toBe('critico');
    expect(r.items.every((i) => i.status === 'bad')).toBe(true);
  });

  it('conexão degradada vale metade do sinal de conexões', () => {
    const r = deriveSystemHealth(signals({ connections: [connected, { status: 'connected', healthStatus: 'degraded' }] }));
    const conn = r.items.find((i) => i.id === 'connections')!;
    expect(conn.score).toBe(30); // (1 + 0.5) / 2 * 40
    expect(conn.status).toBe('warn');
    expect(conn.summary).toContain('1 degradada(s)');
  });

  it('taxa de falha zera o sinal exatamente em 10% e cai linearmente antes disso', () => {
    const zero = deriveSystemHealth(signals({ failedRecent: 10, totalRecent: 100 })).items.find((i) => i.id === 'failures')!;
    expect(zero.score).toBe(0);
    expect(zero.status).toBe('bad');

    const half = deriveSystemHealth(signals({ failedRecent: 5, totalRecent: 100 })).items.find((i) => i.id === 'failures')!;
    expect(half.score).toBe(15);
    expect(half.status).toBe('warn');
    expect(half.summary).toContain('5%');
  });

  it('fila presa desconta 10 por mensagem e zera com 3', () => {
    const one = deriveSystemHealth(signals({ stalledSending: 1 })).items.find((i) => i.id === 'stalled')!;
    expect(one.score).toBe(20);
    expect(one.status).toBe('warn');

    const three = deriveSystemHealth(signals({ stalledSending: 3 })).items.find((i) => i.id === 'stalled')!;
    expect(three.score).toBe(0);
    expect(three.status).toBe('bad');
  });

  it('sem envio nas últimas 24h o sinal de falhas fica cheio, mas sem afirmar 0% de falha', () => {
    const f = deriveSystemHealth(signals({ failedRecent: 0, totalRecent: 0 })).items.find((i) => i.id === 'failures')!;
    expect(f.score).toBe(30);
    expect(f.summary).toBe('Nenhum envio nas últimas 24h');
  });

  it('fronteiras de nota: 88 é Bom, 58 é Atenção, 0 é Crítico', () => {
    // 40 + 18 + 30 = 88 (Bom)
    expect(
      deriveSystemHealth(signals({ connections: [connected], failedRecent: 4, totalRecent: 100 })).grade,
    ).toBe('bom');
    // 20 (só conexão degradada) + 18 + 20 (1 presa) = 58 (Atenção)
    const atencao = deriveSystemHealth(
      signals({
        connections: [{ status: 'connected', healthStatus: 'degraded' }],
        failedRecent: 4,
        totalRecent: 100,
        stalledSending: 1,
      }),
    );
    expect(atencao.score).toBe(58);
    expect(atencao.grade).toBe('atencao');
    expect(atencao.tone).toBe('warning');
  });
});
