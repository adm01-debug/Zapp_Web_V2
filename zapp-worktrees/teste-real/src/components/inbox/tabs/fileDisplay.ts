import { formatSmartDate } from '@/lib/formatters';
import { isTechnicalFilename, type ContactMediaItem } from '@/hooks/chat/useContactMedia';

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

/** Meses em portugues, abreviados, minusculos e sem ponto: "02 set 2026, 18:45". */
const CARD_MONTHS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

const twoDigits = (value: number): string => String(value).padStart(2, '0');

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * Etapa 22 (S22): data curta do cartao — "Hoje, 16:10", "Ontem, 14:32" ou
 * "02 set 2026, 18:45". Le a data no fuso do navegador (nunca UTC) e compara
 * Hoje/Ontem por dia local; o "ontem" e calculado por `setDate` sobre o dia local,
 * entao a virada de mes e de ano se resolve sozinha. Data ausente ou invalida -> "".
 * Nenhum componente monta essa data por conta propria.
 */
export function formatCardDate(createdAt: string, now: Date = new Date()): string {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  const time = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
  if (isSameLocalDay(date, now)) return `Hoje, ${time}`;
  const yesterday = new Date(now.getTime());
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(date, yesterday)) return `Ontem, ${time}`;
  return `${twoDigits(date.getDate())} ${CARD_MONTHS[date.getMonth()]} ${date.getFullYear()}, ${time}`;
}

/**
 * Etapas 23 e 25 (S23, S25): segunda linha do cartao — "Imagem · 2,4 MB".
 * Reaproveita `TYPE_LABEL` e `formatSize` (contrato congelado: B, KB e MB, com o ponto
 * como separador decimal) e so troca o ponto pela virgula do mockup. Sem tamanho, sobra
 * apenas o tipo — nunca "0 KB" nem separador solto. Acima de 1 GB o `formatSize` segue
 * medindo em MB (nao ha faixa de GB nele, e este cartao nao pode altera-lo).
 */
export function typeSizeLine(item: ContactMediaItem): string {
  const size = formatSize(item.size);
  return [TYPE_LABEL[item.type], size?.replace('.', ',')].filter(Boolean).join(' · ');
}

/**
 * Etapa 24 (S24, decisao D09): primeira linha do cartao. `text` e o `displayName` que o
 * item ja traz (nome humano em destaque; arquivo tecnico vira "<Tipo> · dd/MM HH:mm") e
 * `isTechnical` diz a UI que existe um nome tecnico (hex do WhatsApp) guardado — ele so
 * aparece na dica. Sem nome nenhum nao ha dica a mostrar, entao `isTechnical` e falso.
 * A regra de nome tecnico continua sendo a `isTechnicalFilename` da consulta de midias.
 */
export function cardName(item: ContactMediaItem): { text: string; isTechnical: boolean } {
  const filename = item.filename?.trim() ?? '';
  return {
    text: item.displayName,
    isTechnical: filename.length > 0 && isTechnicalFilename(filename, item.extension),
  };
}
