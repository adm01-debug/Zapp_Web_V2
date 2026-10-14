import type { InfiniteData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryClient } from '@/lib/queryClient';
import type { ContactMediaPage } from '@/hooks/chat/useContactMedia';

/**
 * Recuperação, no front, de mídia do WhatsApp cuja URL de CDN venceu.
 *
 * A Edge `recover-message-media` faz o trabalho pesado (rebaixa a mídia pela Evolution e grava
 * o locator permanente). Aqui ficam só as três coisas que o hook de assinatura precisa saber:
 * como chamar a Edge, o teto de tentativas por objeto (memória do módulo) e como ler/escrever o
 * par (url → id da mensagem) no cache de mídia do React Query — é desse cache que sai o
 * identificador da mensagem, sem inventar um segundo índice que possa divergir dele.
 */

/** Raiz da chave da consulta de mídia por contato (`contactMediaKey`). */
export const CONTACT_MEDIA_QUERY_ROOT = 'media-gallery';

/** Status que a Edge pode devolver (contrato de `recover-message-media`). */
export type MediaRecoveryStatus = 'ok' | 'ja_permanente' | 'indisponivel' | 'negado';

export interface MediaRecoveryOutcome {
  status: MediaRecoveryStatus;
  /** Locator permanente do objeto; `null` quando a Edge não recuperou nada. */
  mediaUrl: string | null;
}

/** Teto de tentativas por objeto dentro da janela (memória do módulo). */
export const MAX_RECOVERY_ATTEMPTS = 3;
/** Janela do teto: as tentativas antigas saem da conta e uma nova rodada é permitida. */
export const RECOVERY_WINDOW_MS = 10 * 60 * 1000;

const attemptHistory = new Map<string, number[]>();
const exhaustedKeys = new Set<string>();

/**
 * Objeto dado como sem recuperação possível (`negado`): nem o teto se aplica, a resposta é
 * definitiva. Fica assim até recarregar a página.
 */
export function isRecoveryExhausted(objectKey: string): boolean {
  return exhaustedKeys.has(objectKey);
}

export function markRecoveryExhausted(objectKey: string): void {
  exhaustedKeys.add(objectKey);
}

/** Tentativas ainda permitidas para o objeto na janela atual (0 = teto atingido). */
export function recoveryAttemptsLeft(objectKey: string, now: number = Date.now()): number {
  const recent = (attemptHistory.get(objectKey) ?? []).filter((at) => now - at < RECOVERY_WINDOW_MS);
  attemptHistory.set(objectKey, recent);
  return Math.max(0, MAX_RECOVERY_ATTEMPTS - recent.length);
}

export function registerRecoveryAttempt(objectKey: string, now: number = Date.now()): void {
  attemptHistory.set(objectKey, [...(attemptHistory.get(objectKey) ?? []), now]);
}

/** Id da mensagem dona de `url` na consulta de mídia (o par url → id), ou `null`. */
export function findMessageIdByMediaUrl(url: string): string | null {
  if (!url) return null;
  const entries = queryClient.getQueriesData<InfiniteData<ContactMediaPage>>({
    queryKey: [CONTACT_MEDIA_QUERY_ROOT],
  });
  for (const [, data] of entries) {
    for (const page of data?.pages ?? []) {
      const hit = page.items.find((item) => item.url === url || item.signedUrl === url);
      if (hit) return hit.id;
    }
  }
  return null;
}

/**
 * Troca, no cache de mídia, o locator vencido da mensagem pelo permanente que a Edge gravou e
 * descarta a assinatura em lote (que apontava para o objeto antigo). Devolve `true` quando
 * algo mudou, para o chamador saber se o cache já está com a URL nova.
 */
export function replaceMediaUrlInCache(messageId: string, mediaUrl: string): boolean {
  let changed = false;
  queryClient.setQueriesData<InfiniteData<ContactMediaPage>>(
    { queryKey: [CONTACT_MEDIA_QUERY_ROOT] },
    (data) => {
      if (!data?.pages?.length) return data;
      let pageChanged = false;
      const pages = data.pages.map((page) => {
        const items = page.items.map((item) => {
          if (item.id !== messageId) return item;
          pageChanged = true;
          const next = { ...item, url: mediaUrl };
          delete next.signedUrl;
          delete next.expiresAt;
          return next;
        });
        return pageChanged ? { ...page, items } : page;
      });
      if (!pageChanged) return data;
      changed = true;
      return { ...data, pages };
    },
  );
  return changed;
}

/** Valida a resposta da Edge sem aceitar status desconhecido como sucesso. */
export function parseRecoveryBody(data: unknown): MediaRecoveryOutcome {
  const body = (data ?? {}) as Record<string, unknown>;
  const status = body.status;
  if (status !== 'ok' && status !== 'ja_permanente' && status !== 'indisponivel' && status !== 'negado') {
    throw new Error('Resposta inesperada da recuperação de mídia');
  }
  const rawUrl = body.media_url;
  const mediaUrl = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl : null;
  return { status, mediaUrl };
}

/**
 * Chama a Edge para a mensagem. Nunca loga URL nem token: o identificador e a mídia ficam na
 * resposta, que é descartada aqui se o status não for conhecido.
 */
export async function recoverMessageMedia(
  messageId: string,
  signal?: AbortSignal,
): Promise<MediaRecoveryOutcome> {
  const { data, error } = await supabase.functions.invoke('recover-message-media', {
    body: { message_id: messageId },
    signal,
  });
  // O FunctionsClient devolve erro em vez de lançar (rede, HTTP, abort): quem chama decide.
  if (error) throw error;
  return parseRecoveryBody(data);
}
