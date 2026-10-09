import { SPEED_PROFILES } from './talkxShared';

/**
 * X133 — regras puras do passo Entrega (sem JSX).
 *
 * Ficam separadas de `TalkXDeliverySections.tsx` porque aquele arquivo exporta
 * componentes: misturar componentes e funções soltas no mesmo módulo quebra o
 * Fast Refresh (regra `react-refresh/only-export-components`) e viraria dívida
 * nova. Aqui as regras são testáveis sem montar nada.
 */

/**
 * Horário comercial do Talk X: é o `talkx_settings.business_hours` (JSONB
 * `{ start, end, days, tz }`) — a MESMA configuração que o motor usa em
 * `_shared/talkx-window.ts`. Antes a tela mostrava a constante "segunda a sexta,
 * das 08:00 às 18:00", que podia contradizer o que o operador configurou.
 */
export interface TalkXBusinessHoursSetting {
  start: string;
  end: string;
  days: number[];
  tz?: string;
}

/** Mesmo default do motor quando não há configuração (08:00–18:00, seg–sex). */
export const DEFAULT_TALKX_BUSINESS_HOURS: TalkXBusinessHoursSetting = {
  start: '08:00',
  end: '18:00',
  days: [1, 2, 3, 4, 5],
};

/** Domingo primeiro: mesmo índice usado por `talkx_settings.business_hours.days`. */
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

function clock(value: string): string {
  return value.slice(0, 5);
}

/**
 * Lê a configuração gravada. Valor ausente/fora do contrato cai no default do
 * motor (a tela nunca mostra um horário que o envio não vai respeitar).
 */
export function parseTalkXBusinessHours(value: unknown): TalkXBusinessHoursSetting {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_TALKX_BUSINESS_HOURS;
  const raw = value as Record<string, unknown>;
  const start = typeof raw.start === 'string' ? raw.start : '';
  const end = typeof raw.end === 'string' ? raw.end : '';
  const days = Array.isArray(raw.days)
    ? raw.days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  if (!start || !end || days.length === 0) return DEFAULT_TALKX_BUSINESS_HOURS;
  return { start, end, days: [...new Set(days)].sort((left, right) => left - right), ...(typeof raw.tz === 'string' ? { tz: raw.tz } : {}) };
}

/** Lê a chave `business_hours` da lista de `talkx_settings`. */
export function readTalkXBusinessHours(settings: { key: string; value: unknown }[] | undefined): TalkXBusinessHoursSetting {
  return parseTalkXBusinessHours(settings?.find((setting) => setting.key === 'business_hours')?.value);
}

function formatDayList(days: number[]): string {
  if (days.length > 2 && days[days.length - 1] - days[0] === days.length - 1) {
    return `${WEEKDAY_LABELS[days[0]]}–${WEEKDAY_LABELS[days[days.length - 1]]}`;
  }
  return days.map((day) => WEEKDAY_LABELS[day]).join(', ');
}

function sortedDays(hours: TalkXBusinessHoursSetting): number[] {
  return [...hours.days].filter((day) => day >= 0 && day <= 6).sort((left, right) => left - right);
}

/** "Seg–Sex, das 08:00 às 18:00" a partir do que está GRAVADO nas configurações. */
export function formatBusinessHours(hours: TalkXBusinessHoursSetting): string {
  const days = sortedDays(hours);
  if (days.length === 0) return 'Nenhum dia configurado';
  return `${formatDayList(days)}, das ${clock(hours.start)} às ${clock(hours.end)}`;
}

/** Dias de envio efetivos quando o horário comercial limita. */
export function businessHourDays(hours: TalkXBusinessHoursSetting): string {
  const days = sortedDays(hours);
  return days.length === 0 ? 'Nenhum dia' : formatDayList(days);
}

/** Mensagens por minuto implícitas no intervalo do perfil (valor real do perfil). */
export function profileMessagesPerMinute(profile: string): number {
  const found = SPEED_PROFILES.find((candidate) => candidate.value === profile) ?? SPEED_PROFILES[1];
  const average = (found.interval[0] + found.interval[1]) / 2;
  return average > 0 ? Math.round((60 / average) * 10) / 10 : 0;
}

/** Quantos dias o limite diário da conexão leva para cobrir o público. */
export function daysToDeliver(audienceTotal: number, dailyLimit: number | null | undefined): number | null {
  if (!dailyLimit || dailyLimit <= 0 || audienceTotal <= 0) return null;
  return Math.ceil(audienceTotal / dailyLimit);
}
