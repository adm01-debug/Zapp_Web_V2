// X149 — "Fila por Segmento" (telas 11 e 13): contrato da RPC e regra de exibição.
//
// A regra fica fora do TSX (mesmo arranjo de `talkxHealth.ts` / `talkxKeyMetrics.ts`)
// para poder ser testada sem React. Os números chegam PRONTOS da RPC
// `talkx_campaign_segment_progress` (N-096/X142): a tela não recalcula total,
// enviadas nem restante — só ordena e formata.

/** Quantas linhas o card mostra antes do "Ver todos →". */
export const SEGMENT_PREVIEW_SIZE = 4;

/** Rótulo do público sem segmento (contatos escolhidos à mão na criação). */
export const MANUAL_SEGMENT_LABEL = 'Seleção manual';

/**
 * Linha crua da RPC `talkx_campaign_segment_progress`. É o contrato de leitura:
 * o front não inventa campo que o servidor não devolve.
 */
export interface TalkXSegmentProgressRpcRow {
  segment_id: string | null;
  /** Ordem de envio da campanha (talkx_campaign_segments.position). */
  position: number;
  total: number;
  /** Enviadas + entregues (a RPC soma os dois em `sent`). */
  sent: number;
  delivered: number;
  failed: number;
  /** Ainda na fila (pending + sending). */
  remaining: number;
  /** Percentual processado, já arredondado pela RPC (0–100). */
  percent: number;
  status: 'done' | 'running' | 'pending' | string;
  total_segments: number;
  pending_segments: number;
}

/** Linha pronta para a tela. */
export interface TalkXSegmentProgressItem {
  /** Chave de render: estável mesmo com dois públicos sem id. */
  id: string;
  segmentId: string | null;
  label: string;
  position: number;
  total: number;
  sent: number;
  remaining: number;
  /** Inteiro 0–100. */
  percent: number;
  /** Barra verde: público 100% processado. */
  done: boolean;
}

/**
 * Percentual inteiro do público. Trunca (não arredonda): 398 de 400 é 99%, não 100%.
 * `value` é o `percent` da RPC; só quando ele não vier é que a conta é refeita aqui.
 */
export function segmentPercent(value: number | null | undefined, total: number, remaining: number): number {
  const raw = typeof value === 'number' && Number.isFinite(value)
    ? value
    : total > 0 ? (100 * (total - remaining)) / total : 0;
  return Math.max(0, Math.min(100, Math.floor(raw)));
}

/** Nome do público: o mapa da tela manda; sem ele, um rótulo neutro (nunca um UUID). */
export function segmentLabel(
  segmentId: string | null,
  position: number,
  names?: Record<string, string> | null,
): string {
  if (!segmentId) return MANUAL_SEGMENT_LABEL;
  const named = names?.[segmentId]?.trim();
  return named || `Segmento ${position}`;
}

/**
 * Converte as linhas da RPC nos itens da tela, na ordem de envio.
 * A ordenação é refeita no cliente por segurança: a barra e as contas saem da RPC,
 * mas a lista não pode aparecer fora de ordem se o servidor mudar de plano.
 */
export function toSegmentProgressItems(
  rows: TalkXSegmentProgressRpcRow[] | null | undefined,
  names?: Record<string, string> | null,
): TalkXSegmentProgressItem[] {
  return (rows ?? [])
    .map((row) => {
      const percent = segmentPercent(row.percent, row.total, row.remaining);
      return {
        id: row.segment_id ?? `manual:${row.position}`,
        segmentId: row.segment_id ?? null,
        label: segmentLabel(row.segment_id, row.position, names),
        position: row.position,
        total: row.total,
        sent: row.sent,
        remaining: row.remaining,
        percent,
        done: row.status === 'done' || percent === 100,
      };
    })
    .sort((a, b) => a.position - b.position);
}
