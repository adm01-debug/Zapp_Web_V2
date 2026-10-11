import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config/supabase';
import { escapeLikeWildcards } from '@/lib/emailThreadQuery';
import { parseSupabaseStorageObjectUrl, PRIVATE_MEDIA_BUCKETS } from '@/lib/storage_object_reference';

/**
 * SL-XXX — painel "Arquivos da Equipe" (V3): fonte ÚNICA da lista de anexos do
 * Team Chat. Lê `team_messages` e nada mais: quem pode ver o quê já é decidido
 * pela policy de SELECT ("Members can view conversation messages"), que exige
 * `is_team_conversation_member(auth.uid(), conversation_id)`. Por isso a consulta
 * NÃO filtra conversa nem membro — um join com `team_conversation_members` seria
 * uma segunda fonte de verdade e um vazamento em potencial se divergisse da RLS.
 *
 * O que conta como "arquivo": a mensagem tem `media_type` (o CHECK
 * `team_messages_media_consistency` garante que `media_type` e `media_url` nascem
 * juntos; `media_url` é NULL apenas enquanto o bucket próprio ainda não tiver sido
 * gravado). Figurinha, emoji e áudio-meme ficam FORA: são reações montadas a partir
 * de um asset compartilhado, não anexos enviados à conversa.
 *
 * O localizador de leitura (`source`) aceita as duas formas que existem hoje no
 * banco: `media_bucket`+`media_path` (gravado pelo `uploadTeamMedia`) e o
 * `media_url` de histórico — um locator em forma de URL (`/object/public/...`),
 * nunca uma URL assinada válida. As duas são resolvidas por
 * `useResolvedStorageUrl`, que troca o locator por uma assinatura na hora de abrir.
 * O painel NUNCA usa `getPublicUrl`.
 *
 * Busca por nome: o nome do anexo vive em `content` (o uploader grava o
 * `file.name` ali). O termo é escapado antes de virar `ilike` (ver
 * `escapeLikeWildcards`) e a coluna tem índice trigram (`idx_team_messages_content_trgm`).
 * O filtro de tipo sai de `media_type`, nunca de URL.
 */

export type TeamFileKind = 'image' | 'document' | 'audio' | 'other';

export interface TeamFilesFilters {
  /** Trecho do nome do anexo. Vazio/ausente = sem busca. */
  search?: string | null;
  /** Tipo do anexo. Ausente = todos. */
  kind?: TeamFileKind | null;
}

export interface TeamFileItem {
  id: string;
  conversationId: string;
  senderId: string;
  /** Nome de exibição do remetente (fallback: 8 primeiros do id). */
  senderName: string;
  /** Nome do arquivo; cai para o último segmento do caminho quando `content` está vazio. */
  name: string;
  /** `media_type` cru do banco. */
  mediaType: string;
  kind: TeamFileKind;
  createdAt: string;
  /** Locator durável para `useResolvedStorageUrl`. */
  source: string;
}

export interface TeamFilesCursor {
  createdAt: string;
  id: string;
}

export interface TeamFilesPage {
  items: TeamFileItem[];
  nextCursor: TeamFilesCursor | null;
}

export interface TeamFilesState {
  items: TeamFileItem[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => void;
}

/** Tipos de mídia que NÃO são anexos (reações/figurinhas): ficam fora do painel. */
export const TEAM_FILE_REACTION_MEDIA_TYPES = ['sticker', 'emoji', 'audio_meme'] as const;

/** Mesmo conjunto em forma de lookup, para o descarte defensivo no mapeamento. */
const REACTION_MEDIA_TYPES: Record<string, true> = Object.fromEntries(
  TEAM_FILE_REACTION_MEDIA_TYPES.map((tipo) => [tipo, true as const]),
);

export const TEAM_FILES_PAGE_SIZE = 50;

/**
 * Termo de busca saneado (aparado). NÃO escapa curingas: o termo cru compõe a
 * chave de cache e é escapado UMA vez na hora de montar o `ilike`
 * (`teamFilesLikePattern`) — escapar nos dois pontos duplicaria as contrabarras.
 */
export function teamFilesSearchTerm(search: string | null | undefined): string {
  return (search ?? '').trim().slice(0, 120);
}

/** Padrão `ilike` do termo já saneado: curingas do usuário viram literal. */
export function teamFilesLikePattern(term: string): string {
  return `%${escapeLikeWildcards(term)}%`;
}

/** Chave de cache do painel. Vive no módulo porque é só dele. */
export const teamFilesQueryKey = (search: string, kind: TeamFileKind | null) =>
  ['team-files', kind ?? null, search] as const;

/** Tipo do anexo a partir do `media_type`. Valor desconhecido cai em `other`. */
export function teamFileKind(mediaType: string | null | undefined): TeamFileKind {
  if (mediaType === 'image') return 'image';
  if (mediaType === 'document') return 'document';
  if (mediaType === 'audio') return 'audio';
  return 'other';
}

interface TeamFileRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_type: string | null;
  media_bucket: string | null;
  media_path: string | null;
  media_url: string | null;
  created_at: string;
  sender: { name: string | null } | { name: string | null }[] | null;
}

