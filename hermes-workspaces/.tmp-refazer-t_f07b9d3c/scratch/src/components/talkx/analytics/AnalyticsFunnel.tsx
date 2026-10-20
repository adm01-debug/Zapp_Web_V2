import React from 'react';
import { Target } from 'lucide-react';
import { IconTile } from '../kit/primitives';
import { fmtInt, fmtPct } from '../kit/format';

/**
 * X186 — Funil da campanha em SVG proporcional (tela 07 do Talk X).
 *
 * Cinco degraus (Enviadas, Entregues, Lidas, Respostas, Conversões) com largura
 * proporcional ao valor MEDIDO — antes as larguras eram fixas (100/80/55/35 %) e não
 * diziam nada sobre a perda real entre os degraus. Degrau com fonte nula aparece vazio
 * com "sem dados ainda", nunca com 0 (A9).
 */

export interface FunnelStep {
  key: string;
  label: string;
  /** Valor medido. `null` = a fonte ainda não recebeu nenhum dado. */
  value: number | null;
  /** Token de cor do sistema (sem cor nova). */
  token: string;
}

const VIEW_W = 320;
/** Faixa útil da barra; a sobra à direita recebe o percentual. */
const TRACK_W = VIEW_W - 46;
const STEP_H = 34;
const GAP = 8;

interface Props {
  steps: FunnelStep[];
}

/** Título fixo: o funil desta tela é sempre a passagem entrega → leitura → resposta → conversão. */
const FUNNEL_TITLE = 'Entrega → Leitura → Resposta → Conversão';

export function AnalyticsFunnel({ steps }: Props) {
  // Base do percentual = Enviadas (o primeiro degrau), como na régua do mock.
  const base = steps[0]?.value ?? null;
  const height = Math.max(0, steps.length * STEP_H + (steps.length - 1) * GAP);
  const ratio = (value: number | null) => (base !== null && base > 0 && value !== null ? Math.min(value / base, 1) : null);
  const description = steps
    .map((step) => {
      if (step.value === null) return `${step.label}: sem dados ainda`;
      return base !== null && base > 0
        ? `${step.label}: ${fmtInt(step.value)} (${fmtPct(step.value, base)})`
        : `${step.label}: ${fmtInt(step.value)}`;
    })
    .join('; ');

  return (
    <section className="rounded-2xl bg-card border border-border/70 p-4">
      <div className="flex items-center gap-2 mb-4">
        <IconTile icon={Target} color="violet" size={36} />
        <div>
          <p className="text-[15px] font-bold text-foreground">Funil da campanha</p>
          <p className="text-xs text-foreground-secondary">{FUNNEL_TITLE}</p>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Funil da campanha — ${description}`}
      >
        {steps.map((step, index) => {
          const y = index * (STEP_H + GAP);
          const hasValue = step.value !== null;
          // Sem base (Enviadas nula ou zerada) não existe proporção a mostrar — mas o valor
          // medido continua aparecendo: "sem dados" é só para fonte nula, nunca para zero.
          const share = ratio(step.value);
          const stroke = `hsl(var(--${step.token}))`;
          return (
            <g key={step.key}>
              <rect
                x={0}
                y={y}
                width={TRACK_W}
                height={STEP_H}
                rx={8}
                fill={hasValue ? `hsl(var(--${step.token}) / 0.18)` : 'hsl(var(--muted) / 0.25)'}
                stroke={hasValue ? 'none' : 'hsl(var(--border))'}
                strokeDasharray={hasValue ? undefined : '4 3'}
              />
              {share !== null && (
                <rect
                  data-testid={`funnel-bar-${step.key}`}
                  x={0}
                  y={y}
                  width={Number((share * TRACK_W).toFixed(2))}
                  height={STEP_H}
                  rx={8}
                  fill={`hsl(var(--${step.token}) / 0.28)`}
                  stroke={stroke}
                  strokeWidth={1.5}
                />
              )}
              <text x={12} y={y + STEP_H / 2 + 4} fontSize={12} fontWeight={700} fill="hsl(var(--foreground))">
                {step.label}
              </text>
              {hasValue ? (
                <>
                  <text x={TRACK_W - 12} y={y + STEP_H / 2 + 4} fontSize={13} fontWeight={700} textAnchor="end" fill="hsl(var(--foreground))">
                    {fmtInt(step.value)}
                  </text>
                  <text x={TRACK_W + 6} y={y + STEP_H / 2 + 4} fontSize={11} textAnchor="start" fill="hsl(var(--foreground-secondary))">
                    {share === null ? '—' : fmtPct(step.value as number, base as number)}
                  </text>
                </>
              ) : (
                <text x={TRACK_W - 12} y={y + STEP_H / 2 + 4} fontSize={12} textAnchor="end" fill="hsl(var(--muted-foreground))">
                  sem dados ainda
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}
