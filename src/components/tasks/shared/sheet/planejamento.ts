/**
 * Regras de apresentação da seção Planejamento do painel de detalhes
 * (etapas 137–140 do plano de Tarefas).
 */

/** Tom do aviso do lembrete — cada um casa com um token de texto do design. */
export type TomAviso = 'success' | 'warning' | 'destructive';

export interface AvisoLembrete {
  tom: TomAviso;
  texto: string;
}

export const TEXTO_AGENDADO = 'Agendado';

const MES_CURTO_PT_BR = [
  'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.',
] as const;

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function localDayKey(value: Date): string {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function diffEmDiasLocais(alvo: Date, agora: Date): number {
  return Math.round((parseDayKey(localDayKey(alvo)).getTime() - parseDayKey(localDayKey(agora)).getTime()) / 86_400_000);
}

/**
 * Etapa 138 — o lembrete combina com o prazo?
 * - lembrete no passado: vermelho;
 * - lembrete depois do prazo: âmbar;
 * - antes do prazo, ou sem prazo: verde, Agendado.
 */
export function avaliarLembrete(
  remindAtIso: string | null,
  dueIso: string | null,
  agora: Date = new Date(),
): AvisoLembrete | null {
  if (!remindAtIso) return null;
  const lembrete = new Date(remindAtIso).getTime();
  if (Number.isNaN(lembrete)) return null;

  if (lembrete < agora.getTime()) {
    return { tom: 'destructive', texto: 'Lembrete no passado' };
  }
  if (dueIso) {
    const prazo = new Date(dueIso).getTime();
    if (!Number.isNaN(prazo) && lembrete > prazo) {
      return { tom: 'warning', texto: 'Lembrete depois do prazo' };
    }
  }
  return { tom: 'success', texto: TEXTO_AGENDADO };
}

/** Campo de data do painel: Hoje, 11/10; Amanhã, 12/10; ou dd/MM(/aaaa). */
export function formatPlanejamentoDate(
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

export function formatPlanejamentoTime(value: string | Date | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatCriadaEm(createdAt: string | null | undefined): string | null {
  const d = toDate(createdAt);
  if (!d) return null;
  return `Criada em ${d.getDate()} ${MES_CURTO_PT_BR[d.getMonth()]} ${d.getFullYear()}`;
}
