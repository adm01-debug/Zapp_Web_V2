// Mesmo conjunto de talkx-send/index.ts — um campo customizado com um desses
// nomes nunca pode sequestrar o placeholder built-in correspondente no preview.
const PREVIEW_RESERVED_PLACEHOLDER_KEYS = new Set(['saudacao', 'link', 'nome', 'nome_completo', 'apelido', 'empresa']);

export function personalizePreview(
  template: string,
  contact?: { name?: string | null; nickname?: string | null; company?: string | null } | null,
  customValues: Record<string, string> = {},
) {
  const c = contact ?? { name: 'João Silva', nickname: null, company: 'Sua Empresa' };
  const firstName = (c.name || '').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const contactValues: Record<string, string> = {
    nome: firstName,
    nome_completo: c.name || '',
    apelido: c.nickname || firstName,
    empresa: c.company || '',
    saudacao: greeting,
  };
  // Campo customizado do CRM casado por chave normalizada, igual ao envio real.
  const normalizedCustomValues = new Map<string, string>();
  for (const [key, value] of Object.entries(customValues)) {
    const normalizedKey = key.toLowerCase();
    if (PREVIEW_RESERVED_PLACEHOLDER_KEYS.has(normalizedKey)) continue;
    normalizedCustomValues.set(normalizedKey, value);
  }
  // Passe único sobre o template original: substituições sequenciais permitem
  // que um dado de contato ou campo customizado contendo literalmente
  // "{{algumacoisa}}" (ex.: empresa = "{{cargo}}") seja rescaneado e
  // reinterpretado como placeholder pela chamada seguinte — o preview
  // mostraria algo diferente do que o envio real produz (personalize() em
  // talkx-send/index.ts já resolve tudo num único passe pelo mesmo motivo).
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.toLowerCase();
    // hasOwnProperty (não "in"): evita vazar propriedade herdada de
    // Object.prototype para um placeholder tipo {{constructor}}.
    if (Object.prototype.hasOwnProperty.call(contactValues, key)) return contactValues[key];
    if (normalizedCustomValues.has(key)) return normalizedCustomValues.get(key)!;
    // Qualquer variável sem valor no preview (link de rastreio, variável
    // customizada sem valor real) — mostrar "[variavel]" bate com o que o
    // envio real faz quando o contato não tem aquele campo preenchido.
    return `[${rawKey}]`;
  });
}
