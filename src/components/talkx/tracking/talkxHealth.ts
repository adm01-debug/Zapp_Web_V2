// talkxHealth.ts — X148: regra pura da "Saúde da Campanha" (acompanhamento da campanha).
//
// O plano (docs/talkx/v4/etapas/F11-acompanhar-campanha.md, X148) prevê o estado do
// worker vindo de `health.worker_state` da RPC `talkx_monitor_panel`. Essa RPC ainda NÃO
// existe (`git grep talkx_monitor_panel -- supabase` = 0), então o estado é derivado
// AQUI, no cliente, das mesmas evidências que a regra do motor usa no banco:
//   • `talkx_campaigns.status` + `pause_reason` — separa a pausa automática do motor
//     (vocabulário de `AUTO_RESUME_REASONS`, em supabase/functions/_shared/talkx-resume-policy.ts)
//     da pausa feita pelo operador;
//   • último envio (`talkx_recipients.sent_at`): "parada" = `sending`, com pendentes e
//     sem envio há mais que o maior entre 3 min e 3×(intervalo máximo + digitação);
//   • taxa por minuto medida nos últimos 5 minutos.
// Quando o painel do servidor chegar, muda só a ORIGEM deste objeto; a tela segue igual.
//
// A regra vive fora do .tsx porque o lint (react-refresh/only-export-components) só
// admite componente exportado em arquivo de componente.

import { CAMPAIGN_STATUS, fmtAgo, type PillTone } from '../talkxShared';

/** Estados do worker — o mesmo conjunto que a regra do motor classifica no banco. */
export type TalkXWorkerState = 'sending' | 'stalled' | 'paused_manual' | 'paused_auto' | 'done';

/** Piso do "sem envio": o motor considera parada a partir do maior entre 3 min e
 *  3× o ritmo configurado (`send_interval_max` + `typing_delay_max`, ambos em ms). */
export const TALKX_STALL_MIN_MS = 180_000;

/** Janela da taxa medida (o motor mede "enviadas nos últimos 5 min ÷ 5"). */
export const TALKX_RATE_WINDOW_MIN = 5;

/**
 * Motivos que o motor grava quando pausa sozinho e que o `talkx-scheduler` retoma sem
 * ninguém pedir — espelha `AUTO_RESUME_REASONS` de
 * `supabase/functions/_shared/talkx-resume-policy.ts` (a lista canônica é de lá; aqui
 * fica só o texto que o operador lê). Qualquer outro motivo (texto livre do operador,
 * nulo ou motivo de diagnóstico) é pausa manual e NUNCA volta sozinha.
 */
const AUTO_PAUSE_TEXT: Record<string, string> = {
  send_window: 'fora da janela de envio',
  business_hours: 'fora do horário comercial',
  connection_lost: 'a conexão do WhatsApp caiu',
  daily_limit: 'limite diário da conexão atingido',
};

export interface TalkXHealth {
  workerState: TalkXWorkerState;
  /** Texto do "Status atual" (o que o operador lê). */
  label: string;
  /** Rótulo curto do selo no cabeçalho do card. */
  pillLabel: string;
  tone: PillTone;
  /** Só a campanha parada oferece saída ("Ver o que fazer"). */
  needsHelp: boolean;
}

export interface TalkXHealthInput {
  /** `talkx_campaigns.status`. */
  status: string;
  /** `talkx_campaigns.pause_reason` (cru, como está no banco). */
  pauseReason?: string | null;
  /** `talkx_recipients.sent_at` do último envio (ISO) — ou o início da campanha. */
  lastActivityAt?: string | null;
  /** Contatos que ainda não foram processados. */
  pending?: number;
  stalledAfterMs?: number;
  nowMs?: number;
}

/** "Pausada por você" é o texto do plano para a pausa do operador; a do motor tem
 *  motivo conhecido e ganha o texto do motivo + o aviso de que volta sozinha. */
