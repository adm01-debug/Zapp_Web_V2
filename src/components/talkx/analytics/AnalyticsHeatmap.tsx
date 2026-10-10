import { useMemo } from 'react';
import { Calendar, Info } from 'lucide-react';
import { IconTile, fmtInt } from '../talkxShared';

/**
 * X187 — Mapa de calor por ENGAJAMENTO.
 *
 * Antes o mapa mostrava volume de envio ("Menor/Maior" sem dizer de quê) e a
 * célula sem base nenhuma recebia cor. Aqui a intensidade é a TAXA DE RESPOSTA
 * da célula (respostas ÷ envios): volume não é resultado. Célula com menos de
 * `HEATMAP_MIN_BASE` envios não tem base para taxa e fica em tom neutro — nunca
 * colorida por um punhado de envios.
 *
 * As linhas vão de segunda a domingo e, como a grade visual é só cor, o mesmo
 * dado sai numa tabela equivalente para leitor de tela.
 */

export interface HeatmapCell {
  /** `Date#getDay`: 0 = domingo … 6 = sábado. */
  day: number;
  hour: number;
  sent: number;
  replied: number;
}

/** Envios mínimos para a célula concorrer a cor de intensidade. */
const HEATMAP_MIN_BASE = 5;
/** Ordem das linhas: segunda a domingo. */
const HEATMAP_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HEATMAP_DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Intensidade normalizada (0–1) ou `null` quando a célula não tem base mínima. */
function rateOf(cell: HeatmapCell, minBase: number): number | null {
  return cell.sent >= minBase ? cell.replied / cell.sent : null;
}

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}h`;

export function AnalyticsHeatmap({ cells, minBase = HEATMAP_MIN_BASE, hasError = false, isLoading = false }: { cells: HeatmapCell[]; minBase?: number; hasError?: boolean; isLoading?: boolean }) {
  const { index, maxRate, comDados } = useMemo(() => {
    const index = new Map<string, HeatmapCell>();
    let maxRate = 0;
    for (const cell of cells) {
      index.set(`${cell.day}-${cell.hour}`, cell);
      const rate = rateOf(cell, minBase);
      if (rate !== null && rate > maxRate) maxRate = rate;
    }
    const comDados = HEATMAP_DAY_ORDER.flatMap((day) =>
      HOURS.map((hour) => index.get(`${day}-${hour}`))
        .filter((cell): cell is HeatmapCell => !!cell && cell.sent > 0));
    return { index, maxRate, comDados };
  }, [cells, minBase]);

  return (
    <section className="rounded-2xl bg-card border border-border/70 p-4" aria-labelledby="talkx-heatmap-titulo">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <IconTile icon={Calendar} color="green" size={36} />
          <div>
            <p id="talkx-heatmap-titulo" className="text-[15px] font-bold text-foreground">Engajamento por dia e horário</p>
            <p className="text-xs text-foreground-secondary">Intensidade pela taxa de resposta (respostas ÷ envios)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-2xs text-muted-foreground">
            <span className="w-8 h-2.5 rounded-sm bg-primary/20 inline-block" />Baixo
            <span className="w-8 h-2.5 rounded-sm bg-primary/50 inline-block" />Médio
            <span className="w-8 h-2.5 rounded-sm bg-primary/80 inline-block" />Alto
            <span className="w-3 h-2.5 rounded-sm inline-block" style={{ background: 'hsl(var(--muted) / 0.3)' }} />Menos de {minBase} envios (sem base)
          </div>
          <span
            role="img"
            title={`Cada célula é a taxa de resposta daquele dia e horário. Célula com menos de ${minBase} envios não tem base para taxa e fica neutra.`}
            aria-label={`Como o mapa é calculado: taxa de resposta por célula; menos de ${minBase} envios fica neutro`}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="flex ml-9 mb-1">{HOURS.filter((h) => h % 3 === 0).map((h) => <div key={h} className="flex-1 text-[9px] text-muted-foreground text-center">{hourLabel(h)}</div>)}</div>
          {HEATMAP_DAY_ORDER.map((day) => (
            <div key={day} data-day={HEATMAP_DAY_LABELS[day].toLowerCase()} className="flex items-center mb-0.5 gap-1">
              <span className="text-3xs text-foreground-secondary w-8 text-right shrink-0">{HEATMAP_DAY_LABELS[day]}</span>
              <div className="flex-1 flex gap-0.5">
                {HOURS.map((hour) => {
                  const cell = index.get(`${day}-${hour}`) ?? { day, hour, sent: 0, replied: 0 };
                  const rate = rateOf(cell, minBase);
                  const intensity = rate === null ? 0 : rate / (maxRate || 1);
                  return (
                    <span
                      key={hour}
                      title={`${HEATMAP_DAY_LABELS[day]} ${hourLabel(hour)}`}
                      data-intensity={rate === null ? 'sem-base' : intensity.toFixed(2)}
                      className="flex-1 h-5 rounded-[2px]"
                      style={{ background: rate === null ? 'hsl(var(--muted) / 0.3)' : `hsl(var(--primary) / ${Math.max(0.12, intensity * 0.9)})` }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>Mapa de calor de engajamento por dia e horário. Intensidade pela taxa de resposta; menos de {minBase} envios fica neutro.</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Hora</th>
            <th scope="col">Envios</th>
            <th scope="col">Respostas</th>
            <th scope="col">Taxa de resposta</th>
          </tr>
        </thead>
        <tbody>
          {comDados.map((cell) => {
            const rate = rateOf(cell, minBase);
            return (
              <tr key={`${cell.day}-${cell.hour}`}>
                <th scope="row">{HEATMAP_DAY_LABELS[cell.day]}</th>
                <td>{hourLabel(cell.hour)}</td>
                <td>{fmtInt(cell.sent)}</td>
                <td>{fmtInt(cell.replied)}</td>
                <td>{rate === null ? 'sem base mínima' : `${(rate * 100).toFixed(1).replace('.', ',')}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasError ? (
        <p className="text-[13px] text-destructive text-center py-4">Não foi possível carregar os envios do período.</p>
      ) : isLoading ? (
        <p className="text-[13px] text-muted-foreground text-center py-4">Carregando…</p>
      ) : comDados.length === 0 ? (
        <p className="text-[13px] text-muted-foreground text-center py-4">Sem envios no período selecionado.</p>
      ) : null}
    </section>
  );
}
