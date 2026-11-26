import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('trilha-contatos');

/**
 * Trilha de exclusões e bloqueios de contato (`contact_deletion_audit` / `contact_block_audit`).
 *
 * As duas tabelas são alimentadas por trigger em `public.contacts` — `audit_contact_deletion_change`
 * (AFTER UPDATE OF deleted_at e AFTER DELETE) e `audit_contact_block_change` (AFTER UPDATE OF
 * blocked_at) — e estavam no banco sem nenhuma tela: mais de mil exclusões registradas com autor e
 * nenhuma forma de consultá-las. A leitura é liberada por RLS apenas para admin/supervisão
 * (`*_select_admin_supervisor` via `is_admin_or_supervisor`), então a tela repete esse mesmo portão.
 */

/** Tamanho da página (uma linha a mais é pedida para provar que existe mais). */
export const CONTACT_AUDIT_PAGE = 200;

export type ContactAuditKind = 'deletion' | 'block';

export type ContactAuditOperation =
  | 'delete'
  | 'restore'
  | 'purge'
  | 'block'
  | 'unblock'
  | 'update_marker';

export type ContactAuditOperationFilter = ContactAuditOperation | 'todas';

/** Janela da consulta em dias; `0` significa tudo. */
export type ContactAuditPeriod = 7 | 30 | 90 | 0;

export const CONTACT_AUDIT_OPERATIONS: Record<ContactAuditKind, ContactAuditOperation[]> = {
  deletion: ['delete', 'restore', 'purge', 'update_marker'],
  block: ['block', 'unblock', 'update_marker'],
};

/** Rótulos das operações do próprio corpo dos triggers (`audit_contact_*_change`). */
export const CONTACT_AUDIT_OPERATION_LABELS: Record<ContactAuditOperation, string> = {
  delete: 'Excluído',
  restore: 'Restaurado',
  purge: 'Purgado',
  block: 'Bloqueado',
  unblock: 'Desbloqueado',
  update_marker: 'Marcador reescrito',
};

export const CONTACT_AUDIT_KIND_LABELS: Record<ContactAuditKind, string> = {
  deletion: 'Exclusões',
  block: 'Bloqueios',
};

export const CONTACT_AUDIT_KINDS: ContactAuditKind[] = ['deletion', 'block'];

export const CONTACT_AUDIT_PERIOD_LABELS: Record<ContactAuditPeriod, string> = {
  7: 'Últimos 7 dias',
  30: 'Últimos 30 dias',
  90: 'Últimos 90 dias',
  0: 'Todo o período',
};

interface ContactAuditSource {
  tabela: 'contact_deletion_audit' | 'contact_block_audit';
  marcadorDe: 'deleted_at_from' | 'blocked_at_from';
  marcadorAte: 'deleted_at_to' | 'blocked_at_to';
}

/** Nomes de coluna do marcador em cada trilha (`deleted_at` vs `blocked_at`). */
export const CONTACT_AUDIT_SOURCES: Record<ContactAuditKind, ContactAuditSource> = {
  deletion: {
    tabela: 'contact_deletion_audit',
    marcadorDe: 'deleted_at_from',
    marcadorAte: 'deleted_at_to',
  },
  block: {
    tabela: 'contact_block_audit',
    marcadorDe: 'blocked_at_from',
    marcadorAte: 'blocked_at_to',
  },
};

export interface ContactAuditFilters {
  kind: ContactAuditKind;
  operation: ContactAuditOperationFilter;
  period: ContactAuditPeriod;
  /** Nome ou telefone do contato (vazio = todos). */
  search: string;
}

export const DEFAULT_CONTACT_AUDIT_FILTERS: ContactAuditFilters = Object.freeze({
  kind: 'deletion',
  operation: 'todas',
  period: 30,
  search: '',
});

export interface ContactAuditContact {
  id: string;
  name: string | null;
  phone: string | null;
  deletedAt: string | null;
  blockedAt: string | null;
}

export interface ContactAuditEvent {
  id: string;
  contactId: string;
  operation: ContactAuditOperation;
  /** Valor do marcador antes da mudança; `null` = "não estava marcado". */
  markerFrom: string | null;
  /** Valor do marcador depois da mudança; `null` = "marcador removido". */
  markerTo: string | null;
  performedAt: string;
  performedBy: string | null;
  performedByProfile: string | null;
  performedByDbRole: string;
  contact: ContactAuditContact | null;
  /** Nome de quem executou, quando o perfil ainda existe. */
  authorName: string | null;
}

