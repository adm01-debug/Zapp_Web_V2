/**
 * X153 (tela 12): anel de progresso do card "Progresso da Campanha".
 *
 * O anel anterior (DonutChart local) tinha cinco fatias em que "Enviadas" valia
 * `sent − delivered` e a legenda não mostrava percentual nem respostas
 * (inventário T12-028…T12-033). Aqui:
 *  - o centro é "N% · X de Y", com N = enviados ÷ total (T12-028);
 *  - a legenda repete as cinco contagens do mock — Enviados (total enviado),
 *    Entregues, Respondidos, Falhas e Pendentes — e o percentual de cada uma
 *    é sobre os ENVIADOS, a base do anel (T12-029…T12-033).
 * Componente de apresentação: só desenha o que recebe (reutilizado na tela 13).
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { fmtInt, pct } from '../kit/format';

export interface TalkXProgressRingProps {
  sent: number;
  delivered: number;
  replied: number;
  failed: number;
  total: number;
  className?: string;
}

export function TalkXProgressRing({ sent, delivered, replied, failed, total, className }: TalkXProgressRingProps) {
  const R = 72, CX = 88, CY = 88, STROKE = 18;
  const circ = 2 * Math.PI * R;
  const slice = (value: number) => (total > 0 ? (Math.max(0, value) / total) * circ : 0);
  const progress = pct(sent, total);
  const pending = Math.max(0, total - sent);
  const waitingDelivery = Math.max(0, sent - delivered);
  const segments: { value: number; color: string }[] = [
    { value: delivered, color: 'hsl(var(--dash-green))' },
    { value: waitingDelivery, color: 'hsl(var(--primary))' },
    { value: failed, color: 'hsl(var(--dash-red))' },
    { value: pending, color: 'hsl(var(--muted))' },
  ];
  const legend = [
    { label: 'Enviados', value: fmtInt(sent), share: null as string | null, dot: 'bg-primary' },
    { label: 'Entregues', value: fmtInt(delivered), share: `(${pct(delivered, sent)}%)`, dot: 'bg-dash-green' },
    { label: 'Respondidos', value: fmtInt(replied), share: `(${pct(replied, sent)}%)`, dot: 'bg-dash-violet' },
    { label: 'Falhas', value: fmtInt(failed), share: `(${pct(failed, sent)}%)`, dot: 'bg-dash-red' },
    { label: 'Pendentes', value: fmtInt(pending), share: null as string | null, dot: 'bg-muted-foreground/40' },
  ];
  let offset = 0;

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <svg
        width={176}
        height={176}
        viewBox="0 0 176 176"
        role="img"
        aria-label={`${progress}% concluído · ${fmtInt(sent)} de ${fmtInt(total)} enviados`}
      >
        {total === 0 ? (
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={STROKE} />
        ) : (
          segments.map(({ value, color }, index) => {
            const dash = slice(value);
            const element = (
              <circle
                key={index}
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={color}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
                style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px` }}
              />
            );
            offset += dash;
            return element;
          })
        )}
        <text x={CX} y={CY - 2} textAnchor="middle" className="fill-foreground" fontSize={24} fontWeight={700}>
          {`${progress}%`}
        </text>
        <text x={CX} y={CY + 18} textAnchor="middle" className="fill-foreground-secondary" fontSize={11}>
          {`${fmtInt(sent)} de ${fmtInt(total)}`}
        </text>
      </svg>
      <div className="grid w-full grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {legend.map(({ label, value, share, dot }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dot)} />
            <span className="text-foreground-secondary">{label}</span>
            <span className="ml-auto font-semibold text-foreground tabular-nums">{value}</span>
            {share && <span className="text-2xs text-foreground-secondary tabular-nums">{share}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
