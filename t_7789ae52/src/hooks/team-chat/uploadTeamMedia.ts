import { supabase } from '@/integrations/supabase/client';
import { createStorageObjectId } from '@/lib/storage_object_upload';

/**
 * R2-DB-020 — locator privado canônico das mídias do Team Chat.
 *
 * A chave canônica de mídia do Team Chat é `<profile_id>/<conversation_id>/<nome-opaco>`,
 * com `profile_id` do remetente autenticado, `conversation_id` da conversa ativa e nome
 * opaco gerado por `crypto.randomUUID()` (via `createStorageObjectId`, que mantém o
 * fallback seguro) mais extensão saneada. O bucket é privado, então NUNCA se usa nem se
 * persiste `getPublicUrl`; o consumo passa pelo fluxo de URL assinada já existente
 * (`useResolvedStorageUrl`). Este helper é o único dono da montagem de path e do upload:
 * os três produtores (arquivo, áudio e colar imagem) chamam ele, nunca montam o path na mão.
 */

export const TEAM_CHAT_FILES_BUCKET = 'team-chat-files';

const VALID_EXTENSION = /^[a-z0-9]{1,16}$/;

/** Saneia a extensão para o nome opaco: fora de [a-z0-9]{1,16} vira 'bin'. */
export function sanitizeExtension(extension: string): string {
  const normalized = String(extension).toLowerCase().replace(/^\./, '');
  return VALID_EXTENSION.test(normalized) ? normalized : 'bin';
}

/**
 * Monta o media_path canônico `<profile_id>/<conversation_id>/<uuid>.<ext>`.
 * Retorna null se faltar profile ou conversation — o chamador aborta SEM upload.
 */
export function buildTeamMediaPath(
  profileId: string | null | undefined,
  conversationId: string | null | undefined,
  extension: string,
): string | null {
  if (!profileId || !conversationId) return null;
  return `${profileId}/${conversationId}/${createStorageObjectId()}.${sanitizeExtension(extension)}`;
}

export interface TeamMediaLocator {
  mediaBucket: string;
  mediaPath: string;
}

export interface UploadTeamMediaOptions {
  profileId: string | null | undefined;
  conversationId: string | null | undefined;
  file: Blob;
  /** Extensão crua do arquivo (será saneada). */
  extension: string;
  contentType: string;
  upsert?: boolean;
}

/**
 * Faz upload para o bucket privado do Team Chat e devolve o locator canônico
 * (`mediaBucket` + `mediaPath`), sem URL pública. Se faltar profile/conversation,
 * retorna null SEM tocar no storage. Erro do upload é relançado para o chamador
 * decidir (não anuncia envio).
 */
export async function uploadTeamMedia(opts: UploadTeamMediaOptions): Promise<TeamMediaLocator | null> {
  const path = buildTeamMediaPath(opts.profileId, opts.conversationId, opts.extension);
  if (!path) return null;

  const { error } = await supabase.storage
    .from(TEAM_CHAT_FILES_BUCKET)
    .upload(path, opts.file, { contentType: opts.contentType, upsert: opts.upsert ?? false });
  if (error) throw error;

  return { mediaBucket: TEAM_CHAT_FILES_BUCKET, mediaPath: path };
}
