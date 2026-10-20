import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

/**
 * Helpers de objeto no Supabase Storage extraidos de `useFileUploadLogic` para serem
 * reutilizados sem duplicacao pelo upload (aba Arquivos / chat) e pelo encaminhamento
 * de midia (`useForwardMedia`).
 *
 * O upload grava em `whatsapp-media/<contactId>/...`; o encaminhamento copia o objeto
 * para a pasta do contato de destino (`<destinoId>/...`). As duas trilhas precisam do
 * mesmo identificador de objeto, da mesma sanitizacao de nome e da mesma limpeza
 * best-effort de orfao.
 */

/** Identificador estavel (uuid v4) para compor o nome do objeto no Storage. */
export function createStorageObjectId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Não foi possível gerar um identificador seguro para o arquivo');
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

// Storage isolation hardening: nomes de arquivo enviados pelo usuário viram
// parte do caminho no bucket. Sem isso, caracteres fora de [a-zA-Z0-9._-]
// (acentos, espaços, símbolos) chegam intactos ao Storage API.
export function sanitizeStorageFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-+\./g, '.')
    .replace(/\.-+/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120);

  return normalized || 'arquivo';
}

/**
 * Remove um objeto do Storage sem deixar falha de limpeza virar erro fatal do fluxo.
 * Recebe o bucket explicito porque o encaminhamento opera em `whatsapp-media` ou
 * `audio-messages`, enquanto o upload usa sempre `whatsapp-media`.
 */
export async function removeStoredObjectBestEffort(bucket: string, storagePath: string): Promise<void> {
  try {
    const { error } = await supabase.storage.from(bucket).remove([storagePath]);
    if (error) log.warn('Não foi possível remover o objeto do storage:', error);
  } catch (err) {
    log.warn('Não foi possível remover o objeto do storage:', err);
  }
}
