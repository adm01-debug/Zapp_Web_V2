/**
 * Mapa único tipado de ELEGIBILIDADE do Multiplix — fronteira PT (Singu) ↔ EN (Zapp).
 *
 * ESTE é o único lugar do repositório onde a elegibilidade muda de idioma.
 * Decisão do dono (bloco C / F30–F31): o BANCO do Zapp fala INGLÊS
 * (`public.multiplix_eligibility` = os 7 valores abaixo) e a UI fala PORTUGUÊS
 * (`ELIGIBILITY_LABELS_PT`). O produtor canônico é o banco do SINGU, um projeto
 * EXTERNO e separado, cuja RPC `multiplix_resolve_recipients` devolve a coluna
 * `elegibilidade` em português (`apto` | `destino_invalido` | `fora_do_escopo`
 * — ver `supabase/migrations/_foreign/singu/multiplix_resolve_recipients.sql`).
 *
 * Fronteira: o Singu fala PT, o Zapp fala EN, e a tradução acontece SÓ aqui —
 * `fromSinguEligibility` é o único ponto de conversão. Consumidores do Zapp
 * (edge `multiplix-audience`, RPC `multiplix_create_draft`, front) NUNCA
 * comparam com literais PT: eles usam os valores canônicos em inglês deste
 * módulo. Aplicar a mesma regra que o repo já usa no vocabulário de IA: o
 * módulo canônico vive em `supabase/functions/_shared/` e o front reexporta
 * (`src/lib/multiplix-eligibility.ts`).
 *
 * Regras deste módulo:
 *   1. Sem imports externos, funções puras, sem `console.log`.
 *   2. Valor desconhecido NUNCA vira `eligible` por adivinhação: o fallback é
 *      `out_of_scope` (ver `fromSinguEligibility`). É o lado seguro da
 *      fronteira — ver a justificativa na função.
 *   3. O rótulo PT é exaustivo: `ELIGIBILITY_LABELS_PT` é um
 *      `Record<MultiplixEligibility, string>`, então adicionar um valor ao enum
 *      sem o rótulo quebra o `deno check`/`tsc` (e o teste de exaustividade).
 */

/**
 * Os 7 valores do enum `public.multiplix_eligibility` (F30), em INGLÊS — a
 * linguagem do banco do Zapp. A ordem segue a definição do tipo na migration
 * `20261001201230_f30_multiplix_enums_modelo_v2.sql`.
 */
export const MULTIPLIX_ELIGIBILITY_VALUES = [
  'eligible',
  'no_destination',
  'suppressed',
  'out_of_scope',
  'media_pending',
  'connection_unavailable',
  'requires_template',
] as const;

/** Valor canônico de elegibilidade do Zapp (enum do banco, em inglês). */
export type MultiplixEligibility = (typeof MULTIPLIX_ELIGIBILITY_VALUES)[number];

/**
 * Rótulo PT de cada valor canônico — o que a UI mostra. `Record` EXAUSTIVO de
 * propósito: a chave ausente é erro de compilação, então o enum e o mapa de
 * rótulos não conseguem divergir em silêncio.
 */
export const ELIGIBILITY_LABELS_PT: Readonly<Record<MultiplixEligibility, string>> = {
  eligible: 'Apto',
  no_destination: 'Destino inválido',
  suppressed: 'Suprimido',
  out_of_scope: 'Fora do escopo',
  media_pending: 'Mídia pendente',
  connection_unavailable: 'Conexão indisponível',
  requires_template: 'Exige modelo',
};

/**
 * Vocabulário que o Singu devolve HOJE em `elegibilidade` (PT). É o contrato do
 * produtor externo — mude aqui SÓ quando a RPC do Singu mudar de vocabulário.
 */
export const SINGU_ELIGIBILITY_VALUES = ['apto', 'destino_invalido', 'fora_do_escopo'] as const;

/** Literal de elegibilidade do Singu (português). */
export type SinguEligibility = (typeof SINGU_ELIGIBILITY_VALUES)[number];

/**
 * Fallback de valor desconhecido: `out_of_scope`.
 *
 * ESCOLHA SEGURA e deliberada. Um valor que não é um dos literais conhecidos do
 * Singu não pode virar `eligible` sem revisão: `eligible` é o ÚNICO valor que o
 * filtro da RPC (`multiplix_create_draft` / `mapResolvedRecipients`) deixa
 * passar, então promover um desconhecido a `eligible` significaria disparar
 * mensagem para quem talvez não possa receber. `out_of_scope` é o valor que NÃO
 * dispara: a linha é descartada e o caso fica visível para revisão em vez de
 * virar envio indevido. (Mesmo princípio do vocabulário de IA: desconhecido não
 * cai em default inventado.)
 */
export const MULTIPLIX_ELIGIBILITY_FALLBACK: MultiplixEligibility = 'out_of_scope';

/**
 * Tradução PT (Singu) → EN (Zapp) dos literais conhecidos. Cobre exatamente os
 * 3 valores que o produtor externo devolve hoje.
 */
const SINGU_TO_ZAPP: Readonly<Record<SinguEligibility, MultiplixEligibility>> = {
  apto: 'eligible',
  destino_invalido: 'no_destination',
  fora_do_escopo: 'out_of_scope',
};

function isSinguEligibility(token: string): token is SinguEligibility {
  return Object.prototype.hasOwnProperty.call(SINGU_TO_ZAPP, token);
}

/**
 * Traduz a elegibilidade crua do Singu (PT) para o valor canônico do Zapp (EN).
 *
 * Semântica (é o contrato que a edge já tinha com a RPC e que os testes fixam):
 *   - `'apto'`            → `'eligible'`
 *   - `'destino_invalido'`→ `'no_destination'`
 *   - `'fora_do_escopo'`  → `'out_of_scope'`
 *   - ausente (`null`/`undefined`): → `'eligible'`. É o resolvedor ANTIGO, que
 *     não devolvia a coluna; a RPC do Singu (`COALESCE(..., 'apto')`) e a do
 *     Zapp tratam a ausência como apto por contrato — descartar a linha por
 *     causa disso mudaria o comportamento. A coluna `eligibility` do F31 é
 *     `NOT NULL`, então a ausência precisa virar um valor concreto: `eligible`.
 *   - QUALQUER OUTRO (string vazia, valor novo do Singu, valor inventado):
 *     → `MULTIPLIX_ELIGIBILITY_FALLBACK` (`out_of_scope`). Nunca `eligible`.
 *
 * A normalização é `trim` + minúsculas (mesma regra do vocabulário de IA): a
 * forma exata do literal é casada, e variações óbvias de caixa/espaço do MESMO
 * literal não mudam o significado. O desconhecido continua caindo no fallback.
 */
export function fromSinguEligibility(raw: unknown): MultiplixEligibility {
  if (raw === null || raw === undefined) return 'eligible';
  // Só string é token: `String(['apto'])` viraria 'apto' e um array/objeto
  // forjado passaria a valer como literal conhecido. Tipo errado é desconhecido.
  if (typeof raw !== 'string') return MULTIPLIX_ELIGIBILITY_FALLBACK;
  const token = raw.trim().toLowerCase();
  if (isSinguEligibility(token)) return SINGU_TO_ZAPP[token];
  return MULTIPLIX_ELIGIBILITY_FALLBACK;
}
