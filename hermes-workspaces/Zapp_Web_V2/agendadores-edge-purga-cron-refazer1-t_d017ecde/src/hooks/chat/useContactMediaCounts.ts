import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ContactMediaKind } from '@/hooks/chat/useContactMedia';

/**
 * Contagens por tipo da aba Arquivos (etapa 42): a fonte e o BANCO, nao a lista carregada.
 *
 * Antes, os chips somavam os itens ja baixados (capados em 200 e sem pagina), entao um
 * contato com >200 midias fazia o chip "Todos" mentir. Agora cada chip tem a sua contagem
 * exata (`count: 'exact', head: true`, sem trazer linha nenhuma) e as consultas rodam em
 * paralelo. O chip "Todos" usa o MESMO filtro de apagadas da lista (etapa 09), entao ele
 * bate com o badge da aba (RPC `get_conversation_tab_counts`).
 */

export interface ContactMediaCounts {
  all: number;
  image: number;
  video: number;
  audio: number;
  document: number;
  sticker: number;
}

export const EMPTY_CONTACT_MEDIA_COUNTS: ContactMediaCounts = {
  all: 0, image: 0, video: 0, audio: 0, document: 0, sticker: 0,
};

export const contactMediaCountsKey = (contactId: string | null | undefined) =>
  ['media-gallery-counts', contactId] as const;

/** G3/etapa 09: espelha o filtro da lista e o `COALESCE(is_deleted, false) = false` do RPC. */
const NOT_DELETED_OR = 'is_deleted.is.null,is_deleted.eq.false';

/**
 * `message_type` e a coluna que a Evolution preenche para toda midia (`image`, `video`,
 * `audio`, `ptt`, `document`) — por isso a contagem por tipo e feita aqui, e nao derivada dos
 * itens carregados. `ptt` (voz do WhatsApp) conta como audio, como no classificador do hook.
 */
const MESSAGE_TYPES_BY_KIND: Record<ContactMediaKind, string[]> = {
  image: ['image'],
  video: ['video'],
  audio: ['audio', 'ptt'],
  document: ['document'],
  sticker: ['sticker'],
};

function countByKind(contactId: string, kind?: ContactMediaKind) {
  let query = supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
    .not('media_url', 'is', null)
    .or(NOT_DELETED_OR);
  if (kind) query = query.in('message_type', MESSAGE_TYPES_BY_KIND[kind]);
  return query;
}

export async function fetchContactMediaCounts(contactId: string): Promise<ContactMediaCounts> {
  const [all, image, video, audio, document, sticker] = await Promise.all([
    countByKind(contactId),
    countByKind(contactId, 'image'),
    countByKind(contactId, 'video'),
    countByKind(contactId, 'audio'),
    countByKind(contactId, 'document'),
    countByKind(contactId, 'sticker'),
  ]);

  const failure = [all, image, video, audio, document, sticker].find((result) => result.error);
  if (failure?.error) throw failure.error;

  return {
    all: all.count ?? 0,
    image: image.count ?? 0,
    video: video.count ?? 0,
    audio: audio.count ?? 0,
    document: document.count ?? 0,
    sticker: sticker.count ?? 0,
  };
}

export function useContactMediaCounts(contactId: string | null | undefined) {
  const query = useQuery({
    queryKey: contactMediaCountsKey(contactId),
    queryFn: () => fetchContactMediaCounts(contactId as string),
    enabled: !!contactId,
    staleTime: 30_000,
  });

  return {
    counts: query.data ?? EMPTY_CONTACT_MEDIA_COUNTS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
