/**
 * talkx-window.ts — Helper compartilhado de janela de entrega Talk X
 * Usado por talkx-send (mid-loop auto-pausa) e talkx-scheduler (retomada automática).
 *
 * Extraído de talkx-send/index.ts (era local e não-exportado) para que a
 * retomada automática (E83) reuse a MESMA lógica que a pausa, em vez de uma
 * segunda implementação divergente. A versão anterior deste arquivo
 * (isWithinSendWindow) tinha 3 problemas reais, encontrados em auditoria:
 *   1. Fuso hardcoded em America/Sao_Paulo, ignorando schedule_timezone
 *      (campanhas com fuso configurado eram pausadas num fuso e retomadas
 *      noutro).
 *   2. Extraia a hora local fazendo um round-trip Date -> string formatada
 *      -> Date de novo, sem fuso explicito no reparse -- padrao ja removido
 *      uma vez de talkx-send/index.ts (ver guarda de regressao em
 *      scripts/db-audit/talkx-schedule-timezone-contract.test.mjs) e
 *      reintroduzido aqui, so que noutro arquivo, escapando do teste.
 *   3. Falha ABERTA (permite envio) em janela malformada/vazia, em vez de
 *      fechada -- os minutos calculados comparados contra NaN nunca disparam
 *      a condicao de recusa, entao nenhuma das duas checagens rejeita.
 */

export const DEFAULT_SCHEDULE_TIMEZONE = "America/Sao_Paulo";

export type ScheduleGuardCampaign = {
  schedule_timezone?: unknown;
  send_window_start?: string | null;
  send_window_end?: string | null;
  business_hours_only?: boolean | null;
};

export type LocalClock = { hour: number; minute: number; weekday: number };

export function localClockInTimezone(timeZone: string, now = new Date()): LocalClock | null {
  try {
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now).map((part) => [part.type, part.value]),
    );
    const weekdayText = values.weekday;
    if (typeof weekdayText !== "string") return null;
    const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekdayText];
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    return typeof weekday === "number" && Number.isInteger(hour) && Number.isInteger(minute)
      ? { weekday, hour, minute }
      : null;
  } catch {
    return null;
  }
}

/**
 * Retorna se o envio/retomada é permitido agora, no fuso da campanha.
 * Fecha (recusa) em qualquer entrada inválida: fuso desconhecido, ou
 * send_window_start/end presentes mas não-parseáveis como HH:MM.
 */
export function deliveryWindowStatus(
  campaign: ScheduleGuardCampaign,
  now = new Date(),
): { allowed: true } | { allowed: false; reason: string; next_window?: string } {
  const timeZone = typeof campaign.schedule_timezone === "string"
    ? campaign.schedule_timezone
    : DEFAULT_SCHEDULE_TIMEZONE;
  const clock = localClockInTimezone(timeZone, now);
  if (!clock) return { allowed: false, reason: "invalid_schedule_timezone" };

  const currentMinutes = clock.hour * 60 + clock.minute;
  if (campaign.send_window_start && campaign.send_window_end) {
    const [startHour, startMinute] = campaign.send_window_start.split(":").map(Number);
    const [endHour, endMinute] = campaign.send_window_end.split(":").map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    if (!Number.isInteger(start) || !Number.isInteger(end) || currentMinutes < start || currentMinutes >= end) {
      return { allowed: false, reason: "outside_send_window", next_window: campaign.send_window_start };
    }
  }
  if (campaign.business_hours_only && (clock.weekday === 0 || clock.weekday === 6 || clock.hour < 8 || clock.hour >= 18)) {
    return { allowed: false, reason: "outside_business_hours" };
  }
  return { allowed: true };
}
