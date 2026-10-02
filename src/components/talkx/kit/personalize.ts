/**
 * talkxPersonalizePreview.ts — prévia de personalização do wizard (X020).
 *
 * Módulo PURO (sem React nem imports) que replica, para a prévia, a MESMA regra
 * de `supabase/functions/_shared/messaging/personalize.ts` (envio real):
 *   - built-ins: nome, nome_completo, apelido, empresa, saudacao, link,
 *     vendedor, telefone, data_atual/data (dd/mm/aaaa no fuso);
 *   - sintaxe `{{chave|padrão}}` (primeiro `|` separa chave de padrão);
 *   - passe único sobre o template (dado de contato nunca é rescaneado);
 *   - campo customizado reservado nunca sequestra um built-in.
 *
 * Fica num arquivo separado de `talkxShared.tsx` (que apenas reexporta) porque
 * `talkxShared` puxa React/lucide/date-fns e não é importável fora do bundler —
 * o teste de paridade `scripts/db-audit/talkx-personalize-parity.test.mjs`
 * precisa importar a MESMA função do front e do edge e comparar as saídas.
 *
 * Diferença proposital: aqui o retorno é STRING (a prévia só mostra o texto);
 * o relatório `{ text, missing, unknown }` é do kernel do edge.
 */

export type PreviewContact = {
  name?: string | null;
  nickname?: string | null;
  company?: string | null;
  phone?: string | null;
  vendedor?: string | null;
};

/** Mesmo default de `DEFAULT_SCHEDULE_TIMEZONE` do edge. (não exportado: não é
 * parte da superfície pública do barrel — o teste de paridade chama com fuso
 * explícito). */
const PREVIEW_DEFAULT_TIMEZONE = "America/Sao_Paulo";

// Mesmo conjunto de talkx-send/_shared/messaging/personalize.ts — um campo
// customizado com um desses nomes nunca pode sequestrar o placeholder built-in.
const RESERVED_PLACEHOLDER_KEYS = new Set([
  "saudacao", "link", "nome", "nome_completo", "apelido", "empresa",
  "vendedor", "data_atual", "data", "telefone",
]);

function greetingInTimezone(timeZone: string): string {
  const hour = parseInt(
    new Date().toLocaleString("pt-BR", { timeZone, hour: "numeric", hour12: false }),
    10,
  );
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

function dateInTimezone(timeZone: string): string {
  return new Date().toLocaleDateString("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function personalizePreview(
  template: string,
  contact?: PreviewContact | null,
  customValues: Record<string, string> = {},
  timeZone: string = PREVIEW_DEFAULT_TIMEZONE,
  trackingUrl?: string,
): string {
  const c = contact ?? {
    name: 'João Silva', nickname: null, company: 'Sua Empresa',
    phone: '+55 11 99999-9999', vendedor: 'Ana Souza',
  };
  const firstName = (c.name || '').split(' ')[0];
  const today = dateInTimezone(timeZone);
  const contactValues: Record<string, string> = {
    nome: firstName,
    nome_completo: c.name || '',
    apelido: c.nickname || firstName,
    empresa: c.company || '',
    vendedor: c.vendedor || '',
    telefone: c.phone || '',
  };
  // Campo customizado do CRM casado por chave normalizada, igual ao envio real.
  const normalizedCustomValues = new Map<string, string>();
  for (const [key, value] of Object.entries(customValues)) {
    const normalizedKey = key.toLowerCase();
    if (RESERVED_PLACEHOLDER_KEYS.has(normalizedKey)) continue;
    normalizedCustomValues.set(normalizedKey, value);
  }
  // Passe único sobre o template original: substituições sequenciais permitem
  // que um dado de contato ou campo customizado contendo literalmente
  // "{{algumacoisa}}" (ex.: empresa = "{{cargo}}") seja rescaneado e
  // reinterpretado como placeholder pela chamada seguinte — o preview
  // mostraria algo diferente do que o envio real produz.
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, rawKey: string) => {
    const pipeIndex = rawKey.indexOf('|');
    const key = (pipeIndex === -1 ? rawKey : rawKey.slice(0, pipeIndex)).trim().toLowerCase();
    const fallback = pipeIndex === -1 ? null : rawKey.slice(pipeIndex + 1);
    if (key === 'saudacao') return greetingInTimezone(timeZone);
    if (key === 'data_atual' || key === 'data') return today;
    if (key === 'link') {
      if (trackingUrl) return trackingUrl;
      if (fallback !== null) return fallback;
      return `[${rawKey}]`;
    }
    // hasOwnProperty (não "in"): evita vazar propriedade herdada de
    // Object.prototype para um placeholder tipo {{constructor}}.
    if (Object.prototype.hasOwnProperty.call(contactValues, key)) {
      const value = contactValues[key];
      if (value) return value;
      if (fallback !== null) return fallback;
      return value;
    }
    if (normalizedCustomValues.has(key)) {
      const value = normalizedCustomValues.get(key) ?? '';
      if (value) return value;
      if (fallback !== null) return fallback;
      return value;
    }
    if (fallback !== null) return fallback;
    // Qualquer variável sem valor no preview (variável customizada sem valor
    // real) — mostrar "[variavel]" bate com o texto que o envio real produziria
    // (mesmo que o destinatário acabe skipped por missing/unknown).
    return `[${rawKey}]`;
  });
}
