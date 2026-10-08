import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config/supabase';
import { getMediaType, getFilename } from '@/components/inbox/media-gallery/mediaUtils';
import { parseSupabaseStorageObjectUrl, PRIVATE_MEDIA_BUCKETS } from '@/lib/storage_object_reference';

export type ContactMediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

/** `senderLabel` do atendente. Nunca "Você": a consulta nao traz o autor da mensagem. */
export const AGENT_SENDER_LABEL = 'Atendente';

export interface ContactMediaItem {
  id: string;
  url: string;
  type: ContactMediaKind;
  filename: string;
  /** Nome legivel: o `media_filename` quando e nome humano, senao "<Tipo> · dd/MM HH:mm". */
  displayName: string;
  /** Extensao em minusculas (do `media_filename` ou do path), sem ponto. */
  extension: string | null;
  /** Rotulo do remetente quando ele e o atendente; `null` = contato (a UI usa o nome dele). */
  senderLabel: string | null;
  created_at: string;
  caption: string | null;
  mimetype: string | null;
  size: number | null;
  meta: Record<string, unknown> | null;
  sender: string | null;
  /** URL assinada em lote (etapa 10) - so para objeto de bucket privado. */
  signedUrl?: string;
  /** Epoch (ms) em que `signedUrl` expira; ausente quando a URL e publica/legivel. */
  expiresAt?: number;
}

/** Cursor de keyset `(created_at, id)` (etapa 41): posicao estavel mesmo com empate de data. */
export interface ContactMediaCursor {
  createdAt: string;
  id: string;
}

/** Uma pagina do keyset; `nextCursor` nulo quando a pagina veio incompleta (fim da lista). */
export interface ContactMediaPage {
  items: ContactMediaItem[];
  nextCursor: ContactMediaCursor | null;
}

export interface ContactMediaState {
  items: ContactMediaItem[];
  /** Ha uma proxima pagina nao carregada. */
  hasMore: boolean;
  /** Primeira carga (nenhuma pagina ainda) — controla o skeleton do modo. */
  isLoading: boolean;
  /** Pagina seguinte em voo — controla o skeleton do fim. */
  isFetchingNextPage: boolean;
  isError: boolean;
  error: unknown;
  /** Busca a proxima pagina (botao "Carregar mais"/sentinela). */
  fetchNextPage: () => Promise<{ hasNextPage: boolean } | undefined>;
  /** Refaz a consulta do zero. */
  refetch: () => void;
}

export const contactMediaKey = (contactId: string | null | undefined) => ['media-gallery', contactId] as const;

const SIGNED_URL_TTL_SECONDS = 3600;
/**
 * Tamanho da pagina (etapa 41). A consulta pede um a mais para saber se ha proxima pagina
 * sem uma segunda ida ao banco.
 */
export const MEDIA_PAGE_SIZE = 60;
const STORAGE_ORIGINS = [new URL(SUPABASE_URL).origin] as const;
const TYPE_LABEL: Record<ContactMediaKind, string> = {
  image: 'Imagem', video: 'Vídeo', audio: 'Áudio', document: 'Documento', sticker: 'Figurinha',
};

/**
 * G3/etapa 09: apagada nao volta para a galeria. `is_deleted` e boolean NULL no catalogo,
 * entao NULL conta como nao apagada — `.eq(false)` esconderia mensagens antigas.
 */
const NOT_DELETED_OR = 'is_deleted.is.null,is_deleted.eq.false';

const SELECT_COLUMNS =
  'id, media_url, message_type, media_type, media_mimetype, media_filename, media_size, media_meta, caption, content, sender, ptt, created_at';

