import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

/**
 * X160 · T13-058…T13-066 — card "Principais Métricas" da tela 13 (campanha pausada).
 *
 * Prova o que o aceite da etapa pede:
 *  1. tempo médio de resposta em segundos vira "2m 41s" (161 s);
 *  2. sem média histórica (CAP-083 sem base mínima) NÃO existe "vs. média";
 *  3. taxa de falha é sobre PROCESSADOS: 42 falhas em 1.722 processados → "2%";
 *  4. com base mínima e média da métrica, a linha ganha "↑/↓ N% vs. média".
 */
import { TalkXKeyMetricsCard } from '../tracking/TalkXKeyMetricsCard';
import { formatReplySeconds, ratePct, rateValue, benchmarkDelta } from '../tracking/talkxKeyMetrics';
import type { TalkXKeyMetricsBenchmarks, TalkXKeyMetricsData } from '../tracking/talkxKeyMetrics';

const metricas: TalkXKeyMetricsData = {
  sent: 100,
  delivered: 90,
  replied: 17,
  failed: 42,
  processed: 1722,
  avgReplySeconds: 161,
};

const semBase: TalkXKeyMetricsBenchmarks = {
  hasBaseline: false,
  avgDeliveryRatePct: null,
  avgReplyRatePct: null,
};

const comBase: TalkXKeyMetricsBenchmarks = {
  hasBaseline: true,
  avgDeliveryRatePct: 85,
  avgReplyRatePct: 17,
};

describe('Principais Métricas — TalkXKeyMetricsCard (X160)', () => {
  it('tempo médio de resposta em segundos vira "2m 41s"', () => {
    render(<TalkXKeyMetricsCard metrics={metricas} benchmarks={semBase} />);

    expect(screen.getByText('Tempo Médio de Resposta')).toBeTruthy();
    expect(screen.getByText('2m 41s')).toBeTruthy();
  });

  it('sem base mínima (CAP-083) nenhuma linha mostra "vs. média"', () => {
    render(<TalkXKeyMetricsCard metrics={metricas} benchmarks={semBase} />);

    expect(screen.queryByText(/vs\. média/)).toBeNull();
    // O valor continua na tela: só o comparativo é omitido.
    expect(screen.getByText('90%')).toBeTruthy();
  });

  it('benchmark nulo (mesmo com hasBaseline) também não traz comparativo', () => {
    render(
      <TalkXKeyMetricsCard
        metrics={metricas}
        benchmarks={{ hasBaseline: true, avgDeliveryRatePct: null, avgReplyRatePct: null }}
      />,
    );

    expect(screen.queryByText(/vs\. média/)).toBeNull();
  });

  it('taxa de falha é sobre processados: 42 de 1.722 → "2%"', () => {
    render(<TalkXKeyMetricsCard metrics={metricas} benchmarks={semBase} />);

    expect(screen.getByText('Taxa de Falha')).toBeTruthy();
    expect(screen.getByText('2%')).toBeTruthy();
  });

  it('com base mínima, a entrega ganha "↑ N% vs. média" e a falha fica sem média (sem fonte no RPC)', () => {
    render(<TalkXKeyMetricsCard metrics={metricas} benchmarks={comBase} />);

    // 90% contra a média de 85% → +5,9% → 6%.
    expect(screen.getByText('↑ 6% vs. média')).toBeTruthy();
    // Só a entrega tem média; resposta empatada (0%) e falha sem média no RPC.
    expect(screen.getAllByText(/vs\. média/)).toHaveLength(2);
  });

  it('sem enviadas as taxas ficam "—" (não um 0% inventado)', () => {
    render(
      <TalkXKeyMetricsCard
        metrics={{ sent: 0, delivered: 0, replied: 0, failed: 0, processed: 0, avgReplySeconds: null }}
        benchmarks={semBase}
      />,
    );

    // As três taxas e o tempo médio ficam "—"; nenhum "0%" inventado.
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('helpers puros: duração, taxa e variação contra a média', () => {
    expect(formatReplySeconds(161)).toBe('2m 41s');
    expect(formatReplySeconds(0)).toBe('0s');
    expect(formatReplySeconds(45)).toBe('45s');
    expect(formatReplySeconds(3660)).toBe('1h 1m');
    expect(formatReplySeconds(null)).toBe('—');

    expect(ratePct(42, 1722)).toBe('2%');
    expect(rateValue(42, 1722)).toBe(2);
    expect(ratePct(0, 0)).toBe('—');
    expect(rateValue(0, 0)).toBeNull();

    expect(benchmarkDelta(86, 85, { hasBaseline: true, goodWhen: 'up' })).toEqual({
      text: '1% vs. média', arrow: '↑', tone: 'good',
    });
    expect(benchmarkDelta(80, 85, { hasBaseline: true, goodWhen: 'up' })?.arrow).toBe('↓');
    expect(benchmarkDelta(80, 85, { hasBaseline: true, goodWhen: 'up' })?.tone).toBe('bad');
    expect(benchmarkDelta(86, 85, { hasBaseline: false, goodWhen: 'up' })).toBeNull();
    expect(benchmarkDelta(86, null, { hasBaseline: true, goodWhen: 'up' })).toBeNull();
  });
});
