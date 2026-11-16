/**
 * X093 — Importação/exportação de templates TalkX em CSV ou JSON.
 *
 * CSV: separador `;` (padrão BR), UTF-8 com BOM, células iniciadas por `=`, `+`, `-`, `@`
 * recebem prefixo `'` (CSV injection protection). Compatível com talkxCsv.ts.
 */

import { TEMPLATE_CATEGORIES } from './kit/constants';

export const TEMPLATE_FILE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
/**
 * Limites do banco, do mesmo lugar: o trigger `validate_talkx_template_input`
 * (`supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql:411`)
 * e a RPC de atualizacao (`:545`) recusam
 *   length(btrim(name)) fora de 1..200
 *   length(content)     fora de 1..65536
 *   length(description) > 4000
 *
 * Validar aqui com os MESMOS numeros e' o que faz o dialogo recusar a linha em
 * vez de o usuario confirmar uma importacao que vai falhar na gravacao e so
 * receber a contagem de erros depois. O trigger aplica btrim so no nome, entao
 * conteudo e descricao sao contados sem trim, como o banco conta.
 */
export const TEMPLATE_NAME_MAX = 200;
export const TEMPLATE_CONTENT_MAX = 65536;
export const TEMPLATE_DESCRIPTION_MAX = 4000;

/**
 * Nome da copia, caber no limite do banco.
 *
 * A opcao "Criar copia" somava ` (copia)` a um nome JA validado em 200: um nome
 * de 200 chegava com 208 ao INSERT e o trigger
 * `validate_talkx_template_input` recusava — a linha aparecia valida no dialogo
 * e falhava na gravacao. O nome-base e' cortado para o sufixo caber, contando
 * ponto de codigo como o Postgres conta.
 */
export const SUFIXO_COPIA = ' (cópia)';

export function nomeDeCopia(nome: string): string {
  const base = Array.from(nome.trim());
  const sufixo = Array.from(SUFIXO_COPIA).length;
  const sobra = TEMPLATE_NAME_MAX - sufixo;
  return `${base.slice(0, Math.max(0, sobra)).join('')}${SUFIXO_COPIA}`;
}

/**
 * Serializa e desserializa a lista de tags de forma REVERSIVEL.
 *
 * A exportacao fazia `tags.join(',')` e a importacao `split(',')`. O editor
 * aceita tag com virgula dentro (`TalkXTemplateEditor.tsx` adiciona o texto
 * digitado inteiro no Enter), entao `black, friday` saia como uma tag e voltava
 * como duas: a classificacao do template mudava sozinha, inclusive escolhendo
 * "Sobrescrever". A virgula e a barra invertida passam a ser escapadas, o que
 * torna a volta exata e serve aos dois formatos sem mudar o tipo do campo.
 */
export function serializarTags(tags: readonly string[]): string {
  return tags.map((t) => t.replace(/\\/g, '\\\\').replace(/,/g, '\\,')).join(',');
}

export function desserializarTags(valor?: string): string[] {
  if (!valor) return [];
  const saida: string[] = [];
  let atual = '';
  for (let i = 0; i < valor.length; i += 1) {
    const ch = valor[i];
    // So `\\` e `\,` sao escapes nossos. Tratar qualquer caractere depois da
    // barra como escapado comia a barra de um arquivo de fora: a tag
    // `vendas\varejo` virava `vendasvarejo`.
    if (ch === '\\' && (valor[i + 1] === '\\' || valor[i + 1] === ',')) { atual += valor[i + 1]; i += 1; continue; }
    if (ch === ',') { saida.push(atual.trim()); atual = ''; continue; }
    atual += ch;
  }
  saida.push(atual.trim());
  return saida.filter(Boolean);
}

/**
 * Conta como o Postgres conta.
 *
 * O `length()` do Postgres conta PONTOS DE CODIGO; o `.length` do JavaScript
 * conta unidades UTF-16, e um emoji vale 2. Um nome com 199 letras e um 🚀 tem
 * 200 para o banco e 201 para o `.length` — eu barrava na importacao um nome
 * que o banco aceita, inclusive um exportado da propria biblioteca.
 */