export function deriveTalkXHealth(input: TalkXHealthInput): TalkXHealth {
  const reason = normalizePauseReason(input.pauseReason);
  const status = input.status;

  if (status === 'paused') {
    if (reason && reason in AUTO_PAUSE_TEXT) {
      return {
        workerState: 'paused_auto',
        label: `Pausada automaticamente: ${AUTO_PAUSE_TEXT[reason]} — volta sozinha`,
        pillLabel: 'Pausada',
        tone: 'warning',
        needsHelp: false,
      };
    }
    if (reason) {
      return {
        workerState: 'paused_manual',
        label: `Pausada pelo sistema: ${reason} — precisa de ação`,
        pillLabel: 'Pausada',
        tone: 'warning',
        needsHelp: true,
      };
    }
    return { workerState: 'paused_manual', label: 'Pausada por você', pillLabel: 'Pausada', tone: 'warning', needsHelp: false };
  }

  if (status === 'sending') {
    const last = toTime(input.lastActivityAt);
    const pending = input.pending ?? 0;
    const stalledAfter = input.stalledAfterMs ?? TALKX_STALL_MIN_MS;
    const now = input.nowMs ?? Date.now();
    // Só é "parada" com fila por esvaziar e envio atrasado: campanha no fim (0 pendentes)
    // ou que acabou de enviar continua "Enviando normalmente".
    if (pending > 0 && last !== null && now - last > stalledAfter) {
      return {
        workerState: 'stalled',
        label: `Envio parado ${fmtAgo(input.lastActivityAt)}`,
        pillLabel: 'Parada',
        tone: 'warning',
        needsHelp: true,
      };
    }
    return { workerState: 'sending', label: 'Enviando normalmente', pillLabel: 'Enviando', tone: 'info', needsHelp: false };
  }

  // Concluída/cancelada — e qualquer status fora do ciclo de envio (rascunho/agendada):
  // mostra o rótulo do próprio status, nunca um estado inventado.
  return {
    workerState: 'done',
    label: CAMPAIGN_STATUS[status]?.label ?? status,
    pillLabel: CAMPAIGN_STATUS[status]?.label ?? status,
    tone: CAMPAIGN_STATUS[status]?.tone ?? 'muted',
    needsHelp: false,
  };
}

/** Ritmo configurado → janela de silêncio que caracteriza parada (ms). */
export function talkxStallWindowMs(sendIntervalMaxMs?: number | null, typingDelayMaxMs?: number | null): number {
  const perSend = Math.max(0, sendIntervalMaxMs ?? 0) + Math.max(0, typingDelayMaxMs ?? 0);
  return Math.max(TALKX_STALL_MIN_MS, 3 * perSend);
}

/** Último envio conhecido (ISO) ou null quando ainda não há nenhum. */
export function talkxLastSentAt(sentAts: readonly (string | null | undefined)[]): string | null {
  let latest: number | null = null;
  let latestIso: string | null = null;
  for (const stamp of sentAts) {
    const time = toTime(stamp);
    if (time === null) continue;
    if (latest === null || time > latest) {
      latest = time;
      latestIso = stamp as string;
    }
  }
  return latestIso;
}

/** Taxa medida: envios com `sent_at` dentro dos últimos 5 minutos ÷ 5. Sem nenhum
 *  envio conhecido devolve null — a tela mostra "—" em vez de inventar 0. */
export function talkxRatePerMinute(
  sentAts: readonly (string | null | undefined)[],
  nowMs: number = Date.now(),
): number | null {
  const times = sentAts.map(toTime).filter((time): time is number => time !== null);
  if (times.length === 0) return null;
  const since = nowMs - TALKX_RATE_WINDOW_MIN * 60_000;
  return times.filter((time) => time > since).length / TALKX_RATE_WINDOW_MIN;
}

export function fmtRatePerMinute(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  return `${(Math.round(rate * 10) / 10).toString().replace('.', ',')} msgs/min`;
}

/**
 * `talkx_campaigns.pause_reason` existe no banco (é a coluna que o motor grava e o
 * talkx-scheduler lê), mas ainda NÃO está no tipo `TalkXCampaign` — entra no types-sync
 * canônico. Lido por guarda para a tela não depender do tipo largado nem aceitar um
 * valor que não seja texto (null/objeto viram "sem motivo", nunca "Pausada por você: [object]").
 */
export function campaignPauseReason(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null;
  return normalizePauseReason((row as { pause_reason?: unknown }).pause_reason as string | null | undefined);
}

/** O motivo pode estar gravado com espaço em volta (ver talkx-resume-policy.test.ts):
 *  normaliza antes de classificar pausa automática × manual. */
function normalizePauseReason(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}
