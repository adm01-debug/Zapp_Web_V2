import { describe, it, expect } from 'vitest';
import {
  buildSentSummaryPoints,
} from '../tracking/talkxSentSummary';
import {
  benchmarksFromJson,
  keyMetricsFromCampaign,
} from '../tracking/talkxKeyMetrics';

/**
 * Painéis da tela 13 ("Campanha Pausada", X160): montagem dos pontos do
 * "Resumo de enviados" e das métricas/benchmarks dos "Principais métricas"
 * a partir do painel (`talkx_campaign_report`) + respostas + `talkx_benchmarks()`.
 *
 * Os números têm de sair do código de produção: série fora da janela cai,
 * resposta sem envio na hora entra (união), contadores nunca vêm de amostra.
 */

const HORA = (iso: string) => iso;

describe('buildSentSummaryPoints — série do painel + respostas por hora', () => {
  const serie = [
    { hour: HORA('2026-09-06T12:00:00.000Z'), sent: 10, delivered: 8 },
    { hour: HORA('2026-09-06T13:00:00.000Z'), sent: 7, delivered: 3 },
  ];
  // "agora" = 13:40Z: janela 6h cobre os dois baldes.
  const agora = new Date('2026-09-06T13:40:00.000Z').getTime();

  it('soma os canais do painel e as respostas na hora certa', () => {
    const pontos = buildSentSummaryPoints(serie, ['2026-09-06T13:15:00.000Z'], 360, agora);
    expect(pontos).toEqual([
      { bucket: '2026-09-06T12:00:00.000Z', sent: 10, delivered: 8, replied: 0 },
      { bucket: '2026-09-06T13:00:00.000Z', sent: 7, delivered: 3, replied: 1 },
    ]);
  });

  it('corta baldes fora da janela escolhida', () => {
    // janela 30 min a partir de 13:40: o balde das 12h (termina às 13h) cai.
    const pontos = buildSentSummaryPoints(serie, [], 30, agora);
    expect(pontos).toEqual([
      { bucket: '2026-09-06T13:00:00.000Z', sent: 7, delivered: 3, replied: 0 },
    ]);
  });

  it('inclui hora que só tem resposta (união com a série do painel)', () => {
    const pontos = buildSentSummaryPoints(
      [serie[0]],
      ['2026-09-06T13:15:00.000Z'],
      360,
      agora,
    );
    expect(pontos).toEqual([
      { bucket: '2026-09-06T12:00:00.000Z', sent: 10, delivered: 8, replied: 0 },
      { bucket: '2026-09-06T13:00:00.000Z', sent: 0, delivered: 0, replied: 1 },
    ]);
  });

  it('ignora timestamps inválidos e trata contagem ausente como zero', () => {
    const pontos = buildSentSummaryPoints(
      [{ hour: 'nao-e-data', sent: 5, delivered: 2 }, ...serie],
      ['lixo', null, undefined, '2026-09-06T12:20:00.000Z'],
      360,
      agora,
    );
    expect(pontos).toEqual([
      { bucket: '2026-09-06T12:00:00.000Z', sent: 10, delivered: 8, replied: 1 },
      { bucket: '2026-09-06T13:00:00.000Z', sent: 7, delivered: 3, replied: 0 },
    ]);
  });

  it('painel vazio e sem respostas: série vazia (o card mostra o vazio)', () => {
    expect(buildSentSummaryPoints([], [], 360, agora)).toEqual([]);
    expect(buildSentSummaryPoints(null, null, 360, agora)).toEqual([]);
  });
});

describe('benchmarksFromJson — talkx_benchmarks() vira comparativo', () => {
  it('mapeia o global com base mínima (ao menos 1 campanha na janela)', () => {
    expect(
      benchmarksFromJson({
        window_days: 90,
        global: { campaign_count: 4, avg_delivery_rate_pct: 82.5, avg_reply_rate_pct: 11.2 },
      }),
    ).toEqual({
      hasBaseline: true,
      avgDeliveryRatePct: 82.5,
      avgReplyRatePct: 11.2,
    });
  });

  it('sem campanhas na janela: sem base, sem comparativo', () => {
    const base = benchmarksFromJson({
      global: { campaign_count: 0, avg_delivery_rate_pct: null, avg_reply_rate_pct: null },
    });
    expect(base.hasBaseline).toBe(false);
    expect(base.avgDeliveryRatePct).toBeNull();
  });

  it('payload inválido: sem base, nunca quebra a tela', () => {
    for (const ruim of [null, undefined, 'texto', 42, {}, { global: null }, { global: [] }]) {
      const base = benchmarksFromJson(ruim);
      expect(base.hasBaseline).toBe(false);
    }
  });
});

describe('keyMetricsFromCampaign — métricas vêm da linha, não de amostra', () => {
  it('processados = enviadas + falhas + a confirmar', () => {
    expect(
      keyMetricsFromCampaign(
        { sent_count: 1640, delivered_count: 1520, replied_count: 96, failed_count: 40, outcome_unknown_count: 12 },
        161,
      ),
    ).toEqual({
      sent: 1640,
      delivered: 1520,
      replied: 96,
      failed: 40,
      processed: 1692,
      avgReplySeconds: 161,
    });
  });

  it('contadores ausentes viram zero, sem média de resposta vira null', () => {
    expect(
      keyMetricsFromCampaign({ sent_count: 10, delivered_count: 8, failed_count: 1 }, null),
    ).toEqual({
      sent: 10,
      delivered: 8,
      replied: 0,
      failed: 1,
      processed: 11,
      avgReplySeconds: null,
    });
  });
});
