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
 *      {{empresa}}, {{saudacao}}, {{link}}, {{vendedor}}, {{telefone}},
 *      {{data_atual}}, {{data}} + qualquer campo customizado do CRM.
 *      Variável sem valor cai no fallback "[variavel]" (NUNCA string vazia
 *      silenciosa, NUNCA "{{variavel}}" cru). Passe ÚNICO sobre o template
 *      original: valor inserido nunca é rescaneado como sintaxe de placeholder.
 *
 *   2. Multiplix — `personalizeMultiplix`: conjunto FIXO de DUAS chaves,
 *      {{saudacao}} e {{empresa}} (case-insensitive). Qualquer placeholder fora
 *      desse conjunto lança "unknown_placeholder" — falha explícita, em vez de
 *      vazar o "{{...}}" cru na mensagem real do WhatsApp.
 *
 * X020 — política de variável (edge): `personalize` passou a devolver TAMBÉM o
 * relatório do que foi resolvido ({ text, missing, unknown }):
 *   - `missing`: chave CONHECIDA (nativa/custom/link) sem valor e sem padrão.
 *     Em `process-recipient.ts` isso vira destinatário `skipped` com
 *     `missing_variable:<nome>` — SEM POST ao provedor.
 *   - `unknown`: nome que não é nativa, nem campo customizado existente, nem
 *     link cadastrado. Na ação `start` isso responde 422 com a lista.
 *   - sintaxe `{{chave|padrão}}`: o primeiro `|` separa a chave do valor padrão;
 *     chave sem valor e COM padrão usa o padrão (não entra em `missing`).
 *
 * Os consumidores que só querem o texto (Multiplix, preview de teste) leem
 * `.text` — o texto produzido é IDÊNTICO ao da assinatura antiga que devolvia
 * string.
 *
 * Tipos ficam exportados neste arquivo; a consolidação em `types.ts` é da etapa
 * do líder.
 */

import { DEFAULT_SCHEDULE_TIMEZONE } from "../talkx-window.ts";

/** Contato no dialeto TalkX: {name, nickname, company, phone, vendedor} do CRM. */
export type PersonalizeContact = {
  name?: string | null;
  nickname?: string | null;
  company?: string | null;
  /** X020: telefone do contato (contacts.phone). */
  phone?: string | null;
  /** X020: nome do responsável (contacts.assigned_to -> profiles.name). */
  vendedor?: string | null;
};

/** Campos customizados do CRM (chave = nome do campo como foi digitado). */
export type PersonalizeCustomValues = Record<string, string>;

/** X020: relatório de resolução — o texto + o que ficou faltando/não existe. */
export type PersonalizeResult = {
  text: string;
  /** Chaves conhecidas sem valor e sem padrão (ex.: "empresa"). */
  missing: string[];
  /** Nomes que não são nativos, nem campo customizado existente, nem link. */
  unknown: string[];
};

/** Contato no dialeto Multiplix: apenas o nome da empresa. */
export type MultiplixCompanyContact = { name?: string | null };

