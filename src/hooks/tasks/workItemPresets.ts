/**
 * Presets de PRAZO e LEMBRETE no fuso local (etapa 161) e a coerência
 * prazo × lembrete (etapa 162).
 *
 * Reproduz, em funções puras, os presets que o QuickAdd já oferece inline nos
 * chips (Hoje / Amanhã / Próx. semana / Em 1 h / Amanhã 9h / Próx. seg 9h). A
 * diferença é o CÁLCULO: aqui a aritmética é de CALENDÁRIO (`setDate`), não
 * `Date.now() + 86_400_000` — assim um preset criado às 23:30 cai no dia
 * seguinte, e não no mesmo dia. O "Amanhã 9h" reaproveita `tomorrowAtNine`
 * (fonte única, já testada em `useMyWorkItems`).
 *
 * Nada aqui escreve no banco: devolve `Date`/ISO para quem for montar o insert.
 */
import { tomorrowAtNine } from './useMyWorkItems';

/** Presets do chip de prazo (`due_date`). */
export type DuePreset = 'today' | 'tomorrow' | 'nextWeek';
/** Presets do chip de lembrete (`remind_at`). */
export type RemindPreset = 'in1h' | 'tomorrow9' | 'nextMonday9';

/** Meia-noite local do dia de `now`. */
function inicioDoDiaLocal(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** 23:59 locais do dia de `d` — a convenção de "dia inteiro" do módulo. */
function fimDoDiaLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);
}

const DIAS_DO_PRESET: Record<DuePreset, number> = { today: 0, tomorrow: 1, nextWeek: 7 };

/** Prazo do preset, às 23:59 locais do dia correspondente. */
export function duePresetDate(preset: DuePreset, now: Date = new Date()): Date {
  const d = inicioDoDiaLocal(now);
  d.setDate(d.getDate() + DIAS_DO_PRESET[preset]);
  return fimDoDiaLocal(d);
}

/** `toISOString()` do prazo do preset — o que vai para `due_date`. */
export function duePresetISO(preset: DuePreset, now: Date = new Date()): string {
  return duePresetDate(preset, now).toISOString();
}

/** Próxima segunda-feira às 09:00 locais — sempre a PRÓXIMA, nunca o mesmo dia. */
export function nextMondayAtNine(now: Date = new Date()): Date {
  const d = new Date(now);
  const delta = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + delta);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Alvo de `remind_at` do preset: agora + 1 h · amanhã 9h · próxima segunda 9h. */
export function remindPresetDate(preset: RemindPreset, now: Date = new Date()): Date {
  if (preset === 'tomorrow9') return tomorrowAtNine(now);
  if (preset === 'nextMonday9') return nextMondayAtNine(now);
  return new Date(now.getTime() + 3_600_000);
}

/** `toISOString()` do lembrete do preset — o que vai para `remind_at`. */
export function remindPresetISO(preset: RemindPreset, now: Date = new Date()): string {
  return remindPresetDate(preset, now).toISOString();
}

/** Estados possíveis da coerência prazo × lembrete (etapa 162). */
export type RemindCoherenceState = 'ok' | 'in_past' | 'after_due' | 'no_due';

export interface RemindCoherence {
  state: RemindCoherenceState;
  /** Vazio quando não há lembrete a conferir. */
  message: string;
}

/** Mensagens fixas — cada texto diz exatamente o que a checagem encontrou. */
export const REMIND_COHERENCE_MESSAGES: Record<RemindCoherenceState, string> = {
  ok: 'Lembrete programado para antes do prazo.',
  in_past: 'O lembrete precisa estar no futuro.',
  after_due: 'O lembrete precisa ser antes do prazo.',
  no_due: 'Sem prazo definido — não há como comparar o lembrete com o prazo.',
};

function toInstant(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const t = typeof value === 'string' ? new Date(value).getTime() : value.getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Confere o lembrete contra o prazo (etapa 162): o lembrete tem de estar no
 * FUTURO (`remind_at` > agora) e ANTES do prazo (`remind_at` < `due_date`).
 *
 * Estados: `ok`; `in_past` (já passou); `after_due` (depois do prazo — inclusive
 * IGUAL, que não é "antes"); `no_due` (sem prazo para comparar). Sem lembrete
 * não há o que conferir: devolve `ok` com mensagem vazia.
 */
export function checkRemindCoherence(
  remindAt: string | Date | null | undefined,
  dueDate: string | Date | null | undefined,
  now: Date = new Date(),
): RemindCoherence {
  const lembrete = toInstant(remindAt);
  if (lembrete === null) return { state: 'ok', message: '' };

  if (lembrete <= now.getTime()) return { state: 'in_past', message: REMIND_COHERENCE_MESSAGES.in_past };

  const prazo = toInstant(dueDate);
  if (prazo === null) return { state: 'no_due', message: REMIND_COHERENCE_MESSAGES.no_due };

  if (lembrete >= prazo) return { state: 'after_due', message: REMIND_COHERENCE_MESSAGES.after_due };

  return { state: 'ok', message: REMIND_COHERENCE_MESSAGES.ok };
}
