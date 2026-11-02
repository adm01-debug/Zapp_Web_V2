/**
 * X168 — Serializador CSV para exportação de relatórios do Talk X.
 *
 * Regras do formato:
 *  - UTF-8 com BOM (para Excel reconhecer o encoding automaticamente)
 *  - Separador: `;` (ponto-e-vírgula — padrão BR/PT)
 *  - Aspas duplas ao redor de campos que contêm `;`, `"`, `\n` ou `\r`
 *  - Aspas dentro de campos escapadas como `""`
 *  - Células que iniciam com `=`, `+`, `-`, `@`, TAB (`\t`) ou CR (`\r`)
 *    ganham prefixo `'` para impedir injeção de fórmulas CSV (CSV Injection)
 */

const UTF8_BOM = '﻿';
const SEP = ';';

/** Caracters de início que representam risco de injeção de fórmula. */
const FORMULA_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/** Escapa um valor único para uso dentro de um campo CSV. */
function escapeCell(raw: string): string {
  let value = raw;

  // Proteção contra CSV Injection
  if (value.length > 0 && FORMULA_CHARS.has(value[0])) {
    value = `'${value}`;
  }

  // Precisa de aspas quando contém separador, aspas ou quebra de linha
  const needsQuotes = value.includes(SEP) || value.includes('"') || value.includes('\n') || value.includes('\r');
  if (needsQuotes) {
    value = `"${value.split('"').join('""')}"`;
  }

  return value;
}

/**
 * Converte um array de objetos em string CSV.
 *
 * @param rows Array de objetos; cada chave vira coluna.
 * @param columns Mapeamento de `{ key, header }` para ordem e rótulo das colunas.
 *                Se omitido, usa as chaves do primeiro objeto.
 */
export function serializeTalkXCsv<T extends object>(
  rows: T[],
  columns?: Array<{ key: keyof T; header: string }>,
): string {
  const cols: Array<{ key: keyof T; header: string }> =
    columns ?? (rows[0] ? Object.keys(rows[0]).map((k) => ({ key: k as keyof T, header: k })) : []);

  const header = cols.map((c) => escapeCell(String(c.header))).join(SEP);

  const body = rows
    .map((row) =>
      cols
        .map((c) => {
          const val = row[c.key];
          if (val === null || val === undefined) return '';
          return escapeCell(String(val));
        })
        .join(SEP),
    )
    .join('\n');

  return `${UTF8_BOM}${header}\n${body}`;
}

/** Dispara o download do CSV no browser. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Shapes para o relatório de campanha ──────────────────────────────────────

export interface TalkXRecipientExportRow {
  nome: string;
  telefone: string;
  status: string;
  enviado_em: string;
  entregue_em: string;
  respondeu_em: string;
}

export interface TalkXConversionExportRow {
  destinatario: string;
  telefone: string;
  convertido_em: string;
  valor?: string;
}

export interface TalkXLinkExportRow {
  url: string;
  cliques: number;
  cliques_unicos: number;
}

/** Colunas padrão para destinatários. */
export const RECIPIENT_COLUMNS: Array<{ key: keyof TalkXRecipientExportRow; header: string }> = [
  { key: 'nome', header: 'Nome' },
  { key: 'telefone', header: 'Telefone' },
  { key: 'status', header: 'Status' },
  { key: 'enviado_em', header: 'Enviado em' },
  { key: 'entregue_em', header: 'Entregue em' },
  { key: 'respondeu_em', header: 'Respondeu em' },
];

/** Colunas padrão para conversões. */
export const CONVERSION_COLUMNS: Array<{ key: keyof TalkXConversionExportRow; header: string }> = [
  { key: 'destinatario', header: 'Destinatário' },
  { key: 'telefone', header: 'Telefone' },
  { key: 'convertido_em', header: 'Convertido em' },
  { key: 'valor', header: 'Valor (R$)' },
];

/** Colunas padrão para links. */
export const LINK_COLUMNS: Array<{ key: keyof TalkXLinkExportRow; header: string }> = [
  { key: 'url', header: 'URL' },
  { key: 'cliques', header: 'Cliques' },
  { key: 'cliques_unicos', header: 'Cliques únicos' },
];
