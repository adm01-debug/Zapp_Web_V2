/**
 * Série por minuto dos envios recentes de uma campanha (R2-MOD-033).
 *
 * Antes, a série agrupava SÓ os minutos que tiveram evento (buckets esparsos) sobre
 * os primeiros 2000 envios: pausas não entravam no denominador e o "ritmo médio dos
 * últimos 10 min" continuava positivo depois de minutos sem envio, inflando o prazo
 * estimado. Agora os buckets são consecutivos, terminando no minuto atual, e incluem
 * zeros — dez minutos sem envio dão ritmo zero.
 */

export interface MinuteBucket {
  /** Rótulo curto `MM-DD HH:mm`. */
  time: string;
  Enviadas: number;
  Entregues: number;
}

function minuteKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd} ${hh}:${mi}`;
}

/**
 * Buckets de minuto consecutivos terminando em `now`, incluindo os minutos sem envio.
 * Recebe as linhas de `talkx_recipients` (idealmente as mais recentes).
 */
export function recentMinuteSeries(
  rows: Array<{ sent_at: string; delivered_at: string | null }>,
  opts: { minutes?: number; now?: Date } = {},
): MinuteBucket[] {
  const minutes = opts.minutes ?? 20;
  const now = opts.now ?? new Date();

  const byMin = new Map<string, { Enviadas: number; Entregues: number }>();
  for (const r of rows) {
    const d = new Date(r.sent_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = minuteKey(d);
    const v = byMin.get(key) ?? { Enviadas: 0, Entregues: 0 };
    v.Enviadas += 1;
    if (r.delivered_at) v.Entregues += 1;
    byMin.set(key, v);
  }

  const end = new Date(now);
  end.setSeconds(0, 0);
  const out: MinuteBucket[] = [];
  for (let i = minutes - 1; i >= 0; i--) {
    const key = minuteKey(new Date(end.getTime() - i * 60_000));
    const v = byMin.get(key) ?? { Enviadas: 0, Entregues: 0 };
    out.push({ time: key.slice(5), Enviadas: v.Enviadas, Entregues: v.Entregues });
  }
  return out;
}

/**
 * Ritmo (envios/min) médio sobre os últimos `windowMinutes` buckets CONSECUTIVOS.
 * Devolve 0 quando a janela está vazia — quem consome decide se "0" vira
 * "indisponível" em vez de previsão otimista (`estimateMinutesToFinish`).
 */
export function averageRatePerMinute(series: MinuteBucket[], windowMinutes = 10): number | null {
  if (series.length === 0) return null;
  const janela = series.slice(-windowMinutes);
  const total = janela.reduce((a, b) => a + b.Enviadas, 0);
  return total / janela.length;
}

/**
 * Minutos estimados para concluir `pending` envios no ritmo `ratePerMinute`.
 *
 * Ritmo zero (dez minutos sem envio), ausente ou não finito → `null`: a previsão
 * fica "indisponível" em vez de dividir por zero e devolver `Infinity` (recusa do
 * item #135). Um `pending` não positivo também não tem o que estimar.
 */
export function estimateMinutesToFinish(pending: number, ratePerMinute: number | null): number | null {
  if (ratePerMinute === null || !Number.isFinite(ratePerMinute) || ratePerMinute <= 0) return null;
  if (!Number.isFinite(pending) || pending <= 0) return null;
  return Math.ceil(pending / ratePerMinute);
}
