// CV-139–140: AnalyticsDashboard — read-only analytics dashboard for RADAR copilot

import React from 'react';
import type { CopilotMetrics } from '../../hooks/copilot/useCopilotAnalytics';
import type { ConversionStats } from '../../hooks/copilot/useConversionTracker';
import type { BenchmarkResult } from '../../hooks/copilot/usePerformanceBenchmark';

export interface AnalyticsDashboardProps {
  metrics: CopilotMetrics;
  stats: ConversionStats;
  benchmarks: BenchmarkResult[];
}

function ProgressBar({
  value,
  max = 1,
  label,
}: {
  value: number;
  max?: number;
  label: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          marginBottom: 2,
        }}
      >
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div
        style={{
          height: 8,
          background: '#e5e7eb',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: pct >= 60 ? '#22c55e' : pct >= 30 ? '#f59e0b' : '#ef4444',
            borderRadius: 4,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit = '',
  highlight = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 8,
        border: `1px solid ${highlight ? '#6366f1' : '#e5e7eb'}`,
        background: highlight ? '#eef2ff' : '#fafafa',
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>
        {typeof value === 'number' ? value.toFixed(1) : value}
        {unit && (
          <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280' }}>
            {' '}
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export function AnalyticsDashboard({
  metrics,
  stats,
  benchmarks,
}: AnalyticsDashboardProps) {
  const liftColor =
    stats.liftPercentage > 0
      ? '#22c55e'
      : stats.liftPercentage < 0
        ? '#ef4444'
        : '#6b7280';

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: 16,
        maxWidth: 640,
        color: '#111827',
      }}
    >
      {/* Header */}
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
        RADAR — Painel de Analytics
      </h2>

      {/* Acceptance Rate */}
      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Taxa de Aceitação de Sugestões
        </h3>
        <ProgressBar
          value={metrics.acceptanceRate}
          max={1}
          label={`${metrics.acceptedSuggestions} aceitas / ${metrics.totalSuggestions} mostradas`}
        />
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 8,
          }}
        >
          <MetricCard
            label="Aceitas"
            value={metrics.acceptedSuggestions}
          />
          <MetricCard
            label="Editadas"
            value={metrics.editedSuggestions}
          />
          <MetricCard
            label="Rejeitadas"
            value={metrics.rejectedSuggestions}
          />
          <MetricCard
            label="Dist. Edição Média"
            value={metrics.avgEditDistance.toFixed(2)}
            unit=""
          />
        </div>
      </section>

      {/* Conversion Lift */}
      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Impacto nas Conversões (ROI do Copiloto)
        </h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <MetricCard
            label="Taxa c/ Copiloto"
            value={`${(stats.conversionRateWithCopilot * 100).toFixed(1)}%`}
            highlight
          />
          <MetricCard
            label="Taxa s/ Copiloto"
            value={`${(stats.conversionRateWithout * 100).toFixed(1)}%`}
          />
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              border: `1px solid ${liftColor}`,
              background: '#fafafa',
              minWidth: 120,
            }}
          >
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
              Lift
            </div>
            <div
              style={{ fontSize: 22, fontWeight: 700, color: liftColor }}
            >
              {stats.liftPercentage >= 0 ? '+' : ''}
              {stats.liftPercentage.toFixed(1)}%
            </div>
          </div>
          <MetricCard
            label="Tempo Médio c/ Copiloto"
            value={stats.avgTimeToCloseWithCopilot.toFixed(0)}
            unit="min"
          />
          <MetricCard
            label="Tempo Médio s/ Copiloto"
            value={stats.avgTimeToCloseWithout.toFixed(0)}
            unit="min"
          />
        </div>
      </section>

      {/* Top Features */}
      {metrics.topUsedFeatures.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Recursos Mais Utilizados
          </h3>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            {metrics.topUsedFeatures.slice(0, 5).map(({ feature, count }) => (
              <li
                key={feature}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 0',
                  borderBottom: '1px solid #f3f4f6',
                  fontSize: 13,
                }}
              >
                <span>{feature}</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: '#6366f1',
                    marginLeft: 8,
                  }}
                >
                  {count}×
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Benchmark Bars */}
      {benchmarks.length > 0 && (
        <section>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Comparativo com a Equipe
          </h3>
          {benchmarks.map((b) => (
            <div key={b.metric} style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  marginBottom: 2,
                }}
              >
                <span>{b.metric}</span>
                <span
                  style={{
                    color:
                      b.trend === 'improving'
                        ? '#22c55e'
                        : b.trend === 'declining'
                          ? '#ef4444'
                          : '#6b7280',
                    fontWeight: 600,
                  }}
                >
                  {b.trend === 'improving'
                    ? '↑'
                    : b.trend === 'declining'
                      ? '↓'
                      : '→'}{' '}
                  P{b.percentile}
                </span>
              </div>
              {/* Vendor value bar */}
              <ProgressBar
                value={b.percentile}
                max={100}
                label={`Você: ${b.vendorValue.toFixed(2)} · Média: ${b.teamAverage.toFixed(2)}`}
              />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