function contarPontos(v: string): number {
  return Array.from(v).length;
}

/** Nome e' comparado depois do btrim pelo trigger; conteudo e descricao, nao. */
function contarCaracteres(v: string): number {
  return contarPontos(v.trim());
}
export const TEMPLATE_FILE_MAX_ROWS = 500;

const SEP = ';';
const UTF8_BOM = '﻿';
const FORMULA_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

// ─── CSV escape / unescape ─────────────────────────────────────────────────

/**
 * Protecao contra formula do Excel, agora SIMETRICA com `desprotegerFormula`.
 *
 * Antes o prefixo so era acrescentado quando o primeiro caractere era de
 * formula. Um texto que ja comecava com apostrofo saia intacto, e a importacao
 * nao tinha como distinguir esse apostrofo do prefixo: `'- Ola!` voltava
 * `- Ola!`, perdendo um caractere do conteudo. Agora o apostrofo inicial
 * tambem e' prefixado, entao a volta e' exata.
 */
function escapeCell(raw: string): string {
  let v = raw;
  if (v.length > 0 && (FORMULA_CHARS.has(v[0]) || v[0] === "'")) v = `'${v}`;
  // Espaco nas pontas tambem exige aspas: sem elas o tokenizador faz `trim()` na
  // celula nao citada e `  Ola  ` voltava `Ola` na reimportacao.
  const needsQuotes = v.includes(SEP) || v.includes('"') || v.includes('\n') || v.includes('\r')
    || v !== v.trim();
  if (needsQuotes) v = `"${v.split('"').join('""')}"`;
  return v;
}


/**
 * Desfaz a protecao contra formula do `escapeCell`.
 *
 * `escapeCell` prefixa `'` quando o valor comeca com `=`, `+`, `-`, `@`, tab,
 * CR ou com o proprio `'`. A volta remove UM apostrofo inicial quando o que
 * sobra comeca com um desses — o que cobre os dois casos e preserva o
 * apostrofo que pertence ao texto:
 *
 *   `-X`    -> exporta `'-X`  -> importa `-X`
 *   `'-X`   -> exporta `''-X` -> importa `'-X`
 *   `'Ola`  -> exporta `''Ola`-> importa `'Ola`
 *   `Ola`   -> exporta `Ola`  -> importa `Ola`
 *
 * Em CSV de fora, que nao passou pelo nosso exportador, um apostrofo inicial
 * seguido de caractere de formula e' lido como prefixo de protecao — e' a
 * convencao do Excel e e' a unica leitura possivel sem metadado no arquivo.
 */
function desprotegerFormula(v: string): string {
  if (v.length > 1 && v[0] === "'" && (FORMULA_CHARS.has(v[1]) || v[1] === "'")) return v.slice(1);
  return v;
}

/**
 * Separa o arquivo em REGISTROS, nao em linhas.
 *
 * `escapeCell` protege com aspas o campo que tem quebra de linha, mas quebrar o
 * texto em linhas ANTES de interpretar as aspas partia esse campo em dois: o
 * CSV exportado com `content: 'Ola!\nTudo bem?'` voltava truncado em "Ola!" —
 * e, pior, a primeira parte passava a validacao e era salva assim, com o resto
 * virando um registro invalido. O estado de aspas tem de atravessar o `\n`.
 */