export function getGreeting(timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  const hour = new Date().toLocaleString("pt-BR", { timeZone, hour: "numeric", hour12: false });
  const h = Number.parseInt(hour, 10);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** X020: dd/mm/aaaa no fuso da campanha (para {{data_atual}} e {{data}}). */
export function formatDateInTimezone(timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  return new Date().toLocaleDateString("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Nomes reservados aos built-ins — um campo customizado do CRM com um desses
// nomes (ex.: contato com campo "link") nunca pode sequestrar o placeholder
// built-in correspondente (achado do review: "link" comeria {{link}} antes do
// passe de tracking). X020: vendedor/data_atual/data/telefone entram aqui pelo
// mesmo motivo (um campo "telefone" não pode sequestrar {{telefone}}).
const RESERVED_PLACEHOLDER_KEYS = new Set([
  "saudacao", "link", "nome", "nome_completo", "apelido", "empresa",
  "vendedor", "data_atual", "data", "telefone",
]);

export function personalize(
  template: string,
  contact: PersonalizeContact,
  customValues: PersonalizeCustomValues = {},
  timeZone = DEFAULT_SCHEDULE_TIMEZONE,
  trackingUrl?: string,
): PersonalizeResult {
  const firstName = (contact.name || '').split(' ')[0] || '';
  const today = formatDateInTimezone(timeZone);
  const contactValues: Record<string, string> = {
    nome: firstName,
    nome_completo: contact.name || '',
    apelido: contact.nickname || firstName,
    empresa: contact.company || '',
    // X020: built-ins novos. Vazios caem em `missing` (nunca viram "[chave]"
    // porque o texto atual para built-in sem valor é string vazia).
    vendedor: contact.vendedor || '',
    telefone: contact.phone || '',
  };
  // Nome do campo customizado vem do CRM (case livre, ex.: "CPF"); o editor de
  // template força minúsculo no placeholder — casar por chave normalizada.
  const normalizedCustomValues = new Map<string, string>();
  for (const [key, value] of Object.entries(customValues)) {
    const normalizedKey = key.toLowerCase();
    if (RESERVED_PLACEHOLDER_KEYS.has(normalizedKey)) continue;
    normalizedCustomValues.set(normalizedKey, value);
  }
  const missing = new Set<string>();
  const unknown = new Set<string>();
  // Passe único sobre o template original: um valor inserido (campo customizado
  // ou dado de contato) nunca é rescaneado como se fosse sintaxe de placeholder
  // (achado do review: {{cargo}} com valor literal "{{empresa}}" não pode virar
  // o nome da empresa).
  const text = template.replace(/\{\{([^}]+)\}\}/g, (fullMatch, rawKey: string) => {
    // X020: "{{chave|padrão}}" — o PRIMEIRO "|" separa chave de valor padrão.
    const pipeIndex = rawKey.indexOf("|");
    const key = (pipeIndex === -1 ? rawKey : rawKey.slice(0, pipeIndex)).trim().toLowerCase();
    const fallback = pipeIndex === -1 ? null : rawKey.slice(pipeIndex + 1);
    if (key === "saudacao") return getGreeting(timeZone);
    if (key === "data_atual" || key === "data") return today;
    // E90: {{link}} -> URL de rastreamento por destinatário
    if (key === "link") {
      if (trackingUrl) return trackingUrl;
      if (fallback !== null) return fallback;
      // Sem link cadastrado: conhecida e sem valor -> missing (o destinatário
      // vira skipped; nunca sai "[link]" para o cliente).
      missing.add("link");
      return `[${rawKey}]`;
    }
    // hasOwnProperty (não "in"): "in" também acha propriedades herdadas de
    // Object.prototype — um placeholder {{constructor}}/{{__proto__}} vazaria
    // texto de função/objeto em vez de cair no fallback (achado do review).
    if (Object.prototype.hasOwnProperty.call(contactValues, key)) {
      const value = contactValues[key];
      if (value) return value;
      if (fallback !== null) return fallback;
      missing.add(key);
      // Built-in sem valor mantém o texto atual (string vazia) — o envio real
      // NÃO manda mais o vazio: o destinatário é pulado por `missing`.
      return value;
    }
    if (normalizedCustomValues.has(key)) {
      const value = normalizedCustomValues.get(key) ?? "";
      if (value) return value;
      if (fallback !== null) return fallback;
      missing.add(key);
      return value;
    }
    // Chave com padrão nunca está "sem valor": o padrão é o valor.
    if (fallback !== null) return fallback;
    // Uma variável sem valor (nome digitado errado, campanha sem template com
    // placeholder solto, ou contato sem aquele campo customizado preenchido)
    // antes derrubava o envio inteiro para o destinatário (unknown_placeholder).
    // Mostrar "[variavel]" é sempre melhor que vazar "{{variavel}}" cru ou
    // bloquear o disparo. X020: a chave entra em `unknown` (a ação `start`
    // responde 422 antes de qualquer envio).
    unknown.add(key);
    return `[${rawKey}]`;
  });
  return { text, missing: Array.from(missing), unknown: Array.from(unknown) };
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
