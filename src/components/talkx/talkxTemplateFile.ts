/**
 * X093 — Importação/exportação de templates TalkX em CSV ou JSON.
 *
 * CSV: separador `;` (padrão BR), UTF-8 com BOM, células iniciadas por `=`, `+`, `-`, `@`
 * recebem prefixo `'` (CSV injection protection). Compatível com talkxCsv.ts.
 */

import { TEMPLATE_CATEGORIES } from './kit/constants';

export const TEMPLATE_FILE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const TEMPLATE_FILE_MAX_ROWS = 500;

const SEP = ';';
const UTF8_BOM = '﻿';
const FORMULA_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

// ─── CSV escape / unescape ─────────────────────────────────────────────────

function escapeCell(raw: string): string {
  let v = raw;
  if (v.length > 0 && FORMULA_CHARS.has(v[0])) v = `'${v}`;
  const needsQuotes = v.includes(SEP) || v.includes('"') || v.includes('\n') || v.includes('\r');
  if (needsQuotes) v = `"${v.split('"').join('""')}"`;
  return v;
}

function unescapeCell(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).split('""').join('"');
  }
  return t;
}

/** Split a CSV line respecting quoted fields. */
function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === SEP) { cells.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  cells.push(cur);
  return cells;
}

// ─── Shared types ──────────────────────────────────────────────────────────

export interface TemplateImportRow {
  name: string;
  content: string;
  description?: string;
  category?: string;
  tags?: string;
  status?: string;
}

export type ConflictAction = 'skip' | 'overwrite' | 'copy';

export interface TemplateRowIssue {
  field: string;
  message: string;
}

export interface ParsedTemplateRow {
  index: number;
  raw: TemplateImportRow;
  issues: TemplateRowIssue[];
  /** Whether a template with this name already exists in the current list. */
  isConflict: boolean;
}

// ─── CSV headers ──────────────────────────────────────────────────────────

const CSV_HEADERS: Array<keyof TemplateImportRow> = ['name', 'content', 'description', 'category', 'tags', 'status'];

// ─── Parse ────────────────────────────────────────────────────────────────

export interface ParseResult {
  rows: ParsedTemplateRow[];
  fatalError?: string;
  truncated: boolean;
}

/**
 * Parse a raw string (CSV or JSON) into validated rows.
 * @param text File content (UTF-8, BOM stripped automatically)
 * @param format 'csv' | 'json'
 * @param existingNames Names of existing templates (to detect conflicts)
 */
export function parseTemplateFile(
  text: string,
  format: 'csv' | 'json',
  existingNames: Set<string>,
): ParseResult {
  const clean = text.startsWith(UTF8_BOM) ? text.slice(1) : text;
  let rawRows: TemplateImportRow[];
  let truncated = false;

  if (format === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return { rows: [], fatalError: 'JSON inválido — verifique a sintaxe do arquivo.', truncated: false };
    }
    if (!Array.isArray(parsed)) {
      return { rows: [], fatalError: 'O arquivo JSON deve conter um array de objetos.', truncated: false };
    }
    rawRows = parsed as TemplateImportRow[];
  } else {
    // CSV
    const lines = clean.split(/\r?\n/);
    if (lines.length < 2) {
      return { rows: [], fatalError: 'CSV vazio ou sem cabeçalho.', truncated: false };
    }
    const headerLine = lines[0];
    const headerCells = splitCsvRow(headerLine).map((c) => unescapeCell(c).toLowerCase() as keyof TemplateImportRow);
    const nameIdx = headerCells.indexOf('name');
    const contentIdx = headerCells.indexOf('content');
    if (nameIdx < 0 || contentIdx < 0) {
      return { rows: [], fatalError: 'CSV deve ter colunas "name" e "content".', truncated: false };
    }
    rawRows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cells = splitCsvRow(line).map(unescapeCell);
      const row: TemplateImportRow = { name: '', content: '' };
      headerCells.forEach((key, j) => {
        if (key in row || CSV_HEADERS.includes(key)) {
          (row as Record<string, string>)[key as string] = cells[j] ?? '';
        }
      });
      rawRows.push(row);
    }
  }

  if (rawRows.length > TEMPLATE_FILE_MAX_ROWS) {
    rawRows = rawRows.slice(0, TEMPLATE_FILE_MAX_ROWS);
    truncated = true;
  }

  const rows: ParsedTemplateRow[] = rawRows.map((raw, index) => {
    const issues: TemplateRowIssue[] = [];

    if (!raw.name?.trim()) {
      issues.push({ field: 'name', message: 'Nome obrigatório.' });
    } else if (raw.name.length > 1024) {
      issues.push({ field: 'name', message: `Nome muito longo (${raw.name.length} > 1024 caracteres).` });
    }

    if (!raw.content?.trim()) {
      issues.push({ field: 'content', message: 'Conteúdo obrigatório.' });
    }

    if (raw.category && !(TEMPLATE_CATEGORIES as readonly string[]).includes(raw.category)) {
      issues.push({ field: 'category', message: `Categoria desconhecida: "${raw.category}".` });
    }

    const validStatuses = ['draft', 'review', 'approved'];
    if (raw.status && !validStatuses.includes(raw.status)) {
      issues.push({ field: 'status', message: `Status inválido: "${raw.status}". Use draft, review ou approved.` });
    }

    const isConflict = !!raw.name?.trim() && existingNames.has(raw.name.trim());

    return { index, raw, issues, isConflict };
  });

  return { rows, truncated };
}

// ─── Serialize to CSV ─────────────────────────────────────────────────────

/** Serialize templates to CSV (UTF-8 with BOM, `;` separator). */
export function serializeTemplatesToCsv(
  templates: Array<TemplateImportRow & { id?: string }>,
): string {
  const header = CSV_HEADERS.map(escapeCell).join(SEP);
  const body = templates
    .map((t) =>
      CSV_HEADERS.map((k) => {
        const val = (t as Record<string, unknown>)[k];
        if (val === null || val === undefined) return '';
        return escapeCell(String(val));
      }).join(SEP),
    )
    .join('\n');
  return `${UTF8_BOM}${header}\n${body}`;
}

/** Serialize templates to JSON (pretty-printed). */
export function serializeTemplatesToJson(templates: TemplateImportRow[]): string {
  return JSON.stringify(templates, null, 2);
}

/** Download a string as a file. */
export function downloadTemplateFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
