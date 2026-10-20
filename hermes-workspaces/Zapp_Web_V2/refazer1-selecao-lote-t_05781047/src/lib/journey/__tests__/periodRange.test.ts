/**
 * S043/S044 do plano `docs/plans/PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS_2026-10-07.md`
 * (cartão J02) e a decisão D04: o período do Histórico usa os MESMOS atalhos do calendário da
 * aba IA (Hoje, 3/7/14/30/90 dias, Qualquer data, De/Até).
 *
 * Fuso do aparelho forçado a São Paulo (UTC-3), como no resto do produto: é o único cenário em
 * que o defeito clássico aparece. As duas armadilhas que estes testes discriminam:
 *   1. janela de N×24h (`now − N * 86_400_000`) — às 23:59:59.999 come um dia a mais;
 *   2. fatiar/parsear a data em UTC (`new Date('2026-10-07')` = meia-noite UTC = 06/10 21:00 em
 *      UTC-3) — foi o defeito registrado em `src/lib/localDay.ts`.
 */
process.env.TZ = 'America/Sao_Paulo';

import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveRange,
  previousRange,
  toIsoRange,
  isWithin,
  describePeriod,
  type JourneyPeriod,
  type JourneyPeriodPreset,
  type JourneyRange,
} from '@/lib/journey/periodRange';

const TZ_DO_PRODUTO = 'America/Sao_Paulo';
const DIA_MS = 24 * 60 * 60 * 1000;

/** 07/10/2026 12:00 no relógio do aparelho — longe de qualquer borda. */
const MEIO_DIA = new Date(2026, 9, 7, 12, 0, 0, 0);
/** Bordas do dia de referência, no fuso do aparelho. */
const MEIA_NOITE_HOJE = new Date(2026, 9, 7, 0, 0, 0, 0);
const FIM_DE_HOJE = new Date(2026, 9, 7, 23, 59, 59, 999);

