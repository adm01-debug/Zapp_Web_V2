/**
 * X095 (V4) — regra do envio de arquivo do template do Talk X, extraída para
 * funções puras + um hook de Storage.
 *
 * O contrato é o de CAP-059/X061 (bucket privado `talkx-media`): até 16 MB
 * (16 777 216 bytes) e a lista fechada de tipos de arquivo. Enquanto o bucket e
 * as colunas `media_file_name`/`media_size_bytes` não existem no banco
 * (X061/X083), ESTE módulo é a única implementação da regra: o editor de
 * template (X095) e o wizard (X129) têm de usar a MESMA validação, para que o
 * que a tela aceita seja exatamente o que o bucket aceita.
 *
 * As dimensões (só imagem e vídeo) são lidas no navegador por
 * `createImageBitmap`; quando a API não existe — jsdom, navegador antigo — o
 * valor fica nulo em vez de inventar um número.
 */
import { useCallback } from 'react';
// Bucket privado: o acesso ao Storage fica aqui, como nos outros componentes de
// `talkx/*` (TalkXAnalytics, TalkXSuppression, TalkXLiveMonitor) — o caminho é
// montado a partir do profile (CAP-059).
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';

/** Bucket privado do Talk X (CAP-059/X061). */
export const TALKX_MEDIA_BUCKET = 'talkx-media';

/** Limite do bucket, em bytes (CAP-059/X061: 16 MB). */
export const TALKX_MEDIA_MAX_BYTES = 16 * 1024 * 1024;

/**
 * Tipos aceitos por CAP-059/X061. Lista FECHADA de propósito: `image/gif` e
 * `application/zip`, por exemplo, ficam de fora mesmo sendo do mesmo grupo.
 */
export const TALKX_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
] as const;

/** Atributo `accept` do `<input type="file">`. */
export const TALKX_MEDIA_ACCEPT = TALKX_MEDIA_MIME_TYPES.join(',');

export type TalkxMediaType = 'image' | 'video' | 'document' | 'audio';

/**
 * O que o editor grava ao escolher um arquivo: o caminho no bucket em
 * `media_url` (`talkx-media/<profile_id>/<uuid>-<arquivo>`, o formato que a
 * RPC de X061 aceita) e os metadados do arquivo. `media_type` é nulo só no caminho de link
 * (`https://` de template antigo), em que o tipo não pode ser conferido.
 */
export interface TalkxMediaValue {
  media_url: string;
  media_type: TalkxMediaType | null;
  media_file_name: string | null;
  media_size_bytes: number | null;
  media_width: number | null;
  media_height: number | null;
}

const MIME_TYPE_MAP: Record<string, TalkxMediaType> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'application/pdf': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'audio/ogg': 'audio',
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
};

const EXTENSION_TYPE_MAP: Record<string, TalkxMediaType> = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image',
  mp4: 'video',
  pdf: 'document', docx: 'document', xlsx: 'document',
  ogg: 'audio', mp3: 'audio', mpeg: 'audio',
};

/** Grupo do tipo MIME, ou nulo quando ele não está na lista de CAP-059. */
export function mediaTypeFromMime(mime: string): TalkxMediaType | null {
  return MIME_TYPE_MAP[mime.toLowerCase()] ?? null;
}

/** Grupo inferido pela extensão — usado pelo caminho de link (`https://`). */
export function mediaTypeFromFileName(name: string): TalkxMediaType | null {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPE_MAP[extension] ?? null;
}

export interface TalkxMediaFileCheck {
  ok: boolean;
  /** Motivo em pt-BR quando `ok` é falso. */
  error?: string;
}

/**
 * Mesma regra do bucket: tipo na lista de CAP-059 e até 16 MB. A checagem roda
 * ANTES de qualquer chamada ao Storage — arquivo recusado não vira objeto
 * órfão no bucket.
 */
export function validateTalkxMediaFile(file: { name: string; type: string; size: number }): TalkxMediaFileCheck {
  if (!mediaTypeFromMime(file.type)) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const hint = extension ? `.${extension}` : 'este tipo';
    return { ok: false, error: `Arquivo ${hint} não é aceito. Use imagem, vídeo MP4, PDF, DOCX, XLSX ou áudio.` };
  }
  if (file.size > TALKX_MEDIA_MAX_BYTES) {
    return { ok: false, error: `O arquivo tem ${formatMediaBytes(file.size)} e passa do limite de 16 MB.` };
  }
  return { ok: true };
}