const SELECT_COLUMNS =
  'id, conversation_id, sender_id, content, media_type, media_bucket, media_path, media_url, created_at, sender:profiles!team_messages_sender_id_fkey(name)';

/** Nome de exibição do anexo. */
export function teamFileName(content: string | null, source: string): string {
  const nome = (content ?? '').trim();
  if (nome) return nome;
  const referencia = parseSupabaseStorageObjectUrl(source, PRIVATE_MEDIA_BUCKETS);
  const ultimo = (referencia?.path ?? source).split('/').filter(Boolean).pop();
  return ultimo ?? 'Arquivo';
}

/**
 * Locator durável do anexo: prefere `media_bucket`+`media_path` (a forma atual,
 * independente de host) e cai para o `media_url` de histórico. Devolve `null`
 * quando não há nada que o `useResolvedStorageUrl` consiga abrir.
 */
export function teamFileSource(
  row: Pick<TeamFileRow, 'media_bucket' | 'media_path' | 'media_url'>,
): string | null {
  if (row.media_bucket && row.media_path) {
    return `${SUPABASE_URL}/storage/v1/object/${row.media_bucket}/${row.media_path}`;
  }
  const legado = (row.media_url ?? '').trim();
  return legado === '' ? null : legado;
}

function senderNameOf(sender: TeamFileRow['sender'], senderId: string): string {
  const registro = Array.isArray(sender) ? sender[0] : sender;
  const nome = registro?.name?.trim();
  return nome && nome !== '' ? nome : senderId.slice(0, 8);
}

function mapRowToItem(row: TeamFileRow): TeamFileItem | null {
  const source = teamFileSource(row);
  // Defensivo (mesmo com o filtro no banco): reação não é anexo e linha sem
  // locator não tem o que abrir — nenhuma das duas entra na lista.
  if (!source || !row.media_type || !!REACTION_MEDIA_TYPES[row.media_type]) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: senderNameOf(row.sender, row.sender_id),
    name: teamFileName(row.content, source),
    mediaType: row.media_type,
    kind: teamFileKind(row.media_type),
    createdAt: row.created_at,
    source,
  };
}

/**
 * Uma página por keyset `(created_at, id)` — mesma paginação de `useContactMedia`.
 * `limit(PAGE+1)` diz se existe próxima página sem disparar uma consulta vazia, e
 * a ordenação dupla (data, id) mantém a fatia estável mesmo com empates de data.
 */
export async function fetchTeamFilesPage(
  filters: TeamFilesFilters,
  cursor: TeamFilesCursor | null,
): Promise<TeamFilesPage> {
  let query = supabase
    .from('team_messages')
    .select(SELECT_COLUMNS)
    .not('media_type', 'is', null)
    .not('media_type', 'in', `(${TEAM_FILE_REACTION_MEDIA_TYPES.join(',')})`);

  const kind = filters.kind ?? null;
  if (kind === 'other') {
    query = query.not('media_type', 'in', '(image,document,audio)');
  } else if (kind) {
    query = query.eq('media_type', kind);
  }

  const term = teamFilesSearchTerm(filters.search);
  if (term) query = query.ilike('content', teamFilesLikePattern(term));

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(TEAM_FILES_PAGE_SIZE + 1);
  if (error) throw error;

  const rows = (data ?? []) as unknown as TeamFileRow[];
  const hasNext = rows.length > TEAM_FILES_PAGE_SIZE;
  const page = rows.slice(0, TEAM_FILES_PAGE_SIZE);
  const items = page
    .map(mapRowToItem)
    .filter((item): item is TeamFileItem => item !== null);

  const last = page[page.length - 1];
  const nextCursor = hasNext && last ? { createdAt: last.created_at, id: last.id } : null;
  return { items, nextCursor };
}

export function useTeamFiles(filters: TeamFilesFilters = {}): TeamFilesState {
  const search = teamFilesSearchTerm(filters.search);
  const kind = filters.kind ?? null;

  const query = useInfiniteQuery({
    queryKey: teamFilesQueryKey(search, kind),
    queryFn: ({ pageParam }) => fetchTeamFilesPage({ search, kind }, pageParam),
    initialPageParam: null as TeamFilesCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 60_000,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasMore: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: () => {
      void query.refetch();
    },
  };
}