export interface ContactAuditPage {
  eventos: ContactAuditEvent[];
  hasMore: boolean;
  proximoOffset: number;
}

interface ContactAuditRow {
  id: string | number;
  contact_id: string;
  operation: string;
  performed_at: string;
  performed_by: string | null;
  performed_by_profile: string | null;
  performed_by_db_role: string;
  [marcador: string]: string | number | null;
}

export function isContactAuditOperation(
  valor: string,
  kind: ContactAuditKind,
): valor is ContactAuditOperation {
  return (CONTACT_AUDIT_OPERATIONS[kind] as string[]).includes(valor);
}

export function isContactAuditKind(valor: string): valor is ContactAuditKind {
  return (CONTACT_AUDIT_KINDS as string[]).includes(valor);
}

/** Data mínima da janela pedida, em ISO (UTC) — o mesmo formato da coluna `performed_at`. */
export function contactAuditSince(period: ContactAuditPeriod, agora = Date.now()): string | null {
  if (period <= 0) return null;
  return new Date(agora - period * 24 * 60 * 60 * 1000).toISOString();
}

/** Busca o contato por nome ou telefone; devolve os ids que a trilha deve filtrar. */
async function fetchContactIds(search: string): Promise<string[]> {
  const termo = search.trim();
  if (!termo) return [];
  const { data, error } = await supabase
    .from('contacts')
    .select('id')
    .or(`name.ilike.%${termo}%,phone.ilike.%${termo}%`)
    .limit(CONTACT_AUDIT_PAGE);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((linha) => linha.id);
}

interface ContactIdentityRow {
  id: string;
  name: string | null;
  phone: string | null;
  deleted_at: string | null;
  blocked_at: string | null;
}

interface ProfileIdentityRow {
  id: string;
  user_id: string | null;
  name: string | null;
}

/**
 * Nomes dos contatos em uma consulta só. Falha aqui não apaga a trilha: a linha continua na tela
 * com o id curto, que é o dado que o banco tem (contato excluído pode não estar mais visível).
 */
async function fetchContacts(ids: string[]): Promise<Map<string, ContactAuditContact>> {
  const mapa = new Map<string, ContactAuditContact>();
  if (ids.length === 0) return mapa;
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone, deleted_at, blocked_at')
    .in('id', ids);
  if (error) {
    log.warn('não consegui ler os contatos da trilha de auditoria', { error });
    return mapa;
  }
  for (const linha of (data ?? []) as ContactIdentityRow[]) {
    mapa.set(linha.id, {
      id: linha.id,
      name: linha.name,
      phone: linha.phone,
      deletedAt: linha.deleted_at,
      blockedAt: linha.blocked_at,
    });
  }
  return mapa;
}

/**
 * Nome de quem executou. O trigger grava `performed_by` (auth.uid) e `performed_by_profile`
 * (`profiles.id`); execuções de serviço não casam com perfil nenhum e aí o autor fica sem nome.
 */
async function fetchAuthors(
  profileIds: string[],
  userIds: string[],
): Promise<Map<string, string>> {
  const nomes = new Map<string, string>();
  const guarda = (linhas: ProfileIdentityRow[]) => {
    for (const linha of linhas) {
      if (!linha.name) continue;
      nomes.set(linha.id, linha.name);
      if (linha.user_id) nomes.set(linha.user_id, linha.name);
    }
  };
  if (profileIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, user_id, name')
      .in('id', profileIds);
    if (error) log.warn('não consegui ler os perfis da trilha de auditoria', { error });
    else guarda((data ?? []) as ProfileIdentityRow[]);
  }
  if (userIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, user_id, name')
      .in('user_id', userIds);
    if (error) log.warn('não consegui ler os perfis da trilha de auditoria', { error });
    else guarda((data ?? []) as ProfileIdentityRow[]);
  }
  return nomes;
}

