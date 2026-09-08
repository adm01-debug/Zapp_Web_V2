import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

export function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const TYPE_LABEL: Record<ContactMediaItem['type'], string> = {
  image: 'Imagem', video: 'Vídeo', audio: 'Áudio', document: 'Documento',
};
