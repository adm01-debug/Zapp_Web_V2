/**
 * Primitivas compartilhadas de CSV do catálogo.
 *
 * Nasceu no CT-20 como a exportação CSV do catálogo (filtro atual → arquivo).
 * A exportação de catálogo e de seleção saiu do produto: não há mais nenhum
 * caminho que monte um CSV de catálogo para download. Aqui ficaram só as peças
 * que continuam em uso por outros caminhos:
 *
 *  - `esc` + `CATALOG_EXPORT_BOM`: usadas pelo CSV do histórico de envios
 *    (src/hooks/integrations/useCatalogSendHistory.ts);
 *  - `PROMOGIFTS_BASE_URL` + `promogiftsProductUrl`: link PÚBLICO do produto
 *    (CatalogProductCard.tsx) e "Gerenciar no PromoGifts" do CatalogRail.tsx —
 *    link externo, não é saída de dado;
 *  - `triggerCsvDownload`: única porta de gravação do app, com o gate de
 *    `profiles.can_download` (Y29 / SEC-SAIDAS_DE_INFORMACAO-01), usada pelo
 *    CSV do histórico de envios.
 */
import { downloadFileWithPermission } from '@/lib/downloadFile';

/** BOM UTF-8: sem ele o Excel pt-BR abre "ç/ã" como mojibake. */
export const CATALOG_EXPORT_BOM = '\uFEFF';

/** Única URL pública do PromoGifts confirmada no repo. */
export const PROMOGIFTS_BASE_URL = 'https://promogifts.com.br';

/**
 * Escapa um campo CSV. Vírgula, aspas e quebra de linha tornam o campo
 * ambíguo → vai entre aspas, com aspas internas duplicadas. null/undefined
 * viram string vazia (não "null"/"undefined").
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s === '') return '';
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** URL do produto no PromoGifts a partir do `slug`. */
export function promogiftsProductUrl(slug: string | null | undefined): string {
  if (!slug) return '';
  return `${PROMOGIFTS_BASE_URL}/${encodeURIComponent(slug)}`;
}

/**
 * Grava um CSV no disco do usuário.
 *
 * Y29 / SEC-SAIDAS_DE_INFORMACAO-01: a gravação passa pela única porta do app
 * (`downloadFileWithPermission`), que consulta `profiles.can_download` — o
 * valor vem do chamador (`useDownloadPermission`). Sem permissão NÃO há
 * `createObjectURL` nem clique e a função devolve `false`, para o chamador não
 * anunciar um download que não houve.
 */
export function triggerCsvDownload(csv: string, filename: string, canDownload: boolean): boolean {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  return downloadFileWithPermission(blob, filename, { canDownload });
}