/** Tamanho legível: `245 KB`, `1,5 MB`. */
export function formatMediaBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(1).replace('.', ',')} MB`;
}

/** `1920 x 1080` quando as duas dimensões são conhecidas; senão nulo. */
export function formatMediaDimensions(width: number | null, height: number | null): string | null {
  if (!width || !height) return null;
  return `${width} x ${height}`;
}

/** Linha do arquivo como no mock 05: `1920 x 1080 • 245 KB`. */
export function mediaDisplayLine(value: TalkxMediaValue): string {
  return [
    formatMediaDimensions(value.media_width, value.media_height),
    formatMediaBytes(value.media_size_bytes),
  ].filter(Boolean).join(' • ');
}

/** Nome de arquivo seguro para virar chave de objeto no bucket. */
export function safeMediaFileName(name: string): string {
  const cleaned = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-');
  const trimmed = cleaned.replace(/^[-.]+/, '');
  return trimmed || 'arquivo';
}

/**
 * Dimensões de imagem ou vídeo lidas no navegador. Sem `createImageBitmap`
 * (jsdom, navegador antigo) devolve nulo; nada é inventado.
 */
export async function readMediaDimensions(file: File): Promise<{ width: number; height: number } | null> {
  const createBitmap = (globalThis as { createImageBitmap?: (source: Blob) => Promise<ImageBitmap> }).createImageBitmap;
  if (typeof createBitmap !== 'function') return null;
  try {
    const bitmap = await createBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dimensions.width > 0 && dimensions.height > 0 ? dimensions : null;
  } catch {
    return null;
  }
}

/** Caminho do objeto dentro do bucket: `<profile_id>/<uuid>-<arquivo>`. */
export function talkxMediaObjectPath(profileId: string, fileName: string): string {
  return `${profileId}/${crypto.randomUUID()}-${safeMediaFileName(fileName)}`;
}

/** `talkx-media/<profile_id>/<uuid>-<arquivo>` — o formato que a RPC de X061 aceita. */
export function talkxMediaUrl(objectPath: string): string {
  return `${TALKX_MEDIA_BUCKET}/${objectPath}`;
}

/** O caminho no bucket, de volta à chave do objeto; nulo para link `https://`. */
export function talkxMediaObjectPathFromUrl(mediaUrl: string): string | null {
  const prefix = `${TALKX_MEDIA_BUCKET}/`;
  return mediaUrl.startsWith(prefix) ? mediaUrl.slice(prefix.length) : null;
}

export interface TalkXMediaUpload {
  /** Valida, lê as dimensões e envia ao bucket; devolve os 6 campos. */
  upload: (file: File) => Promise<TalkxMediaValue>;
  /** Apaga do bucket o objeto de um valor já enviado (link `https://` é ignorado). */
  remove: (value: TalkxMediaValue) => Promise<void>;
}

export function useTalkXMediaUpload(): TalkXMediaUpload {
  const { profile } = useAuth();
  const profileId = profile?.id;

  const upload = useCallback(async (file: File): Promise<TalkxMediaValue> => {
    const check = validateTalkxMediaFile(file);
    if (!check.ok) throw new Error(check.error ?? 'Arquivo não aceito.');
    const mediaType = mediaTypeFromMime(file.type);
    if (!mediaType) throw new Error('Arquivo não aceito.');
    // Sem perfil não há prefixo do contrato `<profile_id>/<uuid>-<arquivo>`:
    // recusa ANTES de qualquer chamada ao Storage.
    if (!profileId) throw new Error('Seu perfil não foi identificado. Entre novamente para enviar a mídia.');

    const dimensions = mediaType === 'image' || mediaType === 'video' ? await readMediaDimensions(file) : null;
    const objectPath = talkxMediaObjectPath(profileId, file.name);
    const { error } = await supabase.storage
      .from(TALKX_MEDIA_BUCKET)
      .upload(objectPath, file, { contentType: file.type });
    if (error) throw new Error('Falha ao enviar o arquivo. Tente novamente.');

    return {
      media_url: talkxMediaUrl(objectPath),
      media_type: mediaType,
      media_file_name: file.name,
      media_size_bytes: file.size,
      media_width: dimensions?.width ?? null,
      media_height: dimensions?.height ?? null,
    };
  }, [profileId]);

  const remove = useCallback(async (value: TalkxMediaValue): Promise<void> => {
    const objectPath = talkxMediaObjectPathFromUrl(value.media_url);
    if (!objectPath) return;
    await supabase.storage.from(TALKX_MEDIA_BUCKET).remove([objectPath]);
  }, []);

  return { upload, remove };
}
