import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * X088 (CAP-059) — URL utilizável de uma mídia do Talk X na prévia.
 *
 * `https://` (e `blob:`/`data:`) volta como está; caminho do bucket vira URL
 * assinada. A assinatura mora num hook (e não no componente) porque a regra do
 * repositório é: componente não fala com o client do Supabase.
 *
 * Devolve `null` enquanto assina, quando a assinatura falha ou quando o caminho
 * ainda não é o pedido — a prévia nunca mostra a mídia de outro caminho nem
 * inventa uma URL.
 */

/** Bucket de mídia do Talk X. */
export const TALKX_MEDIA_BUCKET = 'talkx-media';

const DIRECT_URL = /^(https?:|blob:|data:)/i;

export function useTalkXMediaUrl(path?: string | null, expiresInSeconds = 3600): string | null {
  const direct = typeof path === 'string' && DIRECT_URL.test(path) ? path : null;
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!path || direct) return;
    // CAP-059 grava o caminho no bucket como `talkx-media/<caminho>`; a chave do
    // objeto é o que vem depois do nome do bucket.
    const objectPath = path.replace(/^talkx-media\//i, '');
    // Resposta atrasada de um caminho anterior não pode virar a URL do atual.
    let cancelled = false;
    void (async () => {
      let url: string | null = null;
      try {
        const { data, error } = await supabase.storage.from(TALKX_MEDIA_BUCKET).createSignedUrl(objectPath, expiresInSeconds);
        url = error ? null : (data?.signedUrl ?? null);
      } catch {
        // Rede/cliente sem resposta: a prévia fica sem a mídia, e o estado não
        // fica preso a uma promessa que nunca resolve.
        url = null;
      }
      if (cancelled) return;
      setSigned({ path, url });
    })();
    return () => {
      cancelled = true;
    };
  }, [direct, expiresInSeconds, path]);

  if (direct) return direct;
  return signed && signed.path === path ? signed.url : null;
}
