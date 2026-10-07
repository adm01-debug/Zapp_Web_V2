import { formatSmartDate } from '@/lib/formatters';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

export function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const TYPE_LABEL: Record<ContactMediaItem['type'], string> = {
  image: 'Imagem', video: 'Vídeo', audio: 'Áudio', document: 'Documento', sticker: 'Figurinha',
};

/**
 * Meta unica dos tres modos (etapa 25): "Tipo · tamanho · data", sem o remetente (cada
 * renderer decide onde exibi-lo). O tamanho ausente sai fora — nunca "0 KB" — e a data vem
 * do mesmo formatador do cartao. Nenhum renderer formata data ou tamanho por conta propria.
 */
export function formatMeta(item: ContactMediaItem): string {
  return [TYPE_LABEL[item.type], formatSize(item.size), formatSmartDate(item.created_at)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Data da coluna "Data" da Tabela (etapa 23). Existe para a Tabela nao importar o formatador
 * de data da lib direto: a formatacao de data/tamanho fica exclusivamente neste arquivo.
 */
export function formatFileDate(createdAt: string): string {
  return formatSmartDate(createdAt);
}

/**
 * Etapa 29: familia de documento pela extensao. A familia decide o icone do cartao; a
 * extensao desconhecida cai em `generic` (sem Badge).
 */
export type DocumentFamily = 'pdf' | 'sheet' | 'doc' | 'ppt' | 'archive' | 'generic';

const DOCUMENT_FAMILIES: Record<string, DocumentFamily> = {
  pdf: 'pdf',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet',
  doc: 'doc', docx: 'doc',
  ppt: 'ppt', pptx: 'ppt',
  zip: 'archive', rar: 'archive',
};

export function documentFamily(extension: string | null): DocumentFamily {
  if (!extension) return 'generic';
  return DOCUMENT_FAMILIES[extension.toLowerCase()] ?? 'generic';
}

/** Etapa 29: extensao em MAIUSCULAS para o Badge do cartao; familia generica nao ganha Badge. */
export function documentBadge(extension: string | null): string | null {
  if (!extension || documentFamily(extension) === 'generic') return null;
  return extension.toUpperCase();
}

/**
 * Etapa 27: duracao que o proprio `<video>` entrega no `loadedmetadata`, em mm:ss.
 * Nao existe duracao confiavel em `media_meta` (sem contrato no schema-catalog.json).
 */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}
