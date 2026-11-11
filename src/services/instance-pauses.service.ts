import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('InstancePausesService');

/**
 * Pausas de instância (IP1, `instance_pauses`) com a investigação do IP2
 * (`mark_pause_investigated`). Único ponto do front que fala com essa tabela/RPC.
 */
export interface InstancePause {
  id: string;
  instance: string;
  paused_until: string;
  reason: string;
  auto: boolean;
  resumed_at: string | null;
  created_at: string;
  investigated_at: string | null;
  investigation_notes: string | null;
}

/** Limite e proibição de `<`/`>` são os MESMOS CHECKs da migration IP2 (banco recusa igual). */
export const PAUSE_NOTES_MAX_LENGTH = 1000;
export const PAUSES_LIST_LIMIT = 50;

export const PAUSES_LOAD_ERROR = 'Não foi possível carregar as pausas de instância.';

const SELECT_COLUMNS =
  'id, instance, paused_until, reason, auto, resumed_at, created_at, investigated_at, investigation_notes';

/** Valida as notas como o banco: em branco = sem nota; devolve a mensagem do erro ou `null`. */
export function validateInvestigationNotes(notes: string): string | null {
  const trimmed = notes.trim();
  if (trimmed.length > PAUSE_NOTES_MAX_LENGTH) {
    return `As notas passam de ${PAUSE_NOTES_MAX_LENGTH} caracteres.`;
  }
  if (/[<>]/.test(trimmed)) {
    return 'As notas não podem conter os caracteres < ou >.';
  }
  return null;
}

type DbError = { message: string; code?: string } | null;

/**
 * `types.ts` é gerado do banco e só ganha `instance_pauses`/`mark_pause_investigated` depois
 * que a migration IP1 (20261011183812) e esta (20261026200300) forem aplicadas e o workflow
 * types-sync rodar; então este cast vira `supabase.from(...)`/`supabase.rpc(...)` direto.
 * Mesmo padrão de `fetchInboxSilence`. O retorno é `unknown` e validado linha a linha.
 */
type PendingPausesClient = {
  from: (table: 'instance_pauses') => {
    select: (columns: string) => {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => { limit: (n: number) => PromiseLike<{ data: unknown; error: DbError }> };
    };
  };
  rpc: (
    fn: 'mark_pause_investigated',
    args: { p_pause_id: string; p_notes: string | null },
  ) => PromiseLike<{ data: unknown; error: DbError }>;
};

const pending = () => supabase as unknown as PendingPausesClient;

const toText = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

function mapPause(raw: Record<string, unknown>): InstancePause | null {
  const id = toText(raw.id);
  const instance = toText(raw.instance);
  const pausedUntil = toText(raw.paused_until);
  if (!id || !instance || !pausedUntil) return null;
  return {
    id,
    instance,
    paused_until: pausedUntil,
    reason: toText(raw.reason) ?? '',
    auto: raw.auto === true,
    resumed_at: toText(raw.resumed_at),
    created_at: toText(raw.created_at) ?? pausedUntil,
    investigated_at: toText(raw.investigated_at),
    investigation_notes: toText(raw.investigation_notes),
  };
}

/** Pausas mais recentes primeiro (RLS: só admin/supervisor enxerga linhas). Lança em caso de erro. */
export async function fetchInstancePauses(): Promise<InstancePause[]> {
  const { data, error } = await pending()
    .from('instance_pauses')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(PAUSES_LIST_LIMIT);
  if (error) {
    log.error(PAUSES_LOAD_ERROR, error);
    throw new Error(PAUSES_LOAD_ERROR);
  }
  const rows: InstancePause[] = [];
  for (const raw of Array.isArray(data) ? data : []) {
    const row = mapPause(raw as Record<string, unknown>);
    if (row) rows.push(row);
  }
  return rows;
}

/** Mensagem pt-BR por SQLSTATE/código da RPC; nunca repassa o texto cru do banco. */
export function investigationErrorMessage(error: NonNullable<DbError>): string {
  const text = `${error.code ?? ''} ${error.message ?? ''}`;
  if (text.includes('sem_permissao_para_investigar_pausa') || error.code === '42501') {
    return 'Só administradores e supervisores podem marcar uma pausa como investigada.';
  }
  if (text.includes('pausa_nao_encontrada') || error.code === 'P0002') {
    return 'Essa pausa não existe mais. Atualize a lista.';
  }
  if (text.includes('notas_acima_do_limite')) {
    return `As notas passam de ${PAUSE_NOTES_MAX_LENGTH} caracteres.`;
  }
  if (text.includes('notas_com_html')) {
    return 'As notas não podem conter os caracteres < ou >.';
  }
  return 'Não foi possível marcar a pausa como investigada.';
}

export interface MarkInvestigatedResult {
  id: string;
  investigated_at: string | null;
  investigation_notes: string | null;
  /** `true` quando alguém já tinha investigado: o 1º ator/data ficam congelados. */
  ja_investigada: boolean;
}

/** Chama a RPC `mark_pause_investigated` (admin/supervisor; 1 linha de auditoria por chamada). */
export async function markPauseInvestigated(
  pauseId: string,
  notes: string,
): Promise<MarkInvestigatedResult> {
  const invalid = validateInvestigationNotes(notes);
  if (invalid) throw new Error(invalid);
  const trimmed = notes.trim();
  const { data, error } = await pending().rpc('mark_pause_investigated', {
    p_pause_id: pauseId,
    p_notes: trimmed === '' ? null : trimmed,
  });
  if (error) {
    log.error('mark_pause_investigated falhou', error);
    throw new Error(investigationErrorMessage(error));
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    id: toText(raw.id) ?? pauseId,
    investigated_at: toText(raw.investigated_at),
    investigation_notes: toText(raw.investigation_notes),
    ja_investigada: raw.ja_investigada === true,
  };
}
