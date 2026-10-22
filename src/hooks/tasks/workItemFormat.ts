/**
 * Regra ÚNICA de datas do módulo de Tarefas (etapa 058 / D21).
 *
 * As imagens de referência usavam 4 formatos diferentes; aqui existe um só, no
 * fuso LOCAL do navegador — a mesma decisão que `src/lib/localDay.ts` já toma
 * para exibição e agrupamento:
 *
 *   com hora     → "Ontem, 17:00" · "Hoje, 14:00" · "Amanhã, 10:00" · "13 out., 15:00"
 *   concluídas   → só o dia: "Hoje" · "Ontem" · "09 out."
 *   painel/modal → "Hoje, 11/10" + a hora à parte (ver `formatWorkItemField`)
 *
 * Nunca o "Seg, 09/09, 14:20" da imagem 04 — nenhum formato daqui traz o dia da
 * semana. Este módulo só LÊ e formata: não grava nem altera nada.
 */
import { localDayKey, parseDayKey } from '@/lib/localDay';

/** Meses curtos em pt-BR, com o ponto — rótulo fixo, igual em qualquer plataforma. */
export const MES_CURTO_PT_BR = [
  'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.',
] as const;

/** `datetime` = dia + hora; `day` = só o dia (as concluídas usam este). */
export type WorkItemDateFormat = 'datetime' | 'day';

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Diferença em DIAS DE CALENDÁRIO locais (`alvo` − `agora`). Negativo = passado.
 *
 * A conta passa por `localDayKey`/`parseDayKey` (dias ancorados na meia-noite
 * local) em vez de subtrair milissegundos: assim a virada do dia manda, e não a
 * distância em horas — que erra na mudança de horário de verão, quando o dia não
 * tem 24 h.
 */
function diffEmDiasLocais(alvo: Date, agora: Date): number {
  const a = parseDayKey(localDayKey(alvo));
  const b = parseDayKey(localDayKey(agora));
  if (!a || !b) return 0;
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** Rótulo do dia: "Hoje" / "Ontem" / "Amanhã" / "09 out.". */
export function formatWorkItemDay(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  const d = toDate(value);
  if (!d) return null;
  const diff = diffEmDiasLocais(d, now);
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  if (diff === 1) return 'Amanhã';
  return `${pad2(d.getDate())} ${MES_CURTO_PT_BR[d.getMonth()]}`;
}

/**
 * Extrai HH:mm directamente da string ISO quando ela carrega offset explícito
 * (ex.: `17:00:00-03:00`). Preserva a hora tal como gravada pelo banco,
 * independente do fuso do navegador — por isso é correto para strings com
 * offset. Para strings Z (UTC) ou objetos Date, usa getHours() local abaixo.
 */
function extractTimeFromISOOffset(s: string): string | null {
  const m = s.match(/T(\d{2}):(\d{2})(?::\d{2})?[+-]\d{2}:\d{2}$/);
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Hora local "HH:mm". Para strings ISO com offset preserva a hora do offset. */
export function formatWorkItemTime(value: string | Date | null | undefined): string | null {
  if (typeof value === 'string') {
    const fromOffset = extractTimeFromISOOffset(value);
    if (fromOffset) return fromOffset;
  }
  const d = toDate(value);
  if (!d) return null;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * A regra com hora. `format: 'day'` devolve só o dia (o caso das concluídas).
 *
 * Devolve `null` para valor ausente ou inválido — quem chama decide o que
 * mostrar (o rótulo "Sem prazo", por exemplo).
 */
export function formatWorkItemDate(
  value: string | Date | null | undefined,
  opts: { now?: Date; format?: WorkItemDateFormat } = {},
): string | null {
  const dia = formatWorkItemDay(value, opts.now);
  if (dia === null) return null;
  if ((opts.format ?? 'datetime') === 'day') return dia;
  const hora = formatWorkItemTime(value);
  return hora === null ? dia : `${dia}, ${hora}`;
}

/**
 * Campo de data do painel/modal: "Hoje, 11/10" (dd/MM; o ano só aparece fora do
 * ano corrente). A hora vai à parte — ver `formatWorkItemField`.
 */
export function formatWorkItemFieldDate(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  const d = toDate(value);
  if (!d) return null;
  const ddmm = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
  const diff = diffEmDiasLocais(d, now);
  if (diff === 0) return `Hoje, ${ddmm}`;
  if (diff === -1) return `Ontem, ${ddmm}`;
  if (diff === 1) return `Amanhã, ${ddmm}`;
  return d.getFullYear() === now.getFullYear() ? ddmm : `${ddmm}/${d.getFullYear()}`;
}

/** Campo de data+hora do painel/modal: data "Hoje, 11/10" e hora à parte. */
export function formatWorkItemField(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): { date: string | null; time: string | null } {
  return { date: formatWorkItemFieldDate(value, now), time: formatWorkItemTime(value) };
}
