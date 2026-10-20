/**
 * Completude do cadastro do contato (0–100).
 *
 * Paridade com o `src/lib/contactHealth.ts` da V3, com duas correções pedidas no
 * cartão: (1) a etiqueta (tags) NÃO pontua — a função foi excluída do sistema; e
 * (2) os pesos estão documentados abaixo e somam 100.
 *
 * Semântica de "campo preenchido" (o que a função considera):
 *  - chave AUSENTE (`undefined`) = NÃO AVALIADO. O campo sai do denominador e não
 *    aparece na lista de faltas. É o que permite a lista de contatos (a RPC
 *    `search_contacts` devolve `address`, mas não `assigned_to`) mostrar a
 *    completude só dos campos que ela realmente carrega, sem afirmar que o
 *    responsável está faltando quando o dado apenas não foi consultado.
 *  - `null`, string vazia ou só espaços = AVALIADO e FALTANDO.
 *  - valor preenchido = pontua o peso do campo.
 *
 * A pontuação é normalizada pelo peso dos campos avaliados:
 * `round(100 * peso_preenchido / peso_avaliado)`.
 */

export type ContactHealthFieldKey =
  | 'name'
  | 'phone'
  | 'email'
  | 'company'
  | 'job_title'
  | 'contact_type'
  | 'address'
  | 'assigned_to';

/** Campos que a completude lê. Aceita `Contact`, `ContactDetail` e fixtures parciais. */
export interface ContactHealthInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  job_title?: string | null;
  contact_type?: string | null;
  address?: string | null;
  assigned_to?: string | null;
}

export interface ContactHealthField {
  key: ContactHealthFieldKey;
  /** Rótulo em pt-BR, o mesmo que a lista de faltas exibe. */
  label: string;
  /** Peso no total. A soma dos 8 pesos é 100. */
  weight: number;
}

/**
 * Pesos (soma = 100). Ordem = ordem da lista de faltas na tela.
 * O telefone é o canal de contato do produto (WhatsApp): maior peso junto do nome.
 */
export const CONTACT_HEALTH_FIELDS: readonly ContactHealthField[] = [
  { key: 'name', label: 'Nome', weight: 20 },
  { key: 'phone', label: 'Telefone', weight: 20 },
  { key: 'email', label: 'E-mail', weight: 15 },
  { key: 'company', label: 'Empresa', weight: 10 },
  { key: 'job_title', label: 'Cargo', weight: 10 },
  { key: 'contact_type', label: 'Tipo', weight: 10 },
  { key: 'address', label: 'Endereço', weight: 10 },
  { key: 'assigned_to', label: 'Responsável', weight: 5 },
];

export type ContactHealthLevel = 'completo' | 'bom' | 'incompleto' | 'critico' | 'indefinido';

export interface ContactHealthMissingField {
  key: ContactHealthFieldKey;
  label: string;
}

export interface ContactHealth {
  /** 0–100, normalizado pelos campos avaliados. */
  score: number;
  level: ContactHealthLevel;
  /** Texto do nível em pt-BR (aparece sempre junto do número — cor não é o único sinal). */
  label: string;
  /** Campos avaliados e vazios, na ordem de `CONTACT_HEALTH_FIELDS`. */
  missing: ContactHealthMissingField[];
  filledCount: number;
  evaluatedCount: number;
}

/** Um valor `string` conta como preenchido pelo critério do campo. */
function isFieldFilled(key: ContactHealthFieldKey, value: string | null): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  switch (key) {
    // V3 usava "mais de 2 caracteres" para o nome; mantido.
    case 'name':
      return trimmed.length > 2;
    // V3 usava "mais de 5 caracteres"; aqui o piso é o de um telefone discável (8 dígitos).
    case 'phone':
      return trimmed.replace(/\D/g, '').length >= 8;
    // V3 usava "contém @"; mantido (completude não é validação de e-mail).
    case 'email':
      return trimmed.includes('@');
    default:
      return true;
  }
}

function describeLevel(score: number, evaluatedCount: number): { level: ContactHealthLevel; label: string } {
  if (evaluatedCount === 0) return { level: 'indefinido', label: 'Sem dados' };
  if (score >= 90) return { level: 'completo', label: 'Completo' };
  if (score >= 70) return { level: 'bom', label: 'Bom' };
  if (score >= 40) return { level: 'incompleto', label: 'Incompleto' };
  return { level: 'critico', label: 'Crítico' };
}

/**
 * Calcula a completude de UM contato. Função pura: não consulta banco, não loga
 * dado do contato (nem telefone nem e-mail) e não depende do React.
 */
export function calculateContactHealth(input: ContactHealthInput | null | undefined): ContactHealth {
  let filledWeight = 0;
  let evaluatedWeight = 0;
  let filledCount = 0;
  let evaluatedCount = 0;
  const missing: ContactHealthMissingField[] = [];

  for (const field of CONTACT_HEALTH_FIELDS) {
    const value = input ? input[field.key] : undefined;
    // Chave ausente = não avaliado (não pune, não entra em "faltam").
    if (value === undefined) continue;

    evaluatedWeight += field.weight;
    evaluatedCount += 1;

    if (isFieldFilled(field.key, value)) {
      filledWeight += field.weight;
      filledCount += 1;
    } else {
      missing.push({ key: field.key, label: field.label });
    }
  }

  const score = evaluatedWeight === 0 ? 0 : Math.round((filledWeight / evaluatedWeight) * 100);
  const { level, label } = describeLevel(score, evaluatedCount);

  return { score, level, label, missing, filledCount, evaluatedCount };
}
