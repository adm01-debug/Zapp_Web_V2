/**
 * Telefone — plano 2.7 / etapa 12.
 *
 * Reaproveita `cleanPhone` / `formatBrazilianPhone` de `src/lib/formatters.ts`
 * e acrescenta a normalização E.164 brasileira usada para identidade de
 * contato. Módulo TS puro: sem React, sem Supabase.
 *
 * REGRA DURA: a comparação é sempre da forma E.164 completa. **Nunca** casar
 * por sufixo de 8 dígitos — foi exatamente esse o bug do `findContactByPhone`.
 */

import { cleanPhone, formatBrazilianPhone } from '../formatters';

export { cleanPhone, formatBrazilianPhone };

/** Rótulo usado quando não há telefone exibível. */
export const NO_PHONE_LABEL = '—';

/**
 * Normaliza um telefone brasileiro para E.164 (`+55` + DDD + assinante).
 *
 * Aceita: com/sem `+55`, com `0` inicial (tronco), com/sem o nono dígito,
 * com máscara (`(11) 99999-2048`), com espaços, pontos e traços.
 * Devolve `null` quando não dá para normalizar com segurança.
 */
export function normalizeE164BR(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;

  let digits = cleanPhone(raw);
  if (digits.length === 0) return null;

  // prefixo de tronco: 0 inicial (ex.: 011 99999-2048)
  digits = digits.replace(/^0+/, '');
  if (digits.length === 0) return null;

  // código do país: só remove o 55 quando sobra um local de 10/11 dígitos.
  // (um fixo local de DDD 55 tem 10 dígitos e NÃO pode ser confundido)
  if (digits.startsWith('55') && digits.length >= 12) {
    const local = digits.slice(2);
    if (local.length === 10 || local.length === 11) digits = local;
  }

  if (digits.length === 11) {
    // DDD + 9 + assinante: já é a forma completa
    return `+55${digits}`;
  }

  if (digits.length === 10) {
    // assinante começando em 6–9 é celular sem o nono dígito → recompor
    const firstSubscriberDigit = digits.charAt(2);
    if (firstSubscriberDigit >= '6' && firstSubscriberDigit <= '9') {
      return `+55${digits.slice(0, 2)}9${digits.slice(2)}`;
    }
    // fixo (assinante 2–5): mantém 10 dígitos
    return `+55${digits}`;
  }

  return null;
}

/**
 * Telefone formatado para exibição: '+55 (11) 99999-2048'.
 * Sem número exibível → '—'. Entrada não normalizável cai no formatador
 * legado (devolve o original) para não perder informação na tela.
 */
export function formatPhoneBR(raw: string | null | undefined): string {
  const e164 = normalizeE164BR(raw);
  if (e164 === null) {
    const original = typeof raw === 'string' ? raw.trim() : '';
    return original.length > 0 ? formatBrazilianPhone(original) : NO_PHONE_LABEL;
  }

  const local = e164.slice(3); // remove '+55'
  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
}

/**
 * Correspondência exata de telefone: compara **a forma E.164 completa**.
 * Nunca por sufixo — dois números com os mesmos 8 dígitos finais e DDDs
 * diferentes são números diferentes.
 * Qualquer lado não normalizável → `false` (nunca casa por engano).
 */
export function phonesMatchExact(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeE164BR(a);
  const right = normalizeE164BR(b);
  if (left === null || right === null) return false;
  return left === right;
}

/**
 * Grafias que a coluna `contacts.phone` pode ter para o mesmo número: E.164,
 * só dígitos, sem o nono dígito e com `0` de tronco. Serve para montar a
 * consulta (que é textual); **a decisão continua sendo `phonesMatchExact`**,
 * porque um `eq` casaria string formatada e um `ilike` casaria sufixo.
 */
export function phoneQueryVariants(raw: string | null | undefined): string[] {
  const e164 = normalizeE164BR(raw);
  if (e164 === null) return [];

  const local = e164.slice(3); // DDD + assinante
  const withoutNine = local.length === 11 ? `${local.slice(0, 2)}${local.slice(3)}` : local;

  // As grafias com `55`/tronco `0` precisam estar aqui: o banco real (3104
  // contatos medidos) guarda 44% em `55`+DDD+**sem** o nono dígito (12 dígitos)
  // e a variante só com o nono dígito não casa com eles. Um `eq` casaria
  // string formatada e um `ilike` casaria sufixo — a decisão continua em
  // `phonesMatchExact` (E.164 completo).
  return Array.from(
    new Set([
      e164, // +55DDD9XXXXXXXX
      e164.slice(1), // 55DDD9XXXXXXXX
      local, // DDD9XXXXXXXX
      withoutNine, // DDDXXXXXXXX
      `0${local}`, // 0DDD9XXXXXXXX
      `0${withoutNine}`, // 0DDDXXXXXXXX
      `55${withoutNine}`, // 55DDDXXXXXXXX  ← 44% da base real
    ]),
  );
}

/**
 * Entre candidatos vindos do banco, devolve o id do **único** contato que casa
 * em E.164 — ou `null` quando nenhum casa ou mais de um casa (ambíguo).
 *
 * É esta função que impede o vínculo errado: dois contatos com o mesmo final
 * de 8 dígitos e DDDs diferentes nunca casam entre si.
 */
export function pickUniquePhoneMatch<T extends { id: string; phone: string | null }>(
  rows: readonly T[],
  phone: string | null | undefined,
): string | null {
  if (normalizeE164BR(phone) === null) return null;
  const matched = rows.filter((row) => phonesMatchExact(row.phone, phone));
  return matched.length === 1 ? matched[0].id : null;
}
