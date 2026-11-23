/**
 * X076/IA-161 - consumidor da edge `talkx-ai`.
 *
 * A edge existe, grava a trilha e aplica os tres tetos, mas nada no front a
 * chamava: ela ficava órfã (grupo D no ESTADO.md) e a funcionalidade nao
 * existia para o usuario. Este hook é o único ponto de chamada e traduz cada
 * recusa da edge em um estado que a UI mostra honestamente:
 *
 *   ai_disabled (403)               -> a IA esta desligada no painel de ajustes
 *   budget_exceeded (429)           -> o teto do mes acabou
 *   user_daily_limit_exceeded (429) -> o limite diario do usuario acabou
 *   forbidden (403)                 -> nao e admin/supervisor
 *
 * Nada e inventado no cliente: o texto do erro vem do motivo que a edge
 * devolveu. As recusas acontecem ANTES da chamada paga (`index.ts:460-478`),
 * entao mostra-las nao custa token nenhum.
 */
import { useMutation } from '@tanstack/react-query';

import { invokeEdge, type EdgeFunctionError } from '@/lib/invokeEdge';

export const TALKX_AI_KINDS = ['insight_text', 'message_variation', 'segment_suggestion'] as const;
export type TalkxAiKind = (typeof TALKX_AI_KINDS)[number];

/** Resposta de sucesso da edge (`index.ts`, caminho 200). */
export interface RespostaTalkxAi {
  ok: true;
  kind: TalkxAiKind;
  cached: boolean;
  output: unknown;
  model?: string | null;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number | null;
}

/** Recusa conhecida, com o texto que o operador consegue agir sobre. */
export interface RecusaTalkxAi {
  code: string;
  message: string;
  status: number | null;
}

const MENSAGENS: Record<string, string> = {
  ai_disabled: 'A IA do Talk X está desligada. Um administrador precisa definir o teto mensal em Ajustes.',
  budget_exceeded: 'O teto mensal de IA foi atingido. Nenhuma chamada paga será feita até o próximo mês ou até o teto ser ajustado.',
  user_daily_limit_exceeded: 'Você atingiu o limite diário de pedidos de IA. Tente novamente amanhã.',
  forbidden: 'Somente administradores e supervisores podem usar a IA do Talk X.',
  unauthorized: 'Sua sessão expirou. Entre novamente para usar a IA.',
  invalid_kind: 'Tipo de pedido de IA inválido.',
  invalid_input: 'O texto enviado para a IA é inválido ou longo demais (máximo 8000 caracteres).',
  missing_variable: 'A IA removeu uma variável da mensagem. Nada foi aplicado - tente de novo.',
  empty_output: 'A IA não devolveu texto. Nada foi aplicado e a tentativa ficou registrada.',
  invalid_output: 'A IA devolveu uma resposta fora do formato esperado. Tente de novo.',
  proxy_error: 'O servico de IA recusou a chamada. Nada foi aplicado e a tentativa ficou registrada.',
};

/** Motivo cru da edge -> texto para o operador. Desconhecido cai no motivo cru. */
export function mensagemDaRecusa(code: string): string {
  return MENSAGENS[code] ?? `A IA recusou o pedido (${code}).`;
}

/** `error` de `invokeEdge` (EdgeFunctionError) -> recusa legível. */
export function recusaDoErro(erro: unknown): RecusaTalkxAi {
  const e = erro as Partial<EdgeFunctionError> | null;
  const code = typeof e?.code === 'string' && e.code !== '' ? e.code : 'desconhecido';
  return {
    code,
    message: mensagemDaRecusa(code),
    status: typeof e?.status === 'number' ? e.status : null,
  };
}

export interface PedidoTalkxAi {
  kind: TalkxAiKind;
  input: Record<string, unknown>;
  entity_type?: string;
  entity_id?: string;
}

/**
 * Chama a edge e devolve `{ resposta }` ou `{ recusa }` - nunca lanca, para a
 * UI poder mostrar o motivo sem um `try/catch` em cada botao.
 */
export async function pedirTalkxAi(
  pedido: PedidoTalkxAi,
): Promise<{ resposta: RespostaTalkxAi; recusa: null } | { resposta: null; recusa: RecusaTalkxAi }> {
  // O wrapper central injeta o id de correlacao; a chamada fica em uma linha so
  // porque e ela que o guard do ESTADO.md le para provar que a edge tem chamador.
  const { data, error } = await invokeEdge('talkx-ai', {
    body: {
      kind: pedido.kind,
      input: pedido.input,
      ...(pedido.entity_type ? { entity_type: pedido.entity_type } : {}),
      ...(pedido.entity_id ? { entity_id: pedido.entity_id } : {}),
    },
  });

  if (error) return { resposta: null, recusa: recusaDoErro(error) };
  if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    return { resposta: null, recusa: { code: 'resposta_invalida', message: 'A IA devolveu uma resposta inesperada.', status: null } };
  }
  return { resposta: data as RespostaTalkxAi, recusa: null };
}

export function useTalkxAi() {
  return useMutation({
    mutationFn: async (pedido: PedidoTalkxAi) => {
      const resultado = await pedirTalkxAi(pedido);
      if (resultado.recusa) throw Object.assign(new Error(resultado.recusa.message), resultado.recusa);
      return resultado.resposta;
    },
  });
}