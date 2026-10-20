/**
 * X168 — serializador CSV do Talk X: UTF-8 com BOM (Excel abre os acentos),
 * separador `;` (locale pt-BR) e proteção contra formula-injection.
 */

const BOM = '﻿';
const SEPARATOR = ';';
const FORMULA_START = /^[=+\-@\t\r]/;

export type TalkXCsvCell = string | number | boolean | null | undefined;

/** Uma célula: texto que começaria uma fórmula ganha `'` na frente (gravada como texto). */
export function talkxCsvCell(value: TalkXCsvCell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function talkxCsvSerialize(headers: string[], rows: TalkXCsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(talkxCsvCell).join(SEPARATOR));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

export function talkxCsvBlob(headers: string[], rows: TalkXCsvCell[][]): Blob {
  return new Blob([talkxCsvSerialize(headers, rows)], { type: 'text/csv;charset=utf-8' });
}
