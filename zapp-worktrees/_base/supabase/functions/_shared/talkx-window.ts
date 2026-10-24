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
 *
 * #121A (2026-10-06): `talkx_settings.business_hours` é JSONB — o banco devolve
 * o OBJETO `{ start, end, tz, days }`, e a versão anterior só aceitava string
 * JSON, então o sender ignorava o valor salvo (caía no default) e o scheduler
 * nem lia a configuração. Ver parseBusinessHours/deliveryWindowStatus abaixo.
 */

export const DEFAULT_SCHEDULE_TIMEZONE = "America/Sao_Paulo";

export type ScheduleGuardCampaign = {
  schedule_timezone?: unknown;
  send_window_start?: string | null;
  send_window_end?: string | null;
  business_hours_only?: boolean | null;
};

export type LocalClock = { hour: number; minute: number; weekday: number };

/**
 * V20/#121A: horário comercial configurável — vem de `talkx_settings.business_hours`.
 *
 * Contrato canônico (JSONB): `{ start: "HH:MM", end: "HH:MM", tz: <fuso IANA>,
 * days: number[] de 0 a 6, 0 = domingo }`. String JSON é aceita apenas como
 * compatibilidade.
 *
 * `invalid: true` marca valor PRESENTE e fora do contrato: quem decide FECHA a
 * janela (não pode cair silenciosamente no default, que é o que acontecia antes
 * quando o parse devolvia null).
 */
export type BusinessHours = {
  start?: string;
  end?: string;
  tz?: string;
  days?: number[];
  invalid?: true;
  invalidReason?: string;
};

/** Default histórico: 08:00–18:00, seg–sex, America/Sao_Paulo (usado na AUSÊNCIA da configuração). */
export const DEFAULT_BUSINESS_HOURS_START = "08:00";
export const DEFAULT_BUSINESS_HOURS_END = "18:00";
export const DEFAULT_BUSINESS_HOURS_DAYS: readonly number[] = [1, 2, 3, 4, 5];

const HHMM = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

/** Minutos desde a meia-noite, ou null se não for "HH:MM" válido. */
function minutesOfDay(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = HHMM.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

function invalidBusinessHours(reason: string): BusinessHours {
  return { invalid: true, invalidReason: reason };
}
/**
 * Valida um valor JÁ deserializado contra o contrato canônico. Devolve o objeto
 * normalizado (start/end/tz/days preservados) ou a marca de inválido — NUNCA
 * null: null é reservado para "não há configuração".
 */
function normalizeBusinessHours(value: unknown): BusinessHours {
  if (value === null || value === undefined) return invalidBusinessHours("valor ausente");
  if (typeof value !== "object" || Array.isArray(value)) return invalidBusinessHours("não é objeto");
  const raw = value as Record<string, unknown>;
  if (minutesOfDay(raw.start) === null) return invalidBusinessHours("start inválido (esperado HH:MM)");
  if (minutesOfDay(raw.end) === null) return invalidBusinessHours("end inválido (esperado HH:MM)");
  if (!Array.isArray(raw.days) || raw.days.length === 0) return invalidBusinessHours("days ausente ou vazio");
  if (!raw.days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) {
    return invalidBusinessHours("days fora de 0..6");
  }
  if (raw.tz !== undefined && raw.tz !== null && !isValidTimeZone(raw.tz)) {
    return invalidBusinessHours("tz não é um fuso IANA conhecido");
  }
  const normalized: BusinessHours = {
    start: (raw.start as string).trim(),
    end: (raw.end as string).trim(),
    days: (raw.days as number[]).slice(),
  };
  if (typeof raw.tz === "string") normalized.tz = raw.tz.trim();
  return normalized;
}

/**
 * Lê `talkx_settings.business_hours`. Devolve:
 *   - `null` → NÃO há configuração (ausente/vazia) → quem decide usa o default
 *     08:00–18:00, seg–sex, America/Sao_Paulo;
 *   - `{ invalid: true, invalidReason }` → configuração PRESENTE e fora do
 *     contrato → quem decide FECHA a janela;
 *   - objeto normalizado → `start`, `end`, `tz` e `days` preservados.
 */
export function parseBusinessHours(value: unknown): BusinessHours | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null; // string vazia = ausência da configuração
    try {
      return normalizeBusinessHours(JSON.parse(text)); // compatibilidade: JSON em texto
    } catch {
      return invalidBusinessHours("string não é JSON");
    }
  }
  return normalizeBusinessHours(value);
}

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
 * Retorna se o envio/retomada é permitido agora.
 *   - `send_window_*` é avaliado no fuso da CAMPANHA (`schedule_timezone`) — sem mudança;
 *   - `business_hours` (só quando a campanha é `business_hours_only`) é avaliado
 *     no fuso PRÓPRIO da configuração (`tz`), com default America/Sao_Paulo
 *     quando a configuração está ausente (#121A);
 *   - fecha (recusa) em qualquer entrada inválida: fuso desconhecido,
 *     send_window_start/end presentes mas não-parseáveis como HH:MM, ou
 *     business_hours presente e fora do contrato.
 */
export function deliveryWindowStatus(
  campaign: ScheduleGuardCampaign,
  now = new Date(),
  businessHours?: BusinessHours | null,
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
  if (campaign.business_hours_only) {
    // #121A: presente e inválida FECHA — nunca cai no default silenciosamente.
    if (businessHours?.invalid === true) {
      return { allowed: false, reason: "invalid_business_hours" };
    }
    const config = businessHours ?? null;
    const bhStart = config ? config.start : DEFAULT_BUSINESS_HOURS_START;
    const bhEnd = config ? config.end : DEFAULT_BUSINESS_HOURS_END;
    const bhDays = config ? config.days : DEFAULT_BUSINESS_HOURS_DAYS;
    const bhStartMin = minutesOfDay(bhStart);
    const bhEndMin = minutesOfDay(bhEnd);
    if (bhStartMin === null || bhEndMin === null || !Array.isArray(bhDays) || bhDays.length === 0) {
      return { allowed: false, reason: "invalid_business_hours" };
    }
    // Ausência usa America/Sao_Paulo; presença manda o tz da própria configuração.
    const bhTimeZone = typeof config?.tz === "string" && config.tz.trim() !== ""
      ? config.tz.trim()
      : DEFAULT_SCHEDULE_TIMEZONE;
    const bhClock = localClockInTimezone(bhTimeZone, now);
    if (!bhClock) return { allowed: false, reason: "invalid_business_hours" };
    const bhMinutes = bhClock.hour * 60 + bhClock.minute;
    if (
      !bhDays.includes(bhClock.weekday) ||
      bhMinutes < bhStartMin ||
      bhMinutes >= bhEndMin
    ) {
      return {
        allowed: false,
        reason: "outside_business_hours",
        next_window: typeof bhStart === "string" ? bhStart : DEFAULT_BUSINESS_HOURS_START,
      };
    }
  }
  return { allowed: true };
}