/** Nome tecnico do WhatsApp: hex/underscore sem nenhuma palavra (ex.: 3EB0E6947FC0A0ECAED14D_1790283276022). */
const TECHNICAL_FILENAME = /^[0-9a-fA-F_-]{14,}$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** "dd/MM HH:mm" no fuso local. */
export function shortDateTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function extensionOf(filename: string | null, url: string): string | null {
  let source = filename?.trim() || '';
  if (!source) {
    try {
      const clean = decodeURIComponent(url.split(/[?#]/, 1)[0]);
      source = clean.split('/').pop() ?? '';
    } catch {
      return null;
    }
  }
  const match = /\.([a-z0-9]{1,8})$/i.exec(source);
  return match ? match[1].toLowerCase() : null;
}

export function isTechnicalFilename(filename: string, extension: string | null): boolean {
  const base = extension && filename.toLowerCase().endsWith(`.${extension}`)
    ? filename.slice(0, -(extension.length + 1))
    : filename;
  return TECHNICAL_FILENAME.test(base.trim());
}

/** Nome humano se houver; senao "<Tipo> · dd/MM HH:mm" - nunca um hash na cara do operador. */
export function displayNameOf(
  filename: string | null,
  type: ContactMediaKind,
  createdAt: string | null,
  url: string,
): string {
  const extension = extensionOf(filename, url);
  const trimmed = filename?.trim();
  if (trimmed && !isTechnicalFilename(trimmed, extension)) return trimmed;
  const stamp = shortDateTime(createdAt);
  return stamp ? `${TYPE_LABEL[type]} · ${stamp}` : TYPE_LABEL[type];
}

/** Classifica pelo media_type/media_mimetype reais (mais confiável); cai para
 * a heurística por extensão/message_type só em registros antigos sem esses campos. */
function classify(
  mediaType: string | null,
  mimetype: string | null,
  messageType: string,
  url: string,
  ptt: boolean | null,
): ContactMediaKind {
  // Figurinha tem tipo próprio no banco (`message_type = 'sticker'`, gravado pelo webhook) e
  // decide ANTES do MIME e da extensão: ela chega como `image/webp` — ou sem MIME nenhum —
  // e sem esta linha cairia em "Imagens" (484 figurinhas contra 3.600 imagens no banco real).
  if (messageType === 'sticker') return 'sticker';
  const mt = mediaType || mimetype || '';
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('video/')) return 'video';
  if (mt.startsWith('audio/') || ptt) return 'audio';
  if (mt) return 'document';
  return getMediaType(url, messageType);
}

/** Assina em lote, um request por bucket (etapa 10): N `createSignedUrls` viram 1-2 chamadas. */
async function signInBatch(
  items: ContactMediaItem[],
): Promise<Map<string, { signedUrl: string; expiresAt: number }>> {
  const byBucket = new Map<string, { id: string; path: string }[]>();
  for (const item of items) {
    const reference = parseSupabaseStorageObjectUrl(item.url, PRIVATE_MEDIA_BUCKETS, STORAGE_ORIGINS);
    if (!reference) continue;
    const list = byBucket.get(reference.bucket) ?? [];
    list.push({ id: item.id, path: reference.path });
    byBucket.set(reference.bucket, list);
  }

  const result = new Map<string, { signedUrl: string; expiresAt: number }>();
  const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;

  await Promise.all(
    Array.from(byBucket.entries()).map(async ([bucket, entries]) => {
      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrls(entries.map((entry) => entry.path), SIGNED_URL_TTL_SECONDS);
        if (error) return; // item fica sem signedUrl; o consumidor cai no refresh individual
        const byPath = new Map(entries.map((entry) => [entry.path, entry.id]));
        for (const signed of data ?? []) {
          const id = byPath.get(signed.path ?? '');
          if (id && signed.signedUrl) result.set(id, { signedUrl: signed.signedUrl, expiresAt });
        }
      } catch {
        // Assinatura em lote e otimizacao: falhar aqui nao pode esconder a galeria.
        // Os itens afetados ficam sem `signedUrl` e o consumidor resolve um a um.
      }
    }),
  );

  return result;
}

interface MediaRow {
  id: string;
  media_url: string | null;
  message_type: string;
  media_type: string | null;
  media_mimetype: string | null;
  media_filename: string | null;
  media_size: number | null;
  media_meta: Record<string, unknown> | null;
  caption: string | null;
  content: string | null;
  sender: string | null;
  ptt: boolean | null;
  created_at: string;
}

function mapRowToItem(m: MediaRow): ContactMediaItem {
  const url = m.media_url as string;
  const type = classify(m.media_type, m.media_mimetype, m.message_type, url, m.ptt);
  const filename = m.media_filename || getFilename(url);
  return {
    id: m.id,
    url,
    type,
    filename,
    displayName: displayNameOf(m.media_filename ?? null, type, m.created_at, url),
    extension: extensionOf(m.media_filename ?? null, url),
    senderLabel: m.sender === 'agent' ? AGENT_SENDER_LABEL : null,
    created_at: m.created_at,
    // useFileUploadLogic grava a legenda em 'content', nao em 'caption'
    caption: m.caption ?? m.content ?? null,
    mimetype: m.media_mimetype ?? null,
    size: m.media_size ?? null,
    meta: m.media_meta ?? null,
    sender: m.sender ?? null,
  };
}

/**
 * Etapa 41: paginacao real por keyset `(created_at, id)`, 60 por pagina. O cursor entra como
 * um SEGUNDO `.or()` (o PostgREST ANDa multiplos `or`); o primeiro `.or()` segue sendo o filtro
 * de apagadas da etapa 09, entao o primeiro page e byte a byte o mesmo filtro de antes.
 */
export async function fetchMediaPage(
  contactId: string,
  cursor: ContactMediaCursor | null,
): Promise<ContactMediaPage> {
  let query = supabase
    .from('messages')
    .select(SELECT_COLUMNS)
    .eq('contact_id', contactId)
    .not('media_url', 'is', null)
    .or(NOT_DELETED_OR);

  if (cursor) {
    // < (created_at, id): data anterior OU mesma data com id menor (desempate estavel).
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MEDIA_PAGE_SIZE + 1);
  if (error) throw error;

  const rows = (data ?? []) as MediaRow[];
  const hasNext = rows.length > MEDIA_PAGE_SIZE;
  const page = rows.slice(0, MEDIA_PAGE_SIZE);
  const items = page.filter((m) => m.media_url).map(mapRowToItem);

  const signed = await signInBatch(items);
  for (const item of items) {
    const found = signed.get(item.id);
    if (found) {
      item.signedUrl = found.signedUrl;
      item.expiresAt = found.expiresAt;
    }
  }

  const last = page[page.length - 1];
  const nextCursor = hasNext && last ? { createdAt: last.created_at, id: last.id } : null;
  return { items, nextCursor };
}

export function useContactMedia(contactId: string | null | undefined): ContactMediaState {
  const query = useInfiniteQuery({
    queryKey: contactMediaKey(contactId),
    queryFn: ({ pageParam }) => fetchMediaPage(contactId as string, pageParam),
    initialPageParam: null as ContactMediaCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!contactId,
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    items,
    hasMore: !!query.hasNextPage,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    refetch: () => { void query.refetch(); },
  };
}