function mapRow(row: ContactAuditRow, kind: ContactAuditKind): ContactAuditEvent | null {
  if (!isContactAuditOperation(row.operation, kind)) return null;
  const fonte = CONTACT_AUDIT_SOURCES[kind];
  return {
    id: String(row.id),
    contactId: row.contact_id,
    operation: row.operation,
    markerFrom: (row[fonte.marcadorDe] as string | null) ?? null,
    markerTo: (row[fonte.marcadorAte] as string | null) ?? null,
    performedAt: row.performed_at,
    performedBy: row.performed_by,
    performedByProfile: row.performed_by_profile,
    performedByDbRole: row.performed_by_db_role,
    contact: null,
    authorName: null,
  };
}

/**
 * Uma página da trilha, já com contato e autor resolvidos.
 *
 * `CONTACT_AUDIT_PAGE + 1` linhas são pedidas: a linha extra é a prova de que existe mais e não
 * vaza para a tela.
 */
export async function fetchContactAuditPage(
  filtros: ContactAuditFilters,
  offset = 0,
): Promise<ContactAuditPage> {
  const fonte = CONTACT_AUDIT_SOURCES[filtros.kind];
  const colunas = `id, contact_id, operation, ${fonte.marcadorDe}, ${fonte.marcadorAte}, performed_by, performed_by_profile, performed_by_db_role, performed_at`;

  const busca = filtros.search.trim();
  let contactIds: string[] | null = null;
  if (busca) {
    contactIds = await fetchContactIds(busca);
    if (contactIds.length === 0) {
      return { eventos: [], hasMore: false, proximoOffset: offset };
    }
  }

  let consulta = supabase
    .from(fonte.tabela)
    .select(colunas)
    .order('performed_at', { ascending: false })
    .range(offset, offset + CONTACT_AUDIT_PAGE);

  if (filtros.operation !== 'todas') consulta = consulta.eq('operation', filtros.operation);
  const desde = contactAuditSince(filtros.period);
  if (desde) consulta = consulta.gte('performed_at', desde);
  if (contactIds) consulta = consulta.in('contact_id', contactIds);

  const { data, error } = await consulta;
  if (error) throw error;

  // Colunas montadas por tipo: o parser do PostgREST não consegue tipar string dinâmica.
  const linhas = ((data ?? []) as unknown as ContactAuditRow[]).filter(Boolean);
  const hasMore = linhas.length > CONTACT_AUDIT_PAGE;
  const visiveis = hasMore ? linhas.slice(0, CONTACT_AUDIT_PAGE) : linhas;

  const eventos = visiveis
    .map((linha) => mapRow(linha, filtros.kind))
    .filter((evento): evento is ContactAuditEvent => evento !== null);
  if (eventos.length === 0) {
    return { eventos: [], hasMore: false, proximoOffset: offset };
  }

  const [contatos, autores] = await Promise.all([
    fetchContacts([...new Set(eventos.map((e) => e.contactId))]),
    fetchAuthors(
      [...new Set(eventos.map((e) => e.performedByProfile).filter((v): v is string => Boolean(v)))],
      [...new Set(eventos.map((e) => e.performedBy).filter((v): v is string => Boolean(v)))],
    ),
  ]);

  return {
    eventos: eventos.map((evento) => ({
      ...evento,
      contact: contatos.get(evento.contactId) ?? null,
      authorName:
        autores.get(evento.performedByProfile ?? '') ??
        autores.get(evento.performedBy ?? '') ??
        null,
    })),
    hasMore,
    proximoOffset: offset + visiveis.length,
  };
}

export interface ContactAuditTrailData {
  eventos: ContactAuditEvent[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  hasMore: boolean;
  carregandoMais: boolean;
  carregarMais: () => void;
  refetch: () => void;
}

export function useContactAuditTrail(filtros: ContactAuditFilters): ContactAuditTrailData {
  const query = useInfiniteQuery({
    queryKey: ['contact-audit-trail', filtros],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchContactAuditPage(filtros, pageParam),
    getNextPageParam: (ultima) => (ultima.hasMore ? ultima.proximoOffset : undefined),
    staleTime: 30_000,
  });

  return {
    eventos: query.data?.pages.flatMap((pagina) => pagina.eventos) ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    hasMore: Boolean(query.hasNextPage),
    carregandoMais: query.isFetchingNextPage,
    carregarMais: () => void query.fetchNextPage(),
    refetch: () => void query.refetch(),
  };
}
