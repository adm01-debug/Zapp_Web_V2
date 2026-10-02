/**
 * personalize.ts — kernel compartilhado de personalização de mensagens (F37).
 *
 * Extraído SEM reescrever a lógica de:
 *   - `personalize` + `getGreeting` de `supabase/functions/talkx-send/index.ts`
 *     (linhas 15-72 no original).
 *   - `personalizeMultiplix` de `supabase/functions/multiplix-send/index.ts`
 *     (linha 25 no original).
 *
 * Aceita os DOIS conjuntos de placeholders do projeto:
 *
 *   1. TalkX — `personalize`: {{nome}}, {{nome_completo}}, {{apelido}},
 *      {{empresa}}, {{saudacao}}, {{link}} + qualquer campo customizado do CRM.
 *      Variável sem valor cai no fallback "[variavel]" (NUNCA string vazia
 *      silenciosa, NUNCA "{{variavel}}" cru). Passe ÚNICO sobre o template
 *      original: valor inserido nunca é rescaneado como sintaxe de placeholder.
 *
 *   2. Multiplix — `personalizeMultiplix`: conjunto FIXO de DUAS chaves,
 *      {{saudacao}} e {{empresa}} (case-insensitive). Qualquer placeholder fora
 *      desse conjunto lança "unknown_placeholder" — falha explícita, em vez de
 *      vazar o "{{...}}" cru na mensagem real do WhatsApp.
 *
 * Por que os dois dialetos coexistem sem quebrar:
 *   O conjunto do Multiplix é um SUBCONJUNTO dos built-ins que `personalize`
 *   já resolve — "saudacao" e "empresa" estão ambos em
 *   RESERVED_PLACEHOLDER_KEYS/contactValues. O Multiplix mapeia o nome da
 *   empresa para `contact.company`, que é exatamente o campo consumido por
 *   {{empresa}} em `personalize`. Logo, o mesmo kernel atende o Multiplix.
 *   `personalizeMultiplix` segue separado por dois motivos que NÃO são de
 *   lógica de substituição: (a) a assinatura recebe `{ name }` (nome da
 *   empresa), não `{ name: pessoa, company }`; e (b) a política de erro é
 *   throw (Multiplix) em vez de fallback "[variavel]" (TalkX). Reescrever isso
 *   aqui seria mudar o comportamento — fora do escopo do F37.
 *
 * TODO(etapa futura / líder): religar `supabase/functions/multiplix-send/index.ts`
 * para importar `personalizeMultiplix` daqui. Hoje aquele arquivo ainda mantém
 * a cópia local; o F37 não altera aquele arquivo por regra dura de escopo.
 *
 * Tipos ficam exportados neste arquivo; a consolidação em `types.ts` é da etapa
 * do líder.
 */

import { DEFAULT_SCHEDULE_TIMEZONE } from "../talkx-window.ts";

/** Contato no dialeto TalkX: {name, nickname, company} vindos do CRM. */
export type PersonalizeContact = {
  name?: string | null;
  nickname?: string | null;
  company?: string | null;
};

/** Campos customizados do CRM (chave = nome do campo como foi digitado). */
export type PersonalizeCustomValues = Record<string, string>;

/** Contato no dialeto Multiplix: apenas o nome da empresa. */
export type MultiplixCompanyContact = { name?: string | null };

export function getGreeting(timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  const hour = new Date().toLocaleString("pt-BR", { timeZone, hour: "numeric", hour12: false });
  const h = parseInt(hour, 10);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

// Nomes reservados aos built-ins — um campo customizado do CRM com um desses
// nomes (ex.: contato com campo "link") nunca pode sequestrar o placeholder
// built-in correspondente (achado do review: "link" comeria {{link}} antes do
// passe de tracking).
const RESERVED_PLACEHOLDER_KEYS = new Set(["saudacao", "link", "nome", "nome_completo", "apelido", "empresa"]);

export function personalize(
  template: string,
  contact: PersonalizeContact,
  customValues: PersonalizeCustomValues = {},
  timeZone = DEFAULT_SCHEDULE_TIMEZONE,
  trackingUrl?: string,
): string {
  const firstName = (contact.name || '').split(' ')[0] || '';
  const contactValues: Record<string, string> = {
    nome: firstName,
    nome_completo: contact.name || '',
    apelido: contact.nickname || firstName,
    empresa: contact.company || '',
  };
  // Nome do campo customizado vem do CRM (case livre, ex.: "CPF"); o editor de
  // template força minúsculo no placeholder — casar por chave normalizada.
  const normalizedCustomValues = new Map<string, string>();
  for (const [key, value] of Object.entries(customValues)) {
    const normalizedKey = key.toLowerCase();
    if (RESERVED_PLACEHOLDER_KEYS.has(normalizedKey)) continue;
    normalizedCustomValues.set(normalizedKey, value);
  }
  // Passe único sobre o template original: um valor inserido (campo customizado
  // ou dado de contato) nunca é rescaneado como se fosse sintaxe de placeholder
  // (achado do review: {{cargo}} com valor literal "{{empresa}}" não pode virar
  // o nome da empresa).
  return template.replace(/\{\{([^}]+)\}\}/g, (fullMatch, rawKey: string) => {
    const key = rawKey.toLowerCase();
    if (key === "saudacao") return getGreeting(timeZone);
    // E90: {{link}} -> URL de rastreamento por destinatário
    if (key === "link") return trackingUrl ?? `[${rawKey}]`;
    // hasOwnProperty (não "in"): "in" também acha propriedades herdadas de
    // Object.prototype — um placeholder {{constructor}}/{{__proto__}} vazaria
    // texto de função/objeto em vez de cair no fallback (achado do review).
    if (Object.prototype.hasOwnProperty.call(contactValues, key)) return contactValues[key];
    if (normalizedCustomValues.has(key)) return normalizedCustomValues.get(key)!;
    // Uma variável sem valor (nome digitado errado, campanha sem template com
    // placeholder solto, ou contato sem aquele campo customizado preenchido)
    // antes derrubava o envio inteiro para o destinatário (unknown_placeholder).
    // Mostrar "[variavel]" é sempre melhor que vazar "{{variavel}}" cru ou
    // bloquear o disparo.
    return `[${rawKey}]`;
  });
}

/**
 * Dialeto Multiplix: conjunto FIXO de placeholders ({{saudacao}}, {{empresa}}),
 * case-insensitive. Qualquer outro "{{...}}" restante lança unknown_placeholder.
 * Movido verbatim de multiplix-send/index.ts:25 — ver o cabeçalho deste arquivo
 * para o motivo de continuar sendo uma função separada de `personalize`.
 */
export function personalizeMultiplix(
  template: string,
  company: MultiplixCompanyContact,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE,
): string {
  let result = template.replace(/\{\{saudacao\}\}/gi, getGreeting(timeZone));
  result = result.replace(/\{\{empresa\}\}/gi, company.name || '');
  // Um placeholder fora de {{empresa}}/{{saudacao}} chegaria intacto na mensagem real
  // do WhatsApp sem erro nem aviso — falha explicita evita esse vazamento (mesmo
  // principio de talkx-send/personalize).
  const unknownPlaceholder = result.match(/\{\{[^}]+\}\}/);
  if (unknownPlaceholder) {
    throw new Error(`unknown_placeholder: ${unknownPlaceholder[0]}`);
  }
  return result;
}