/** `yyyy-MM-dd` local de um `Date` (ou `null`), sem passar por UTC. */
function chave(d: Date | null): string | null {
  if (d === null) return null;
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Dias de calendário que o intervalo cobre (bordas cheias, contagem inclusiva). */
function diasDoIntervalo(r: { from: Date | null; to: Date | null }): number {
  return Math.round((r.to!.getTime() - r.from!.getTime() + 1) / DIA_MS);
}

function exige(r: JourneyRange): { from: Date; to: Date } {
  if (!r.from || !r.to) throw new Error(`intervalo aberto inesperado: ${chave(r.from)}..${chave(r.to)}`);
  return { from: r.from, to: r.to };
}

describe('resolveRange — atalhos (D04)', () => {
  it('any devolve intervalo aberto e não marca inválido', () => {
    expect(resolveRange({ preset: 'any' }, MEIO_DIA)).toEqual({ from: null, to: null, invalid: false });
  });

  it('today cobre o dia inteiro do relógio do aparelho', () => {
    const r = resolveRange({ preset: 'today' }, MEIO_DIA);
    expect(r.from!.getTime()).toBe(MEIA_NOITE_HOJE.getTime());
    expect(r.to!.getTime()).toBe(FIM_DE_HOJE.getTime());
    expect(r.invalid).toBe(false);
  });

  const ATALHOS: { preset: JourneyPeriodPreset; dias: number }[] = [
    { preset: 'today', dias: 1 },
    { preset: '3d', dias: 3 },
    { preset: '7d', dias: 7 },
    { preset: '14d', dias: 14 },
    { preset: '30d', dias: 30 },
    { preset: '90d', dias: 90 },
  ];

  ATALHOS.forEach(({ preset, dias }) => {
    it(`${preset} começa em (hoje − ${dias - 1}) 00:00 e vai até o fim de hoje`, () => {
      const r = exige(resolveRange({ preset }, MEIO_DIA));
      const inicioEsperado = new Date(2026, 9, 7 - (dias - 1), 0, 0, 0, 0);
      expect(r.from.getTime()).toBe(inicioEsperado.getTime());
      expect(r.to.getTime()).toBe(FIM_DE_HOJE.getTime());
      expect(diasDoIntervalo(r)).toBe(dias);
    });
  });

  it('7d inclui hoje e os 6 dias anteriores', () => {
    const r = exige(resolveRange({ preset: '7d' }, MEIO_DIA));
    expect(chave(r.from)).toBe('2026-10-01');
    expect(chave(r.to)).toBe('2026-10-07');
  });

  it('30d inclui hoje e os 29 anteriores (não 30 dias anteriores)', () => {
    const r = exige(resolveRange({ preset: '30d' }, MEIO_DIA));
    expect(chave(r.from)).toBe('2026-09-08');
    expect(diasDoIntervalo(r)).toBe(30);
  });
});

describe('resolveRange — bordas do dia, do mês e do ano', () => {
  it('às 23:59:59.999 "hoje" continua sendo hoje (a janela de N×24h erraria)', () => {
    const r = exige(resolveRange({ preset: 'today' }, new Date(2026, 9, 7, 23, 59, 59, 999)));
    expect(chave(r.from)).toBe('2026-10-07');
    expect(chave(r.to)).toBe('2026-10-07');
    expect(r.from.getTime()).toBe(MEIA_NOITE_HOJE.getTime());
  });

  it('às 23:59:59.999 os 7 dias começam 6 dias antes, e não 7', () => {
    const r = exige(resolveRange({ preset: '7d' }, new Date(2026, 9, 7, 23, 59, 59, 999)));
    expect(chave(r.from)).toBe('2026-10-01');
    expect(diasDoIntervalo(r)).toBe(7);
  });

  it('às 00:00:01 o dia já virou (hoje é o dia novo)', () => {
    const r = exige(resolveRange({ preset: '7d' }, new Date(2026, 9, 8, 0, 0, 1, 0)));
    expect(chave(r.from)).toBe('2026-10-02');
    expect(chave(r.to)).toBe('2026-10-08');
  });

  it('na virada do mês (01/11/2026) os 7 dias atravessam outubro', () => {
    const r = exige(resolveRange({ preset: '7d' }, new Date(2026, 10, 1, 9, 0, 0, 0)));
    expect(chave(r.from)).toBe('2026-10-26');
    expect(chave(r.to)).toBe('2026-11-01');
  });

  it('na virada do mês bissexto (01/03/2024) os 3 dias incluem 29/02', () => {
    const r = exige(resolveRange({ preset: '3d' }, new Date(2024, 2, 1, 9, 0, 0, 0)));
    expect(chave(r.from)).toBe('2024-02-28');
    expect(chave(r.to)).toBe('2024-03-01');
  });

  it('na virada do ano (01/01/2026) os 7 dias voltam a dezembro de 2025', () => {
    const r = exige(resolveRange({ preset: '7d' }, new Date(2026, 0, 1, 8, 0, 0, 0)));
    expect(chave(r.from)).toBe('2025-12-26');
    expect(chave(r.to)).toBe('2026-01-01');
  });

  it('na virada do ano os 30 dias voltam a dezembro de 2025', () => {
    const r = exige(resolveRange({ preset: '30d' }, new Date(2026, 0, 1, 8, 0, 0, 0)));
    expect(chave(r.from)).toBe('2025-12-03');
  });

  it('na virada do ano os 90 dias voltam a outubro de 2025', () => {
    const r = exige(resolveRange({ preset: '90d' }, new Date(2026, 0, 1, 8, 0, 0, 0)));
    expect(chave(r.from)).toBe('2025-10-04');
  });
});

describe('resolveRange — De/Até (custom)', () => {
  it('inclui o dia inicial e o dia final inteiros', () => {
    const r = resolveRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-07' }, MEIO_DIA);
    const { from, to } = exige(r);
    expect(from.getTime()).toBe(new Date(2026, 9, 1, 0, 0, 0, 0).getTime());
    expect(to.getTime()).toBe(new Date(2026, 9, 7, 23, 59, 59, 999).getTime());
    expect(diasDoIntervalo(r)).toBe(7);
    expect(r.invalid).toBe(false);
  });

  it('com o mesmo dia (from = to) pega as 24h daquele dia', () => {
    const r = exige(resolveRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-01' }, MEIO_DIA));
    expect(r.from.getTime()).toBe(new Date(2026, 9, 1, 0, 0, 0, 0).getTime());
    expect(r.to.getTime()).toBe(new Date(2026, 9, 1, 23, 59, 59, 999).getTime());
    expect(diasDoIntervalo(r)).toBe(1);
  });

  it('intervalo invertido é normalizado (from ≤ to)', () => {
    const r = exige(resolveRange({ preset: 'custom', from: '2026-10-07', to: '2026-10-01' }, MEIO_DIA));
    expect(chave(r.from)).toBe('2026-10-01');
    expect(chave(r.to)).toBe('2026-10-07');
    expect(r.from.getTime()).toBeLessThanOrEqual(r.to.getTime());
  });

  it('"De" sozinho deixa o fim em aberto (não corta em hoje)', () => {
    const r = resolveRange({ preset: 'custom', from: '2026-10-01' }, MEIO_DIA);
    expect(chave(r.from)).toBe('2026-10-01');
    expect(r.to).toBeNull();
    expect(r.invalid).toBe(false);
  });

  it('"Até" sozinho deixa o início em aberto (varre o histórico inteiro)', () => {
    const r = resolveRange({ preset: 'custom', to: '2026-10-05' }, MEIO_DIA);
    expect(r.from).toBeNull();
    expect(chave(r.to)).toBe('2026-10-05');
    expect(r.to!.getTime()).toBe(new Date(2026, 9, 5, 23, 59, 59, 999).getTime());
    expect(r.invalid).toBe(false);
  });

  it('custom sem nenhuma data é "Qualquer data", sem marcar inválido', () => {
    expect(resolveRange({ preset: 'custom' }, MEIO_DIA)).toEqual({ from: null, to: null, invalid: false });
  });

  it('data fora do calendário é tratada como "Qualquer data" e marca invalid', () => {
    const r = resolveRange({ preset: 'custom', from: '2026-13-01', to: '2026-10-07' }, MEIO_DIA);
    expect(r).toEqual({ from: null, to: null, invalid: true });
  });

  it('31/02 (que o `Date` do JS rolaria para 03/03) é inválida', () => {
    expect(resolveRange({ preset: 'custom', from: '2026-02-31' }, MEIO_DIA)).toEqual({
      from: null,
      to: null,
      invalid: true,
    });
  });

  it('texto qualquer no lugar da data é inválido, sem estourar', () => {
    expect(resolveRange({ preset: 'custom', to: 'ontem' }, MEIO_DIA).invalid).toBe(true);
    expect(resolveRange({ preset: 'custom', from: '07/10/2026' }, MEIO_DIA).invalid).toBe(true);
    expect(resolveRange({ preset: 'custom', from: 20261007 as unknown as string }, MEIO_DIA).invalid).toBe(true);
  });

  it('formato curto (2026-10-7) não passa: o contrato é yyyy-MM-dd', () => {
    expect(resolveRange({ preset: 'custom', from: '2026-10-7' }, MEIO_DIA).invalid).toBe(true);
  });
});

describe('previousRange — período anterior de mesma duração (S048)', () => {
  it('7d devolve os 7 dias imediatamente anteriores, colados e sem sobreposição', () => {
    const atual = exige(resolveRange({ preset: '7d' }, MEIO_DIA));
    const anterior = previousRange(atual)!;
    expect(chave(anterior.from)).toBe('2026-09-24');
    expect(chave(anterior.to)).toBe('2026-09-30');
    expect(diasDoIntervalo(anterior)).toBe(diasDoIntervalo(atual));
    expect(anterior.to.getTime() + 1).toBe(atual.from.getTime());
  });

  it('30d devolve os 30 dias anteriores', () => {
    const atual = exige(resolveRange({ preset: '30d' }, MEIO_DIA));
    const anterior = previousRange(atual)!;
    expect(chave(anterior.from)).toBe('2026-08-09');
    expect(chave(anterior.to)).toBe('2026-09-07');
    expect(diasDoIntervalo(anterior)).toBe(30);
    expect(anterior.to.getTime() + 1).toBe(atual.from.getTime());
  });

  it('today devolve o dia anterior inteiro', () => {
    const atual = exige(resolveRange({ preset: 'today' }, MEIO_DIA));
    const anterior = previousRange(atual)!;
    expect(chave(anterior.from)).toBe('2026-10-06');
    expect(chave(anterior.to)).toBe('2026-10-06');
    expect(anterior.to.getTime()).toBe(new Date(2026, 9, 6, 23, 59, 59, 999).getTime());
  });

  it('custom de 7 dias devolve os 7 dias anteriores', () => {
    const atual = exige(resolveRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-07' }, MEIO_DIA));
    const anterior = previousRange(atual)!;
    expect(chave(anterior.from)).toBe('2026-09-24');
    expect(chave(anterior.to)).toBe('2026-09-30');
    expect(diasDoIntervalo(anterior)).toBe(7);
  });

  it('custom de um dia só devolve o dia anterior', () => {
    const atual = exige(resolveRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-01' }, MEIO_DIA));
    const anterior = previousRange(atual)!;
    expect(chave(anterior.from)).toBe('2026-09-30');
    expect(chave(anterior.to)).toBe('2026-09-30');
  });

  it('atravessa a virada do mês (01/10 → setembro)', () => {
    const atual = exige(resolveRange({ preset: '7d' }, new Date(2026, 9, 1, 10, 0, 0, 0)));
    const anterior = previousRange(atual)!;
    expect(chave(anterior.from)).toBe('2026-09-18');
    expect(chave(anterior.to)).toBe('2026-09-24');
  });

  it('any (sem limites) não tem período anterior', () => {
    expect(previousRange(resolveRange({ preset: 'any' }, MEIO_DIA))).toBeNull();
  });

  it('intervalo pela metade ou ausente não tem período anterior', () => {
    expect(previousRange({ from: new Date(2026, 9, 1), to: null })).toBeNull();
    expect(previousRange({ from: null, to: new Date(2026, 9, 7) })).toBeNull();
    expect(previousRange(null)).toBeNull();
    expect(previousRange(undefined)).toBeNull();
  });

  it('intervalo invertido ainda devolve o anterior do intervalo normalizado', () => {
    const anterior = previousRange({ from: new Date(2026, 9, 7, 23, 59, 59, 999), to: new Date(2026, 9, 1) })!;
    expect(chave(anterior.from)).toBe('2026-09-24');
    expect(chave(anterior.to)).toBe('2026-09-30');
  });
});

describe('toIsoRange — o que vai para as consultas', () => {
  it('converte as bordas locais para UTC (gte/lte em created_at)', () => {
    const r = exige(resolveRange({ preset: '7d' }, MEIO_DIA));
    expect(toIsoRange(r)).toEqual({
      sinceIso: '2026-10-01T03:00:00.000Z',
      untilIso: '2026-10-08T02:59:59.999Z',
    });
  });

  it('any não limita nada', () => {
    expect(toIsoRange(resolveRange({ preset: 'any' }, MEIO_DIA))).toEqual({ sinceIso: null, untilIso: null });
  });

  it('"De" sozinho limita só o início', () => {
    expect(toIsoRange(resolveRange({ preset: 'custom', from: '2026-10-01' }, MEIO_DIA))).toEqual({
      sinceIso: '2026-10-01T03:00:00.000Z',
      untilIso: null,
    });
  });

  it('"Até" sozinho limita só o fim', () => {
    expect(toIsoRange(resolveRange({ preset: 'custom', to: '2026-10-05' }, MEIO_DIA))).toEqual({
      sinceIso: null,
      untilIso: '2026-10-06T02:59:59.999Z',
    });
  });

  it('intervalo invertido não vira consulta vazia', () => {
    const invertido = { from: new Date(2026, 9, 7, 23, 59, 59, 999), to: new Date(2026, 9, 1) };
    expect(toIsoRange(invertido)).toEqual({
      sinceIso: '2026-10-01T03:00:00.000Z',
      untilIso: '2026-10-08T02:59:59.999Z',
    });
  });
});

describe('isWithin — bordas inclusive', () => {
  const hoje = resolveRange({ preset: 'today' }, MEIO_DIA);

  it('aceita as duas bordas exatas', () => {
    expect(isWithin(MEIA_NOITE_HOJE.toISOString(), hoje)).toBe(true);
    expect(isWithin('2026-10-08T02:59:59.999Z', hoje)).toBe(true); // fim do dia local em UTC
  });

  it('recusa 1 ms antes do início e 1 ms depois do fim', () => {
    expect(isWithin(new Date(MEIA_NOITE_HOJE.getTime() - 1).toISOString(), hoje)).toBe(false);
    expect(isWithin(new Date(2026, 9, 8, 3, 0, 0, 0).toISOString(), hoje)).toBe(false);
  });

  it('22:30 no relógio do aparelho ainda é hoje (01:30Z do dia seguinte em UTC)', () => {
    expect(isWithin(new Date(2026, 9, 7, 22, 30).toISOString(), hoje)).toBe(true);
  });

  it('dia puro (yyyy-MM-dd) é lido no fuso do aparelho, não em UTC', () => {
    expect(isWithin('2026-10-07', hoje)).toBe(true);
    expect(isWithin('2026-10-06', hoje)).toBe(false);
    expect(isWithin('2026-10-08', hoje)).toBe(false);
  });

  it('any aceita qualquer instante válido', () => {
    const qualquer = resolveRange({ preset: 'any' }, MEIO_DIA);
    expect(isWithin('2019-01-01T00:00:00.000Z', qualquer)).toBe(true);
    expect(isWithin(new Date(2026, 9, 7), qualquer)).toBe(true);
  });

  it('instante ausente ou ilegível nunca entra', () => {
    expect(isWithin('nada', hoje)).toBe(false);
    expect(isWithin('', hoje)).toBe(false);
    expect(isWithin(null, hoje)).toBe(false);
    expect(isWithin(undefined, hoje)).toBe(false);
    expect(isWithin('2026-02-31', hoje)).toBe(false);
  });

  it('intervalo pela metade funciona como limite único', () => {
    const soDe = resolveRange({ preset: 'custom', from: '2026-10-01' }, MEIO_DIA);
    expect(isWithin('2026-09-30T12:00:00.000Z', soDe)).toBe(false);
    expect(isWithin('2027-01-01T12:00:00.000Z', soDe)).toBe(true);
    const soAte = resolveRange({ preset: 'custom', to: '2026-10-05' }, MEIO_DIA);
    expect(isWithin('2020-01-01T12:00:00.000Z', soAte)).toBe(true);
    expect(isWithin('2026-10-06T12:00:00.000Z', soAte)).toBe(false);
  });
});

describe('describePeriod — o rótulo que a tela mostra', () => {
  it('atalhos', () => {
    expect(describePeriod({ preset: 'any' }, MEIO_DIA)).toBe('Qualquer data');
    expect(describePeriod({ preset: 'today' }, MEIO_DIA)).toBe('Hoje');
    expect(describePeriod({ preset: '3d' }, MEIO_DIA)).toBe('Últimos 3 dias');
    expect(describePeriod({ preset: '7d' }, MEIO_DIA)).toBe('Últimos 7 dias');
    expect(describePeriod({ preset: '14d' }, MEIO_DIA)).toBe('Últimos 14 dias');
    expect(describePeriod({ preset: '30d' }, MEIO_DIA)).toBe('Últimos 30 dias');
    expect(describePeriod({ preset: '90d' }, MEIO_DIA)).toBe('Últimos 90 dias');
  });

  it('De/Até no mesmo ano omite o ano do início', () => {
    expect(describePeriod({ preset: 'custom', from: '2026-10-01', to: '2026-10-07' }, MEIO_DIA)).toBe(
      '01/10 a 07/10/2026',
    );
  });

  it('De/Até em anos diferentes mostra os dois anos', () => {
    expect(describePeriod({ preset: 'custom', from: '2025-12-28', to: '2026-01-02' }, MEIO_DIA)).toBe(
      '28/12/2025 a 02/01/2026',
    );
  });

  it('mesmo dia mostra uma data só', () => {
    expect(describePeriod({ preset: 'custom', from: '2026-10-01', to: '2026-10-01' }, MEIO_DIA)).toBe('01/10/2026');
  });

  it('intervalo invertido é descrito na ordem em que é aplicado', () => {
    expect(describePeriod({ preset: 'custom', from: '2026-10-07', to: '2026-10-01' }, MEIO_DIA)).toBe(
      '01/10 a 07/10/2026',
    );
  });

  it('limite único e inválido', () => {
    expect(describePeriod({ preset: 'custom', from: '2026-10-01' }, MEIO_DIA)).toBe('A partir de 01/10/2026');
    expect(describePeriod({ preset: 'custom', to: '2026-10-05' }, MEIO_DIA)).toBe('Até 05/10/2026');
    expect(describePeriod({ preset: 'custom', from: '2026-13-01' }, MEIO_DIA)).toBe('Qualquer data');
    expect(describePeriod({ preset: 'custom' }, MEIO_DIA)).toBe('Qualquer data');
  });

  it('preset desconhecido cai em "Qualquer data" (não inventa janela)', () => {
    expect(describePeriod({ preset: 'ontem' as JourneyPeriodPreset }, MEIO_DIA)).toBe('Qualquer data');
    expect(resolveRange({ preset: 'ontem' as JourneyPeriodPreset }, MEIO_DIA)).toEqual({
      from: null,
      to: null,
      invalid: false,
    });
  });

  it('a descrição de custom nomeia os dias que o intervalo realmente cobre', () => {
    const periodo: JourneyPeriod = { preset: 'custom', from: '2026-10-01', to: '2026-10-07' };
    const r = exige(resolveRange(periodo, MEIO_DIA));
    expect(chave(r.from)).toBe('2026-10-01');
    expect(chave(r.to)).toBe('2026-10-07');
    expect(describePeriod(periodo, MEIO_DIA)).toBe('01/10 a 07/10/2026');
  });
});

describe('data inválida nunca estoura no filtro', () => {
  const invalida = new Date('nada');

  it('resolveRange com "hoje" ilegível cai em intervalo aberto', () => {
    expect(resolveRange({ preset: 'today' }, invalida)).toEqual({ from: null, to: null, invalid: false });
  });

  it('toIsoRange descarta a borda inválida em vez de estourar no toISOString', () => {
    expect(toIsoRange({ from: invalida, to: new Date(2026, 9, 7) })).toEqual({
      sinceIso: null,
      untilIso: new Date(2026, 9, 7).toISOString(),
    });
  });

  it('previousRange ignora borda inválida', () => {
    expect(previousRange({ from: invalida, to: new Date(2026, 9, 7) })).toBeNull();
    expect(previousRange({ from: new Date(2026, 9, 1), to: invalida })).toBeNull();
  });

  it('isWithin com Date inválida não entra', () => {
    expect(isWithin(invalida, resolveRange({ preset: 'today' }, MEIO_DIA))).toBe(false);
  });
});

describe('fuso do aparelho (UTC-3 vs UTC)', () => {
  afterEach(() => {
    process.env.TZ = TZ_DO_PRODUTO;
  });

  it('em America/Sao_Paulo (UTC-3) o dia local começa 3 h depois em UTC', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(new Date(2026, 9, 7).getTimezoneOffset()).toBe(180); // garante que o fuso pegou
    const r = exige(resolveRange({ preset: 'today' }, new Date(2026, 9, 7, 12, 0, 0, 0)));
    expect(r.from.toISOString()).toBe('2026-10-07T03:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-08T02:59:59.999Z');
    // 22:30 de 07/10 em UTC-3 = 01:30Z de 08/10 — é o teste que uma janela em UTC reprova.
    expect(isWithin('2026-10-08T01:30:00.000Z', r)).toBe(true);
  });

  it('em UTC o dia local é o próprio dia UTC', () => {
    process.env.TZ = 'UTC';
    expect(new Date(2026, 9, 7).getTimezoneOffset()).toBe(0); // garante que o fuso pegou
    const r = exige(resolveRange({ preset: 'today' }, new Date(2026, 9, 7, 12, 0, 0, 0)));
    expect(r.from.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-07T23:59:59.999Z');
    expect(isWithin('2026-10-08T01:30:00.000Z', r)).toBe(false);
    expect(toIsoRange(r)).toEqual({ sinceIso: '2026-10-07T00:00:00.000Z', untilIso: '2026-10-07T23:59:59.999Z' });
  });

  it('o mesmo instante cai em dias diferentes conforme o fuso do aparelho', () => {
    // UM instante fixo, criado ANTES de trocar o `TZ`: os dois lados comparam o mesmo instante.
    // Se cada lado montasse o seu `new Date(2026, 9, 8, 1, 30)` local, seriam instantes diferentes
    // e o teste não provaria nada sobre o fuso do aparelho (foi o defeito da entrega anterior).
    const instante = new Date('2026-10-08T01:30:00.000Z'); // = 07/10 22:30 em UTC-3

    process.env.TZ = 'America/Sao_Paulo';
    expect(new Date(2026, 9, 7).getTimezoneOffset()).toBe(180); // garante que o fuso pegou
    const emSaoPaulo = exige(resolveRange({ preset: 'today' }, instante));
    // 22:30 do dia 07/10 local: "hoje" é 07/10 (o dia UTC já seria 08/10).
    expect(chave(emSaoPaulo.from)).toBe('2026-10-07');
    expect(chave(emSaoPaulo.to)).toBe('2026-10-07');
    expect(emSaoPaulo.from.toISOString()).toBe('2026-10-07T03:00:00.000Z');

    process.env.TZ = 'UTC';
    expect(new Date(2026, 9, 7).getTimezoneOffset()).toBe(0); // garante que o fuso pegou
    const emUtc = exige(resolveRange({ preset: 'today' }, instante));
    // O MESMO instante já é 08/10 em UTC: "hoje" passa a ser 08/10.
    expect(chave(emUtc.from)).toBe('2026-10-08');
    expect(chave(emUtc.to)).toBe('2026-10-08');
    expect(emUtc.from.toISOString()).toBe('2026-10-08T00:00:00.000Z');

    // O dia local de cada fuso tem de ser diferente: é isso que uma conta em UTC fixo reprova.
    expect(chave(emSaoPaulo.from)).not.toBe(chave(emUtc.from));
  });
});
