import { describe, expect, it } from 'vitest';

import { periodStartIso } from '@/pages/admin-telemetria/telemetryUtils';
import { localDayKey } from '@/lib/localDay';

/**
 * "7d" = 7 DIAS DE CALENDARIO (hoje + 6 anteriores) — o mesmo recorte do R3-06 na timeline.
 * Antes, o `else` do getTimeThreshold devolvia 604_800_000 (168 h corridas): as 22h30 em Sao Paulo
 * a janela alcancava o 8o dia de calendario, mostrando mais do que o rotulo promete.
 *
 * O helper segue o fuso do NAVEGADOR (nao ha `TZ` fixado no vitest nem no CI, entao o CI roda em
 * UTC). Por isso a prova principal aqui e SEMANTICA e nao depende do fuso do processo: o inicio tem
 * de cair na virada de um dia (00:00) e a distancia ate hoje tem de ser de 6 dias de calendario.
 * A camada com instantes absolutos so roda quando o processo esta em America/Sao_Paulo.
 *
 * Cenário dos testes: 30/09/2026 22:30 em Sao Paulo (= 01/10 01:30Z).
 */
const AS_2230_SP = new Date('2026-09-30T22:30:00-03:00');

/** Distancia em dias de CALENDARIO entre duas chaves `yyyy-MM-dd` (aritmetica de chave, sem hora). */
const diasEntre = (de: string, ate: string) => (Date.parse(ate) - Date.parse(de)) / 86_400_000;

describe('periodStartIso — 7d em dias de calendario (independente do fuso do processo)', () => {
  it('7d comeca na virada de um dia de calendario (00:00:00.000)', () => {
    const inicio = new Date(periodStartIso('7d', AS_2230_SP));
    expect(inicio.getHours()).toBe(0);
    expect(inicio.getMinutes()).toBe(0);
    expect(inicio.getSeconds()).toBe(0);
    expect(inicio.getMilliseconds()).toBe(0);
  });

  it('7d cobre exatamente 7 dias de calendario, hoje incluso (6 dias atras)', () => {
    const inicio = periodStartIso('7d', AS_2230_SP);
    const hoje = localDayKey(AS_2230_SP);
    const primeiroDia = localDayKey(inicio);
    expect(primeiroDia).not.toBeNull();
    expect(diasEntre(primeiroDia as string, hoje as string)).toBe(6);
  });

  it('7d nao alcanca o 8o dia de calendario (o defeito das 22h30 em SP)', () => {
    const inicio = localDayKey(periodStartIso('7d', AS_2230_SP)) as string;
    const oitavoDiaAtras = localDayKey(new Date(AS_2230_SP.getTime() - 7 * 86_400_000)) as string;
    expect(inicio).not.toBe(oitavoDiaAtras);
  });

  it('um minuto na virada da meia-noite move o inicio em um dia inteiro', () => {
    // Prova comportamental de calendario: uma janela corrida nao mudaria de dia assim.
    // A meia-noite e a DO PROCESSO (por isso o teste vale em SP e no UTC do CI).
    const meiaNoite = new Date(AS_2230_SP);
    meiaNoite.setHours(0, 0, 0, 0);
    const antes = new Date(meiaNoite.getTime() - 60_000);
    const depois = new Date(meiaNoite.getTime() + 60_000);
    const dAntes = localDayKey(periodStartIso('7d', antes)) as string;
    const dDepois = localDayKey(periodStartIso('7d', depois)) as string;
    expect(diasEntre(dAntes, dDepois)).toBe(1);
  });

  it('1h/6h/24h continuam janelas corridas (o rotulo promete horas)', () => {
    expect(periodStartIso('1h', AS_2230_SP)).toBe(new Date(AS_2230_SP.getTime() - 3_600_000).toISOString());
    expect(periodStartIso('6h', AS_2230_SP)).toBe(new Date(AS_2230_SP.getTime() - 6 * 3_600_000).toISOString());
    expect(periodStartIso('24h', AS_2230_SP)).toBe(new Date(AS_2230_SP.getTime() - 24 * 3_600_000).toISOString());
  });
});

// Camada ancorada: instantes absolutos so valem com o processo em Sao Paulo (nao ha TZ fixado no CI).
describe.skipIf(process.env.TZ !== 'America/Sao_Paulo')('periodStartIso — ancorado em America/Sao_Paulo', () => {
  it('7d = 24/09 00:00 em SP (03:00Z), nao 168 h corridas (01:30Z)', () => {
    expect(periodStartIso('7d', AS_2230_SP)).toBe('2026-09-24T03:00:00.000Z');
  });

  it('7d de manha comeca no mesmo 7o dia de calendario (25/09 00:00 em SP)', () => {
    expect(periodStartIso('7d', new Date('2026-10-01T09:00:00-03:00'))).toBe('2026-09-25T03:00:00.000Z');
  });
});
