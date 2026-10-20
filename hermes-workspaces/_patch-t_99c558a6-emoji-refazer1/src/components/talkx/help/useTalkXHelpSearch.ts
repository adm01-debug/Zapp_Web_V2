import { useCallback, useMemo, useState } from 'react';

import type { TalkXHelpDoc } from './talkxHelpIndex';

/**
 * X189 — busca da Ajuda do Talk X, no cliente e sem acento.
 *
 * A busca roda sobre o índice já carregado (título, palavras-chave e corpo),
 * procurando por todos os termos digitados e ignorando acentos/caixa — quem
 * digita "supressao" acha "Supressão". O destaque é devolvido em pedaços
 * (`{ texto, casa }`), nunca em HTML, e as setas/Enter são resolvidos pelo
 * `TalkXHelpCenter` em cima de `active`/`moveActive`.
 */

export interface TalkXHelpHighlight {
  text: string;
  match: boolean;
}

/**
 * Palavras vazias ficam de fora dos termos: "como criar uma campanha" procura
 * por `criar` e `campanha`, sem exigir o "como"/"uma" de quem digitou.
 */
const HELP_STOPWORDS = new Set([
  'a', 'as', 'o', 'os', 'e', 'de', 'da', 'das', 'do', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'para', 'por', 'com', 'um', 'uma', 'uns', 'umas', 'que', 'como', 'ao', 'aos', 'se', 'ou',
  'meu', 'minha', 'seu', 'sua', 'meu', 'mais', 'muito', 'ja', 'nao', 'sim',
]);

export interface TalkXHelpSearchHit {
  doc: TalkXHelpDoc;
  /** 3 = casou no título, 2 = nas palavras-chave, 1 = só no corpo. */
  rank: number;
  excerpt: string;
}

/** Tira acento e caixa: base da comparação da busca e do destaque. */
export function foldHelpText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function foldHelpChar(char: string): string {
  return char.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Termos da busca, sem acento, sem pontuação e sem palavras vazias. */
export function helpSearchTokens(query: string): string[] {
  return foldHelpText(query)
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter((token) => token.length > 1 && !HELP_STOPWORDS.has(token));
}

/**
 * Marca no texto os trechos que casam com qualquer termo da busca. Devolve
 * pedaços para o componente renderizar — nada de string de HTML.
 */
export function highlightHelpText(text: string, query: string): TalkXHelpHighlight[] {
  const tokens = helpSearchTokens(query);
  if (!text) return [];
  if (tokens.length === 0) return [{ text, match: false }];

  // Cada caractere vira um caractere dobrado (o acento vem como marca
  // combinante e sai na mesma posição), então os índices casados valem para o
  // texto original e o destaque cai no lugar certo.
  const folded = text.split('').map(foldHelpChar).join('');
  if (folded.length !== text.length) return [{ text, match: false }];

  const ranges: { start: number; end: number }[] = [];
  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(token, from);
      if (at === -1) break;
      ranges.push({ start: at, end: at + token.length });
      from = at + token.length;
    }
  }
  if (ranges.length === 0) return [{ text, match: false }];

  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }

  const parts: TalkXHelpHighlight[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) parts.push({ text: text.slice(cursor, range.start), match: false });
    parts.push({ text: text.slice(range.start, range.end), match: true });
    cursor = range.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}

/** Onde a busca casa: título, palavras-chave e corpo contam. */
export function rankHelpDoc(doc: TalkXHelpDoc, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const title = foldHelpText(doc.title);
  const keywords = foldHelpText(doc.keywords.join(' '));
  const body = foldHelpText(doc.body);
  if (tokens.every((token) => title.includes(token))) return 3;
  if (tokens.every((token) => title.includes(token) || keywords.includes(token))) return 2;
  if (tokens.every((token) => title.includes(token) || keywords.includes(token) || body.includes(token))) return 1;
  return 0;
}

/** Texto do corpo sem a marcação, para o resumo da busca não vazar markdown. */
function helpPlainText(markdown: string): string {
  return markdown
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[*`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trecho do corpo em volta do primeiro casamento, para a lista de resultados. */
export function helpDocExcerpt(doc: TalkXHelpDoc, query: string, window = 120): string {
  const body = helpPlainText(doc.body);
  const tokens = helpSearchTokens(query);
  const folded = foldHelpText(body);
  const at = tokens.reduce((found, token) => {
    if (found !== -1) return found;
    return folded.indexOf(token);
  }, -1);
  if (at === -1) return body.length > window * 2 ? `${body.slice(0, window * 2).trim()}…` : body;

  const start = Math.max(0, at - Math.floor(window / 2));
  const end = Math.min(body.length, at + window);
  const slice = body.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${slice}${end < body.length ? '…' : ''}`;
}

export function searchHelpDocs(docs: TalkXHelpDoc[], query: string): TalkXHelpSearchHit[] {
  const tokens = helpSearchTokens(query);
  if (tokens.length === 0) return [];
  return docs
    .map((doc) => ({ doc, rank: rankHelpDoc(doc, tokens), excerpt: helpDocExcerpt(doc, query) }))
    .filter((hit) => hit.rank > 0)
    .sort(
      (left, right) =>
        right.rank - left.rank ||
        left.doc.order - right.doc.order ||
        left.doc.title.localeCompare(right.doc.title, 'pt-BR'),
    );
}

export interface TalkXHelpSearchState {
  query: string;
  setQuery: (next: string) => void;
  results: TalkXHelpSearchHit[];
  active: TalkXHelpSearchHit | null;
  activeIndex: number;
  moveActive: (delta: number) => void;
  isSearching: boolean;
  hasNoResults: boolean;
}

export function useTalkXHelpSearch(docs: TalkXHelpDoc[]): TalkXHelpSearchState {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => searchHelpDocs(docs, query), [docs, query]);
  const isSearching = query.trim().length > 0;
  const safeIndex = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  const updateQuery = useCallback((next: string) => {
    setQuery(next);
    setActiveIndex(0);
  }, []);

  const moveActive = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        if (results.length === 0) return 0;
        const base = Math.min(current, results.length - 1);
        return (base + delta + results.length) % results.length;
      });
    },
    [results.length],
  );

  return {
    query,
    setQuery: updateQuery,
    results,
    active: results[safeIndex] ?? null,
    activeIndex: safeIndex,
    moveActive,
    isSearching,
    hasNoResults: isSearching && results.length === 0,
  };
}
