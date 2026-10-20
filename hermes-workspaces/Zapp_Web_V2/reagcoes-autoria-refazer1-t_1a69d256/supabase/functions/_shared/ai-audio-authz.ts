/**
 * Autorização por OBJETO para áudio (IA-014).
 *
 * Defeito corrigido aqui: `ai-transcribe-audio` validava apenas a **origem** da
 * URL e o **nome do bucket** (`parseApprovedStorageUrl`) e baixava o objeto com
 * `service_role`. Conhecer o caminho de um objeto de bucket privado bastava para
 * qualquer usuário autenticado baixar e transcrever áudio de outro contato —
 * dado biométrico (voz) de terceiro.
 *
 * A correção não inventa modelo novo: pergunta ao banco, com o JWT do próprio
 * chamador, se aquela mensagem é visível para ele (RLS de `messages`). Zero
 * linhas = não é dele. Além disso, quando o registro tem `media_url`, é essa a
 * URL usada no download — a URL enviada pelo cliente deixa de ser a fonte da
 * verdade do objeto.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { isValidUUID, requireEnv } from './validation.ts';

export type AudioObjectAuthzResult =
  | { ok: true; mediaUrl: string | null }
  | { ok: false; status: number; error: string };

/**
 * Confere, com o JWT do chamador (RLS aplicada), que a mensagem existe e é
 * visível. Devolve também a `media_url` do registro, que passa a ser a fonte
 * preferencial do objeto baixado.
 */
export async function assertMessageVisibleToCaller(
  req: Request,
  messageId: string | undefined | null,
): Promise<AudioObjectAuthzResult> {
  if (!messageId) {
    return {
      ok: false,
      status: 400,
      error: 'messageId é obrigatório para transcrever áudio de uma conversa',
    };
  }

  // Id fora do formato não vai ao banco (evita erro de cast e não vaza existência).
  if (!isValidUUID(messageId)) {
    return { ok: false, status: 404, error: 'Áudio não encontrado ou sem permissão' };
  }

  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'Missing Authorization bearer token' };
  }

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data, error } = await callerClient
      .from('messages')
      .select('id, media_url')
      .eq('id', messageId)
      .maybeSingle();

    if (error) {
      return { ok: false, status: 500, error: 'Falha ao verificar a mensagem' };
    }
    if (!data) {
      return { ok: false, status: 404, error: 'Áudio não encontrado ou sem permissão' };
    }

    const mediaUrl = typeof data.media_url === 'string' && data.media_url.length > 0
      ? data.media_url
      : null;

    return { ok: true, mediaUrl };
  } catch {
    return { ok: false, status: 500, error: 'Falha ao verificar a mensagem' };
  }
}

export type AuthorizedAudioUrlResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

/**
 * R2-API-027 — resolve o objeto autorizado a baixar no caminho de usuário.
 *
 * A URL enviada pelo cliente NUNCA decide o que é baixado com service role no
 * caminho de usuário: só a `media_url` do registro (mensagem já provada visível
 * via RLS pelo JWT do próprio chamador) autoriza o download. Uma mensagem visível
 * sem mídia (`mediaUrl` nulo) não tem objeto para transcrever e é recusada. Antes,
 * o handler caía de volta na URL do cliente quando a `media_url` faltava — o id de
 * uma mensagem de texto própria virava autorização substituta para transcrever
 * áudio privado de outro contato.
 */
export function resolveAuthorizedAudioUrl(
  mediaUrl: string | null,
): AuthorizedAudioUrlResult {
  if (mediaUrl && mediaUrl.length > 0) {
    return { ok: true, url: mediaUrl };
  }
  return { ok: false, status: 404, error: "Áudio não encontrado ou sem permissão" };
}
