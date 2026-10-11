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
 *
 * N-118: dias de envio (`send_weekdays`, 0=dom..6=sáb) e "não perturbe"
 * (`dnd_hours` de talkx_settings, com opt-in por campanha via `respect_dnd`).
 * Ausente/vazio = irrestrito; DND inválido ou fora do contrato fecha com
 * reason "dnd"; `respect_dnd = false` ignora o DND.
 */

export const DEFAULT_SCHEDULE_TIMEZONE = "America/Sao_Paulo";

export type ScheduleGuardCampaign = {
  schedule_timezone?: unknown;
  send_window_start?: string | null;
  send_window_end?: string | null;
  business_hours_only?: boolean | null;
  // N-118: dias de envio 0..6. Ausente/vazio = todos os dias.
  send_weekdays?: number[] | null;
  // N-118: respeitar dnd_hours. Ausente = true (opt-out explícito com false).
  respect_dnd?: boolean | null;
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

// N-118: send_window vem do banco como `time` (serializa "HH:MM:SS").
// Fora do contrato → null (a janela presente-mas-inválida fecha, não abre:
// o split original transformava "08:60" em 09:00 por overflow).
function minutesOfTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const [h, m, s] = parts;
  if (!/^\d{1,2}$/.test(h) || !/^\d{1,2}$/.test(m)) return null;
  if (s !== undefined && !/^\d{1,2}$/.test(s)) return null;
  const hour = Number(h);
  const minute = Number(m);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
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

// N-118: janela "não perturbe" (dnd_hours de talkx_settings).
export type DndSetting = {
  start: string;
  end: string;
  sundays: boolean;
  holidays: string[];
  // Fora do contrato → fecha com reason "dnd".
  invalid?: true;
  invalidReason?: string;
};

// N-118: dias de envio ([]/ausente/fora de 0..6 = irrestrito; duplicatas
// ignoradas). Os valores vêm do banco (validados no save), então filtrar
// aqui é só defesa — nunca fecha sozinho.
function normalizeSendWeekdays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days: number[] = [];
  for (const entry of value) {
    if (
      typeof entry === "number" &&
      Number.isInteger(entry) &&
      entry >= 0 &&
      entry <= 6 &&
      !days.includes(entry)
    ) {
      days.push(entry);
    }
  }
  return days.length > 0 ? days : null;
}

// N-118: "hoje" (YYYY-MM-DD) no fuso da campanha — para os feriados do DND.
function localDateIsoInTimezone(timeZone: string, now: Date): string | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const iso = fmt.format(now);
    return isIsoDate(iso) ? iso : null;
  } catch {
    return null;
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function invalidDnd(reason: string): DndSetting {
  return { start: "", end: "", sundays: false, holidays: [], invalid: true, invalidReason: reason };
}

// N-118: dnd_hours → null se ausente; fora do contrato → { invalid: true } (fecha).
export function parseDndHours(value: unknown): DndSetting | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return normalizeDndHours(parsed);
    } catch {
      // String presente mas não é JSON: fora do contrato → fecha, não some.
      return normalizeDndHours(value);
    }
  }
  return normalizeDndHours(value);
}

export function normalizeDndHours(value: unknown): DndSetting | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    return invalidDnd("dnd_hours não é objeto");
  }
  const raw = value as Record<string, unknown>;
  const start = typeof raw.start === "string" ? raw.start.trim() : "";
  const end = typeof raw.end === "string" ? raw.end.trim() : "";
  if (minutesOfDay(start) === null || minutesOfDay(end) === null) {
    return invalidDnd("dnd_hours.start/end fora de HH:MM");
  }
  if (raw.sundays !== undefined && typeof raw.sundays !== "boolean") {
    return invalidDnd("dnd_hours.sundays não-booleano");
  }
  if (raw.holidays !== undefined && !Array.isArray(raw.holidays)) {
    return invalidDnd("dnd_hours.holidays não é array");
  }
  const holidays: string[] = [];
  if (Array.isArray(raw.holidays)) {
    for (const entry of raw.holidays) {
      if (typeof entry !== "string" || !isIsoDate(entry)) {
        return invalidDnd(`feriado fora de YYYY-MM-DD: ${String(entry).slice(0, 32)}`);
      }
      holidays.push(entry.trim());
    }
  }
  return {
    start,
    end,
    sundays: raw.sundays === true,
    holidays,
  };
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
 *   - N-118: `send_weekdays` fora da lista fecha com "outside_weekdays";
 *     DND (opt-in via `respect_dnd`, default true) fecha com "dnd".
 */
export function deliveryWindowStatus(
  campaign: ScheduleGuardCampaign,
  now = new Date(),
  businessHours?: BusinessHours | null,
  dndSetting?: DndSetting | null,
): { allowed: true } | { allowed: false; reason: string; next_window?: string } {
  const timeZone = typeof campaign.schedule_timezone === "string"
    ? campaign.schedule_timezone
    : DEFAULT_SCHEDULE_TIMEZONE;
  const clock = localClockInTimezone(timeZone, now);
  if (!clock) return { allowed: false, reason: "invalid_schedule_timezone" };

  const currentMinutes = clock.hour * 60 + clock.minute;

  // N-118: dias de envio (fora da lista = fora da janela).
  const sendDays = normalizeSendWeekdays(campaign.send_weekdays);
  if (sendDays !== null && !sendDays.includes(clock.weekday)) {
    return { allowed: false, reason: "outside_weekdays" };
  }

  if (campaign.send_window_start && campaign.send_window_end) {
    // N-118: janela presente mas fora do contrato fecha (não passa aberta).
    const start = minutesOfTime(campaign.send_window_start);
    const end = minutesOfTime(campaign.send_window_end);
    if (start === null || end === null || currentMinutes < start || currentMinutes >= end) {
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

  // N-118: DND só com opt-in (respect_dnd ≠ false); hora, dia e feriados no
  // fuso da campanha. DND que vira a meia-noite (start > end) cobre os dois
  // lados; o fim é exclusivo.
  if (campaign.respect_dnd !== false) {
    if (dndSetting?.invalid === true) {
      return { allowed: false, reason: "dnd" };
    }
    if (dndSetting) {
      const dndStart = minutesOfDay(dndSetting.start);
      const dndEnd = minutesOfDay(dndSetting.end);
      if (dndStart === null || dndEnd === null) {
        return { allowed: false, reason: "dnd" };
      }
      const todayIso = localDateIsoInTimezone(timeZone, now);
      if (todayIso === null) {
        return { allowed: false, reason: "dnd" };
      }
      if (dndSetting.sundays && clock.weekday === 0) {
        return { allowed: false, reason: "dnd" };
      }
      if (dndSetting.holidays.includes(todayIso)) {
        return { allowed: false, reason: "dnd" };
      }
      const dndAtivo =
        dndStart <= dndEnd
          ? currentMinutes >= dndStart && currentMinutes < dndEnd
          : currentMinutes >= dndStart || currentMinutes < dndEnd;
      if (dndAtivo) {
        return { allowed: false, reason: "dnd" };
      }
    }
  }

  return { allowed: true };
}
