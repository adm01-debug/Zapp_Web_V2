import { formatSmartDate } from '@/lib/formatters';
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