function parseCsvRecords(text: string): { records: string[][]; aspasAbertas: boolean } {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;   // a celula atual comecou com aspas
  let inQ = false;      // o cursor esta dentro das aspas
  let viuCelula = false;

  const fecharCelula = () => {
    record.push(desprotegerFormula(quoted ? cell : cell.trim()));
    cell = ''; quoted = false; viuCelula = true;
  };
  const fecharRegistro = () => {
    fecharCelula();
    // Linha em branco nao e registro.
    if (record.length > 1 || record[0] !== '') records.push(record);
    record = [];
    viuCelula = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') { inQ = true; quoted = true; continue; }
    if (ch === SEP) { fecharCelula(); continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { fecharRegistro(); continue; }
    cell += ch;
  }
  if (cell !== '' || inQ || viuCelula || record.length > 0) fecharRegistro();
  // Aspas abertas no fim do arquivo significa arquivo truncado ou mal formado.
  // Antes isso era aceito em silencio: `Oferta;"Ola\nOutra;Mensagem` virava UM
  // template cujo conteudo engolia os registros seguintes, e sobrescrever salvava
  // esse conteudo corrompido no lugar do template existente.
  return { records, aspasAbertas: inQ };
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
    // Um JSON sintaticamente valido como `[null]` ou `[{"name":42}]` passava daqui
    // e estourava adiante em `raw.name.trim()`. Como `reader.onload` nao captura,
    // o dialogo nao mostrava motivo nenhum e as outras linhas validas do mesmo
    // arquivo iam embora com ele. Cada elemento vira string ou vira problema da
    // linha; o arquivo inteiro continua sendo lido.
    rawRows = parsed.map((item) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return { name: '', content: '' };
      const obj = item as Record<string, unknown>;
      const texto = (v: unknown) => (typeof v === 'string' ? v : undefined);
      return {
        name: texto(obj.name) ?? '',
        content: texto(obj.content) ?? '',
        description: texto(obj.description),
        category: texto(obj.category),
        tags: texto(obj.tags),
        status: texto(obj.status),
      } as TemplateImportRow;
    });
  } else {
    // CSV
    const { records, aspasAbertas } = parseCsvRecords(clean);
    if (aspasAbertas) {
      return { rows: [], fatalError: 'CSV mal formado: há um campo entre aspas que não foi fechado. O arquivo pode estar truncado.', truncated: false };
    }
    if (records.length < 2) {
      return { rows: [], fatalError: 'CSV vazio ou sem cabeçalho.', truncated: false };
    }
    const headerCells = records[0].map((c) => c.toLowerCase() as keyof TemplateImportRow);
    const nameIdx = headerCells.indexOf('name');
    const contentIdx = headerCells.indexOf('content');
    if (nameIdx < 0 || contentIdx < 0) {
      return { rows: [], fatalError: 'CSV deve ter colunas "name" e "content".', truncated: false };
    }
    rawRows = [];
    for (let i = 1; i < records.length; i++) {
      const cells = records[i];
      if (cells.every((c) => c === '')) continue;
      const row: TemplateImportRow = { name: '', content: '' };
      headerCells.forEach((key, j) => {
        if (key in row || CSV_HEADERS.includes(key)) {
          (row as unknown as Record<string, string>)[key as string] = cells[j] ?? '';
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
    } else if (contarCaracteres(raw.name) > TEMPLATE_NAME_MAX) {
      // O trigger `validate_talkx_template_input` e a RPC de atualizacao recusam
      // nome com mais de 200 caracteres depois do btrim. Aceitar 1024 aqui so
      // empurrava para o banco uma linha que ia falhar de certeza, e o dialogo
      // mostrava a linha como valida.
      issues.push({ field: 'name', message: `Nome muito longo (${contarCaracteres(raw.name)} > ${TEMPLATE_NAME_MAX} caracteres).` });
    }

    if (!raw.content?.trim()) {
      issues.push({ field: 'content', message: 'Conteúdo obrigatório.' });
    } else if (contarPontos(raw.content) > TEMPLATE_CONTENT_MAX) {
      issues.push({ field: 'content', message: `Conteúdo muito longo (${contarPontos(raw.content)} > ${TEMPLATE_CONTENT_MAX} caracteres).` });
    }

    if (raw.description && contarPontos(raw.description) > TEMPLATE_DESCRIPTION_MAX) {
      issues.push({ field: 'description', message: `Descrição muito longa (${contarPontos(raw.description)} > ${TEMPLATE_DESCRIPTION_MAX} caracteres).` });
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
        const val = (t as unknown as Record<string, unknown>)[k];
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
