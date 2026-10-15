import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('LinkPreview');

// Mesmo recorte usado para as mensagens RECEBIDAS
// (`supabase/functions/_shared/evolution-webhook-messages.ts`): a prévia é do
// primeiro http(s) do texto, sem a pontuação que costuma colar na URL.
const URL_REGEX = /https?:\/\/[^\s<>"'`]+/i;

/** Teto do egresso de Open Graph. Passou disso, a prévia simplesmente não sai. */
export const LINK_PREVIEW_TIMEOUT_MS = 8_000;

/** Primeiro link do texto, ou `null` quando não há link. */
export function extractFirstLink(content: string): string | null {
  const match = content.match(URL_REGEX);
  if (!match) return null;
  const url = match[0].replace(/[).,;!?]+$/, '');
  return url.length > 0 ? url : null;
}

/**
 * Busca a prévia (Open Graph) do primeiro link de uma mensagem ENVIADA e a grava
 * em `messages.link_preview`, como o webhook já faz para as recebidas.
 *
 * Só é chamado depois do aceite do envio: a prévia é bônus. Não bloqueia o
 * retorno do envio, nunca lança para quem chamou e nenhum log carrega o texto ou
 * a URL da mensagem.
 */
export async function enrichSentMessageLinkPreview(
  messageId: string,
  content: string,
): Promise<void> {
  const url = extractFirstLink(content);
  if (!url) return;
  try {
    const { data, error } = await supabase.functions.invoke('fetch-link-preview', {
      body: { url },
      signal: AbortSignal.timeout(LINK_PREVIEW_TIMEOUT_MS),
    });
    if (error || !data?.preview) return;
    await supabase
      .from('messages')
      .update({ link_preview: data.preview })
      .eq('id', messageId);
  } catch (err) {
    log.warn('Prévia de link não gerada (a mensagem já foi aceita)', {
      messageId,
      erro: err instanceof Error ? err.message : String(err),
    });
  }
}
