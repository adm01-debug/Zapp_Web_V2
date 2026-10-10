// Talk X — "pode enviar agora?" (scheduler + pausa mid-loop do talkx-send).
// Fail-closed: fuso desconhecido, janela/contrato inválido FECHAM em vez de
// assumir UTC ou default. DND (N-118) só com respect_dnd, tudo no fuso da
// campanha (hora, dia e o "hoje" dos feriados). send_weekdays: ausente/[]
// = irrestrito; duplicatas e fora de 0..6 ignorados.

export const DEFAULT_SCHEDULE_TIMEZONE = "America/Sao_Paulo";

// Default de horário comercial (#121A): seg–sex 08:00–18:00 SP.
export const DEFAULT_BUSINESS_HOURS_START = "08:00";
export const DEFAULT_BUSINESS_HOURS_END = "18:00";
export const DEFAULT_BUSINESS_HOURS_DAYS: readonly number[] = [1, 2, 3, 4, 5];

export type BusinessHours = {
  start?: string;
  end?: string;
  tz?: string;
  days?: number[];
  // Fora do contrato → janela fechada (fail-closed), nunca "default".
  invalid?: true;
  invalidReason?: string;
};

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

export type ScheduleGuardCampaign = {
  send_window_start?: string | null;
  send_window_end?: string | null;
  business_hours_only?: boolean | null;
  schedule_timezone?: string | null;
  // N-118: dias de envio 0..6. Ausente/vazio = todos.
  send_weekdays?: number[] | null;
  // N-118: respeitar dnd_hours. Ausente = true.
  respect_dnd?: boolean | null;
};

export type WindowStatus =
  | { allowed: true }
  | { allowed: false; reason: string; next_window?: string };

function clockInTimezone(timeZone: string, now: Date): {
  hour: number;
  minute: number;
  weekday: number;
} | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const get = (type: string): string | undefined =>
      parts.find((p) => p.type === type)?.value;
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    const weekdayStr = get("weekday");
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const weekday = weekdayStr ? map[weekdayStr] : undefined;
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || weekday === undefined) {
      return null;
    }
    // "24:xx" da meia-noite em alguns locales = 0h.
    return { hour: hour === 24 ? 0 : hour, minute, weekday };
  } catch {
    return null;
  }
}

function minutesOfDay(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// N-118: "HH:MM"/"HH:MM:SS" → minutos; resto → null (fecha).
function minutesOfTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some((p) => p.trim() === "")) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (parts.length === 3) {
    const second = Number(parts[2]);
    if (!Number.isInteger(second) || second < 0 || second > 59) return null;
  }
  return hour * 60 + minute;
}

// N-118: YYYY-MM-DD no fuso informado; null se falhar.
function localDateIsoInTimezone(
  timeZone: string | null | undefined,
  now: Date,
): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || DEFAULT_SCHEDULE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string): string | undefined =>
      parts.find((p) => p.type === type)?.value;
    const year = get("year");
    const month = get("month");
    const day = get("day");
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

// N-118: feriado em YYYY-MM-DD com mês/dia possíveis.
function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

// N-118: send_weekdays → null se irrestrito; ignora fora de 0..6 e dupes.
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

export function parseBusinessHours(value: unknown): BusinessHours | null {
  try {
    if (typeof value === "string") {
      if (value.trim() === "") return null;
      const parsed: unknown = JSON.parse(value);
      return normalizeBusinessHours(parsed);
    }
    return normalizeBusinessHours(value);
  } catch {
    return { start: "", end: "", tz: "", days: [], invalid: true, invalidReason: "não é JSON" };
  }
}

