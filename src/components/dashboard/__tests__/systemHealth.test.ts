import { describe, it, expect } from 'vitest';
import { CREDENTIALS_MAX, deriveSystemHealth } from '../systemHealth';
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
    // A nota sai dos três sinais (40+30+30); 'credentials' é informativo e tem escala própria.
    expect(r.items.map((i) => i.score)).toEqual([40, 30, 30, 100]);
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
    expect(r.items.filter((i) => i.id !== 'credentials').every((i) => i.status === 'bad')).toBe(true);
    // Nenhuma conexão sem credencial aqui: o sinal informativo não inventa falha.
    expect(r.items.find((i) => i.id === 'credentials')!.status).toBe('ok');
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

describe('deriveSystemHealth — credencial da conexão (sinal informativo)', () => {
  it('conexão sem credencial aparece no detalhe em vez de contar como saudável', () => {
    // A sonda grava health_status 'no_credentials' sem mexer no status (fail-closed),
    // então o sinal de conexões a vê como "conectada": sem esta linha ela ficaria invisível.
    const r = deriveSystemHealth(
      signals({ connections: [connected, { status: 'connected', healthStatus: 'no_credentials' }] }),
    );
    const cred = r.items.find((i) => i.id === 'credentials')!;
    expect(cred.max).toBe(CREDENTIALS_MAX);
    expect(cred.score).toBe(50);
    // Metade das conexões sem credencial (1 de 2) já é Falha; abaixo disso é Atenção.
    expect(cred.status).toBe('bad');
    expect(cred.summary).toBe('1 de 2 conexão(ões) sem credencial');
  });

  it('nenhuma conexão sem credencial → sinal cheio e OK', () => {
    const cred = deriveSystemHealth(signals({ connections: [connected, connected] })).items.find(
      (i) => i.id === 'credentials',
    )!;
    expect(cred.score).toBe(100);
    expect(cred.status).toBe('ok');
    expect(cred.summary).toBe('Todas as conexões com credencial válida');
  });

  it('metade ou mais sem credencial → 0 e Falha; abaixo disso é Atenção', () => {
    const todas = deriveSystemHealth(
      signals({
        connections: [
          { status: 'connected', healthStatus: 'no_credentials' },
          { status: 'connected', healthStatus: 'no_credentials' },
        ],
      }),
    ).items.find((i) => i.id === 'credentials')!;
    expect(todas.score).toBe(0);
    expect(todas.status).toBe('bad');
    expect(todas.summary).toBe('2 de 2 conexão(ões) sem credencial');

    const umaDeTres = deriveSystemHealth(
      signals({
        connections: [connected, connected, { status: 'connected', healthStatus: 'no_credentials' }],
      }),
    ).items.find((i) => i.id === 'credentials')!;
    expect(umaDeTres.score).toBe(67);
    expect(umaDeTres.status).toBe('warn');
    expect(umaDeTres.summary).toBe('1 de 3 conexão(ões) sem credencial');
  });

  it('sem conexão para avaliar: não afirma credencial quebrada nem inventa nota', () => {
    const cred = deriveSystemHealth(signals()).items.find((i) => i.id === 'credentials')!;
    expect(cred.score).toBe(100);
    expect(cred.status).toBe('ok');
    expect(cred.summary).toBe('Nenhuma conexão para avaliar credencial');
  });

  it('a credencial NÃO entra na nota: os 100 pontos continuam saindo de 100', () => {
    const sem = deriveSystemHealth(signals({ connections: [connected, connected], totalRecent: 50 }));
    const com = deriveSystemHealth(
      signals({ connections: [connected, { status: 'connected', healthStatus: 'no_credentials' }], totalRecent: 50 }),
    );

    // A nota não se move (o sinal informativo tem escala própria, 0-100) …
    expect(com.score).toBe(sem.score);
    expect(com.score).toBe(100);
    expect(com.grade).toBe('excelente');

    // … e a ordem dos itens é estável: três sinais da nota + a credencial.
    expect(com.items.map((i) => i.id)).toEqual(['connections', 'failures', 'stalled', 'credentials']);

    // Invariante: a nota é exatamente a soma dos três sinais da nota, limitada a 100.
    const somaNota = com.items
      .filter((i) => i.id !== 'credentials')
      .reduce((acc, i) => acc + i.score, 0);
    expect(somaNota).toBe(com.score);
    expect(com.score).toBeLessThanOrEqual(100);
    expect(sem.items.filter((i) => i.id !== 'credentials').reduce((acc, i) => acc + i.max, 0)).toBe(100);
  });
});
