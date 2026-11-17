/**
 * CV-114 — Mascaramento de dados pessoais no rascunho.
 *
 * A lógica vive em `mascararDadosPessoais`, função PURA, porque o mascaramento
 * também precisa acontecer FORA de componente: antes de mandar texto de
 * conversa para um provedor de IA (LGPD em trânsito), onde não há como chamar
 * um hook. O hook continua sendo o caminho de quem está num componente e não
 * muda de comportamento.
 */
import { useMemo } from 'react';

export interface MaskedField {
  type: 'cpf' | 'cnpj' | 'email' | 'phone' | 'card' | 'cep';
  original: string;
  masked: string;
  index: number;
}

export interface DataMaskingResult {
  maskedText: string;
  fields: MaskedField[];
  hasPersonalData: boolean;
}

type FieldType = MaskedField['type'];

// Replace all digits except the last `keepLast`, preserving separators.
// Using digit-count approach avoids lookahead failures on formatted strings like "(11) 99999-8888".
function maskLastDigits(m: string, keepLast: number): string {
  const digitCount = (m.match(/\d/g) ?? []).length;
  const maskCount = Math.max(0, digitCount - keepLast);
  let replaced = 0;
  return m.replace(/\d/g, (d) => (replaced++ < maskCount ? '*' : d));
}

const PATTERNS: Array<{ type: FieldType; regex: RegExp; mask: (m: string) => string }> = [
  { type: 'cpf',   regex: /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}\b/g, mask: (m) => maskLastDigits(m, 2) },
  { type: 'cnpj',  regex: /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-.\s]?\d{2}\b/g, mask: (m) => maskLastDigits(m, 4) },
  { type: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    mask: (m) => { const [local, domain] = m.split('@'); return `${local.slice(0, 2)}***@${domain}`; } },
  { type: 'phone', regex: /\b(?:\+55\s?)?(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-.\s]?\d{4}\b/g, mask: (m) => maskLastDigits(m, 4) },
  { type: 'card',  regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, mask: () => '**** **** **** ****' },
  { type: 'cep',   regex: /\b\d{5}-?\d{3}\b/g, mask: (m) => maskLastDigits(m, 3) },
];

/**
 * Tipos mascarados antes de mandar conversa para um provedor de IA.
 *
 * Decisão de escopo, não de implementação: documento e cartão têm sensibilidade
 * máxima e utilidade quase nula para REDIGIR uma resposta — a IA precisa saber
 * que o cliente informou um CPF, não os dígitos. Telefone, e-mail e CEP ficam
 * intactos de propósito: a IA usa para contexto ("confirmo seu endereço") e o
 * telefone já é o próprio canal da conversa, logo o sistema já o conhece.
 */
export const TIPOS_SENSIVEIS_PARA_IA: readonly FieldType[] = ['cpf', 'cnpj', 'card'];

export interface OpcoesDeMascaramento {
  /** Quando falso (padrão), só DETECTA: `maskedText` volta igual ao texto. */
  applyMask?: boolean;
  /** Restringe a quais tipos olhar. Ausente = todos. */
  tipos?: readonly FieldType[];
}

/**
 * Detecta (e opcionalmente mascara) dado pessoal num texto. Pura: serve a
 * componente, a serviço e a payload de edge function.
 */
export function mascararDadosPessoais(text: string, opcoes: OpcoesDeMascaramento = {}): DataMaskingResult {
  const { applyMask = false, tipos } = opcoes;
  if (!text.trim()) return { maskedText: text, fields: [], hasPersonalData: false };

  const padroes = tipos ? PATTERNS.filter((p) => tipos.includes(p.type)) : PATTERNS;

  // Collect ALL matches first across all patterns before any splicing.
  // Sorting descending by index and splicing from the end eliminates offset bookkeeping:
  // each splice only affects positions that have already been processed.
  const allMatches: Array<{ type: FieldType; original: string; masked: string; index: number }> = [];
  for (const { type, regex, mask } of padroes) {
    const re = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      allMatches.push({ type, original: match[0], masked: mask(match[0]), index: match.index });
    }
  }

  const fields: MaskedField[] = allMatches
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(({ type, original, masked, index }) => ({ type, original, masked, index }));

  let maskedText = text;
  if (applyMask) {
    // Apply from end of string so earlier splices don't shift indices of later ones.
    allMatches
      .slice()
      .sort((a, b) => b.index - a.index)
      .forEach(({ masked, index, original }) => {
        maskedText = maskedText.slice(0, index) + masked + maskedText.slice(index + original.length);
      });
  }

  return { maskedText, fields, hasPersonalData: fields.length > 0 };
}

/** Atalho de egresso para IA: mascara só o que não deve sair do sistema. */
export function mascararParaIA(text: string): string {
  return mascararDadosPessoais(text, { applyMask: true, tipos: TIPOS_SENSIVEIS_PARA_IA }).maskedText;
}

export function useDataMasking({ text, applyMask = false }: { text: string; applyMask?: boolean }): DataMaskingResult {
  return useMemo(() => mascararDadosPessoais(text, { applyMask }), [text, applyMask]);
}