function normalizeBusinessHours(value: unknown): BusinessHours | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    return { start: "", end: "", tz: "", days: [], invalid: true, invalidReason: "não é objeto" };
  }
  const raw = value as Record<string, unknown>;
  const start = typeof raw.start === "string" ? raw.start : "";
  const end = typeof raw.end === "string" ? raw.end : "";
  const tz = typeof raw.tz === "string" ? raw.tz : "";
  const days = Array.isArray(raw.days) ? raw.days : [];
  if (minutesOfDay(start) === null || minutesOfDay(end) === null || tz.trim() === "") {
    return { start, end, tz, days: [], invalid: true, invalidReason: "start/end/tz inválidos" };
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    return { start, end, tz, days: [], invalid: true, invalidReason: `fuso desconhecido: ${tz}` };
  }
  const validDays = days.filter(
    (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
  );
  if (validDays.length === 0) {
    return { start, end, tz, days: [], invalid: true, invalidReason: "days vazio ou sem dia válido" };
  }
  return { start, end, tz, days: validDays };
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
  const invalid = (reason: string): DndSetting => ({
    start: "",
    end: "",
    sundays: false,
    holidays: [],
    invalid: true,
    invalidReason: reason,
  });
  if (typeof value !== "object" || Array.isArray(value)) {
    return invalid("dnd_hours não é objeto");
  }
  const raw = value as Record<string, unknown>;
  const start = typeof raw.start === "string" ? raw.start.trim() : "";
  const end = typeof raw.end === "string" ? raw.end.trim() : "";
  if (minutesOfDay(start) === null || minutesOfDay(end) === null) {
    return invalid("dnd_hours.start/end fora de HH:MM");
  }
  if (raw.sundays !== undefined && typeof raw.sundays !== "boolean") {
    return invalid("dnd_hours.sundays não-booleano");
  }
  if (raw.holidays !== undefined && !Array.isArray(raw.holidays)) {
    return invalid("dnd_hours.holidays não é array");
  }
  const holidays: string[] = [];
  if (Array.isArray(raw.holidays)) {
    for (const entry of raw.holidays) {
      if (typeof entry !== "string" || !isIsoDate(entry)) {
        return invalid(`feriado fora de YYYY-MM-DD: ${String(entry).slice(0, 32)}`);
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

export function deliveryWindowStatus(
  campaign: ScheduleGuardCampaign,
  now: Date = new Date(),
  businessHours: BusinessHours | null = null,
  dndSetting: DndSetting | null = null,
): WindowStatus {
  const timeZone = campaign.schedule_timezone || DEFAULT_SCHEDULE_TIMEZONE;
  const clock = clockInTimezone(timeZone, now);
  if (clock === null) {
    return { allowed: false, reason: "invalid_timezone" };
  }
  const currentMinutes = clock.hour * 60 + clock.minute;

  // N-118: dias de envio ([]/inválidos = irrestrito).
  const sendDays = normalizeSendWeekdays(campaign.send_weekdays);
  if (sendDays !== null && !sendDays.includes(clock.weekday)) {
    return { allowed: false, reason: "outside_weekdays" };
  }

  if (campaign.send_window_start && campaign.send_window_end) {
    const start = minutesOfTime(campaign.send_window_start);
    const end = minutesOfTime(campaign.send_window_end);
    // N-118: janela presente mas fora do contrato fecha (não passa aberta).
    if (start === null || end === null) {
      return { allowed: false, reason: "outside_send_window" };
    }
    if (currentMinutes < start || currentMinutes >= end) {
      return {
        allowed: false,
        reason: "outside_send_window",
        next_window: campaign.send_window_start,
      };
    }
  }

  if (campaign.business_hours_only) {
    // #121A: presente e inválido FECHA — nunca cai no default silenciosamente.
    if (businessHours?.invalid === true) {
      return { allowed: false, reason: "invalid_business_hours" };
    }
    // #121A: ausência usa o default 08:00–18:00, seg–sex, America/Sao_Paulo.
    const config = businessHours ?? null;
    const bhStart = config?.start ?? DEFAULT_BUSINESS_HOURS_START;
    const bhEnd = config?.end ?? DEFAULT_BUSINESS_HOURS_END;
    const bhDays = config?.days ?? DEFAULT_BUSINESS_HOURS_DAYS;
    const bhStartMin = minutesOfDay(bhStart);
    const bhEndMin = minutesOfDay(bhEnd);
    if (bhStartMin === null || bhEndMin === null || !Array.isArray(bhDays) || bhDays.length === 0) {
      return { allowed: false, reason: "invalid_business_hours" };
    }
    const bhTimeZone = typeof config?.tz === "string" && config.tz.trim() !== ""
      ? config.tz.trim()
      : DEFAULT_SCHEDULE_TIMEZONE;
    const bhClock = clockInTimezone(bhTimeZone, now);
    if (bhClock === null) {
      return { allowed: false, reason: "invalid_business_hours" };
    }
    const bhNow = bhClock.hour * 60 + bhClock.minute;
    if (!bhDays.includes(bhClock.weekday) || bhNow < bhStartMin || bhNow >= bhEndMin) {
      return {
        allowed: false,
        reason: "outside_business_hours",
        next_window: typeof bhStart === "string" ? bhStart : DEFAULT_BUSINESS_HOURS_START,
      };
    }
  }

  // N-118: DND só com opt-in; hora/dia/feriados no fuso da campanha.
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
      const todayIso = localDateIsoInTimezone(campaign.schedule_timezone, now);
      if (todayIso === null) {
        return { allowed: false, reason: "dnd" };
      }
      if (dndSetting.sundays && clock.weekday === 0) {
        return { allowed: false, reason: "dnd" };
      }
      if (dndSetting.holidays.includes(todayIso)) {
        return { allowed: false, reason: "dnd" };
      }
      // N-118: DND que vira a meia-noite (start > end) cobre os dois lados.
      const dndAtivo = dndStart <= dndEnd
        ? currentMinutes >= dndStart && currentMinutes < dndEnd
        : currentMinutes >= dndStart || currentMinutes < dndEnd;
      if (dndAtivo) {
        return { allowed: false, reason: "dnd" };
      }
    }
  }

  return { allowed: true };
}
