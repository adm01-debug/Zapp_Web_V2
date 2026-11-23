/**
 * X076/IA-161 - os dois kinds da edge `talkx-ai` que ainda nao tinham tela.
 *
 * A edge entrega tres tipos de pedido. `message_variation` ja tinha botao no
 * wizard; `insight_text` e `segment_suggestion` voltavam do servidor e morriam
 * no cliente porque ninguem sabia o que fazer com a resposta. Este modulo e o
 * que faltava: transforma a saida da IA em algo que a tela consegue aplicar.
 *
 * Regra de ouro: a IA NUNCA aplica nada. Ela devolve uma sugestao; quem
 * valida e o cliente, com o MESMO catalogo de campos e operadores que o
 * construtor usa. Sugestao que cita campo inexistente, operador invalido para o
 * tipo do campo ou valor vazio e REJEITADA por inteiro: meia regra aplicada e
 * pior que nenhuma, porque o segmento passaria a filtrar errado sem aviso.
 */
import {
  RULE_FIELDS,
  RULE_OPS,
  type RuleField,
  type RuleOp,
  type SegmentRule,
  type SegmentRuleGroup,
  type SegmentRules,
} from '@/hooks/integrations/useTalkXSegments';

/** Teto de grupos/condicoes que uma sugestao pode trazer (o construtor tambem limita). */
export const SUGESTAO_MAX_GRUPOS = 5;
export const SUGESTAO_MAX_CONDICOES = 20;
/** Mesmo teto de texto da edge (`index.ts`), para recusar antes de pagar a chamada. */
export const SUGESTAO_MAX_PEDIDO = 8_000;

export interface SugestaoDeSegmento {
  rules: SegmentRules;
  /** Quantas condicoes vieram - a tela mostra para o usuario saber o alcance. */
  condicoes: number;
  /** Condicoes descartadas porque o campo/operador nao existe no catalogo. */
  descartadas: string[];
}

export type ResultadoSugestao =
  | { ok: true; sugestao: SugestaoDeSegmento }
  | { ok: false; motivo: string };

function campoValido(valor: unknown): valor is RuleField {
  return typeof valor === 'string' && RULE_FIELDS.some((f) => f.value === valor);
}

function tipoDoCampo(field: RuleField): string {
  return RULE_FIELDS.find((f) => f.value === field)?.kind ?? 'text';
}

/** Operador existe para o TIPO do campo? `uuid` nao aceita "contem", por exemplo. */
function operadorValido(field: RuleField, op: unknown): op is RuleOp {
  if (typeof op !== 'string') return false;
  const permitidos = RULE_OPS[tipoDoCampo(field)] ?? [];
  return permitidos.some((o) => o.value === op);
}

