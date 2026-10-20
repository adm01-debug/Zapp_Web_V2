import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getMediaType, getFilename } from '@/components/inbox/media-gallery/mediaUtils';

export type ContactMediaKind = 'image' | 'video' | 'audio' | 'document';

export interface ContactMediaItem {
  id: string;
  url: string;
  type: ContactMediaKind;
  filename: string;
  created_at: string;
  caption: string | null;
  mimetype: string | null;
  size: number | null;
  meta: Record<string, unknown> | null;
  sender: string | null;
}

export interface ContactMediaCounts {
  all: number;
  image: number;
  video: number;
  audio: number;
  document: number;
}

export const contactMediaKey = (contactId: string | null | undefined) => ['media-gallery', contactId] as const;

/** Classifica pelo media_type/media_mimetype reais (mais confiável); cai para
 * a heurística por extensão/message_type só em registros antigos sem esses campos. */
function classify(
  mediaType: string | null,
  mimetype: string | null,
  messageType: string,
  url: string,
  ptt: boolean | null,
): ContactMediaKind {
  const mt = mediaType || mimetype || '';
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('video/')) return 'video';
  if (mt.startsWith('audio/') || ptt) return 'audio';
  if (mt) return 'document';
  return getMediaType(url, messageType);
}

export function useContactMedia(contactId: string | null | undefined) {
  return useQuery({
    queryKey: contactMediaKey(contactId),
    queryFn: async (): Promise<{ items: ContactMediaItem[]; counts: ContactMediaCounts }> => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, media_url, message_type, media_type, media_mimetype, media_filename, media_size, media_meta, caption, content, sender, ptt, created_at')
        .eq('contact_id', contactId as string)
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      const items: ContactMediaItem[] = (data || [])
        .filter((m) => m.media_url)
        .map((m) => ({
          id: m.id,
          url: m.media_url as string,
          type: classify(m.media_type, m.media_mimetype, m.message_type, m.media_url as string, m.ptt),
          filename: m.media_filename || getFilename(m.media_url as string),
          created_at: m.created_at,
          // useFileUploadLogic grava a legenda em 'content', nao em 'caption'
          caption: m.caption ?? m.content ?? null,
          mimetype: m.media_mimetype ?? null,
          size: m.media_size ?? null,
          meta: (m.media_meta as Record<string, unknown> | null) ?? null,
          sender: m.sender ?? null,
        }));

      const counts: ContactMediaCounts = {
        all: items.length,
        image: items.filter((i) => i.type === 'image').length,
        video: items.filter((i) => i.type === 'video').length,
        audio: items.filter((i) => i.type === 'audio').length,
        document: items.filter((i) => i.type === 'document').length,
      };

      return { items, counts };
    },
    enabled: !!contactId,
    staleTime: 5 * 60 * 1000,
  });
}