/** Operadores que nao usam valor: `is_empty`/`is_set` - exigir valor barraria sugestao valida. */
const SEM_VALOR = new Set<RuleOp>(['is_empty', 'is_set']);

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `ia-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/**
 * Converte a saida JSON da IA em `SegmentRules` do produto.
 *
 * Aceita o formato canonico (`{ groups: [{ match, rules: [{ field, op, value }] }] }`)
 * e tolera o que o modelo costuma variar: `rules` sem envolucro de `groups` (vira um
 * grupo so) e `value` numerico (vira texto, que e o que o banco guarda).
 */
export function sugestaoParaRegras(saida: unknown): ResultadoSugestao {
  if (!saida || typeof saida !== 'object' || Array.isArray(saida)) {
    return { ok: false, motivo: 'A IA devolveu uma sugestão fora do formato esperado.' };
  }
  const objeto = saida as Record<string, unknown>;

  // Grupos: `groups` quando vier; senao, um grupo unico com os `rules` da raiz.
  const gruposBrutos: unknown[] = Array.isArray(objeto.groups)
    ? objeto.groups
    : Array.isArray(objeto.rules)
      ? [{ match: 'and', rules: objeto.rules }]
      : [];

  if (gruposBrutos.length === 0) {
    return { ok: false, motivo: 'A IA não sugeriu nenhuma condição de segmento.' };
  }
  if (gruposBrutos.length > SUGESTAO_MAX_GRUPOS) {
    return { ok: false, motivo: `A IA sugeriu ${gruposBrutos.length} grupos; o máximo é ${SUGESTAO_MAX_GRUPOS}.` };
  }

  const grupos: SegmentRuleGroup[] = [];
  const descartadas: string[] = [];
  let condicoes = 0;

  for (const grupoBruto of gruposBrutos) {
    if (!grupoBruto || typeof grupoBruto !== 'object' || Array.isArray(grupoBruto)) {
      descartadas.push('grupo sem formato');
      continue;
    }
    const g = grupoBruto as Record<string, unknown>;
    const match: 'and' | 'or' = g.match === 'or' ? 'or' : 'and';
    const regrasBrutas = Array.isArray(g.rules) ? g.rules : [];
    const regras: SegmentRule[] = [];

    for (const regraBruta of regrasBrutas) {
      condicoes += 1;
      if (condicoes > SUGESTAO_MAX_CONDICOES) {
        return { ok: false, motivo: `A IA sugeriu mais de ${SUGESTAO_MAX_CONDICOES} condições; refine o pedido.` };
      }
      if (!regraBruta || typeof regraBruta !== 'object' || Array.isArray(regraBruta)) {
        descartadas.push('condição sem formato');
        continue;
      }
      const r = regraBruta as Record<string, unknown>;
      if (!campoValido(r.field)) {
        descartadas.push(typeof r.field === 'string' ? `campo desconhecido: ${r.field}` : 'condição sem campo');
        continue;
      }
      if (!operadorValido(r.field, r.op)) {
        descartadas.push(`${r.field}: operador inválido (${String(r.op)})`);
        continue;
      }
      const valor = SEM_VALOR.has(r.op) ? '' : typeof r.value === 'number' ? String(r.value) : typeof r.value === 'string' ? r.value.trim() : '';
      // Condicao com valor vazio nao filtra nada: descarta em vez de publicar um
      // filtro que parece existir e nao recorta nada.
      if (!SEM_VALOR.has(r.op) && valor === '') {
        descartadas.push(`${r.field}: condição sem valor`);
        continue;
      }
      regras.push({ id: novoId(), field: r.field, op: r.op, value: valor });
    }

    if (regras.length > 0) grupos.push({ id: novoId(), match, rules: regras });
  }

  if (grupos.length === 0) {
    return {
      ok: false,
      motivo: descartadas.length > 0
        ? `A IA sugeriu apenas condições que o produto não aceita: ${descartadas.join('; ')}.`
        : 'A IA não sugeriu nenhuma condição válida.',
    };
  }

  return {
    ok: true,
    sugestao: {
      rules: { groups: grupos, join: 'or' },
      condicoes: grupos.reduce((total, g) => total + g.rules.length, 0),
      descartadas,
    },
  };
}

/**
 * Resumo textual de uma regra para mandar como `input.regra` do `insight_text`.
 *
 * A edge manda o JSON canonico para o modelo e devolve uma frase; para o modelo
 * explicar algo util a entrada precisa ser dado JA CALCULADO (sem PII), nao
 * texto de campanha. E o que este resumo monta a partir do insight heurístico.
 */
export function regraParaExplicar(insight: {
  type: string;
  title: string;
  description: string;
  priority: string;
  meta?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    tipo: insight.type,
    titulo: insight.title,
    descricao: insight.description,
    prioridade: insight.priority,
    ...(insight.meta && Object.keys(insight.meta).length > 0 ? { dados: insight.meta } : {}),
  };
}

/** Texto do pedido livre do construtor -> validacao antes de gastar a chamada. */
export function pedidoDeSegmentoValido(pedido: string): string | null {
  const texto = pedido.trim();
  if (texto === '') return 'Escreva em palavras o público que você quer montar.';
  if (texto.length > SUGESTAO_MAX_PEDIDO) return `O pedido pode ter no máximo ${SUGESTAO_MAX_PEDIDO} caracteres.`;
  return null;
}
