/**
 * Fixture do achado R2-SLA-001 (#458) — a MESMA lista de `conversation_sla` entregue aos dois
 * consumidores: o painel (`useSLAMetrics`) e o histórico (`useSLAHistory`).
 *
 * Um registro respondido FORA do prazo (tem `first_response_at` e `first_response_breached`) e nove
 * PENDENTES (sem resposta e sem violação). As pendentes são as linhas legadas/importadas — o
 * escritor canônico grava resposta e violação juntas, mas a tabela aceita (e tem) linhas sem
 * desfecho. Com esta lista o painel dizia 0% e o histórico 90%: denominadores incompatíveis.
 */

/**
 * Linha crua de `conversation_sla` como o dublê do PostgREST a entrega (alias, e não interface, para
 * continuar atribuível a `Record<string, unknown>[]` no mock).
 */
export type SlaFixtureRow = {
  id: string;
  contact_id: string;
  created_at: string;
  first_message_at: string | null;
  first_response_at: string | null;
  first_response_breached: boolean;
  contacts: { assigned_to: string | null };
};

/** Números que a fixture R2-SLA-001 representa (o teste assere contra eles, não contra o código). */
export const R2SLA001 = {
  respondidaForaDoPrazo: 1,
  pendentes: 9,
  total: 10,
  /** Taxa esperada: nenhuma das avaliadas (a única) ficou no prazo. */
  taxaEsperada: 0,
} as const;

function linha(
  id: string,
  createdAt: Date,
  desfecho: { primeiroAt: string | null; violada: boolean },
  assignedTo: string | null
): SlaFixtureRow {
  return {
    id,
    contact_id: `c-${id}`,
    created_at: createdAt.toISOString(),
    first_message_at: new Date(createdAt.getTime() - 60_000).toISOString(),
    first_response_at: desfecho.primeiroAt,
    first_response_breached: desfecho.violada,
    contacts: { assigned_to: assignedTo },
  };
}

/** Uma respondida fora do prazo + nove pendentes, no MESMO instante/dia. */
export function slaFixtureDenominadores(createdAt: Date, assignedTo: string | null = 'a1'): SlaFixtureRow[] {
  const respondida = linha('sla-late-1', createdAt, { primeiroAt: createdAt.toISOString(), violada: true }, assignedTo);
  const pendentes = Array.from({ length: R2SLA001.pendentes }, (_, i) =>
    linha(`sla-pending-${i + 1}`, createdAt, { primeiroAt: null, violada: false }, assignedTo)
  );
  return [respondida, ...pendentes];
}

/** Uma respondida DENTRO do prazo + uma pendente: prova que "no prazo" continua contando. */
export function slaFixtureComRespostaNoPrazo(createdAt: Date, assignedTo: string | null = 'a1'): SlaFixtureRow[] {
  return [
    linha('sla-ok-1', createdAt, { primeiroAt: createdAt.toISOString(), violada: false }, assignedTo),
    linha('sla-pending-1', createdAt, { primeiroAt: null, violada: false }, assignedTo),
  ];
}

/** Só pendentes: existe conversa no período, mas nenhuma com desfecho de 1ª resposta. */
export function slaFixtureSoPendentes(createdAt: Date, quantidade = R2SLA001.pendentes): SlaFixtureRow[] {
  return Array.from({ length: quantidade }, (_, i) =>
    linha(`sla-pending-${i + 1}`, createdAt, { primeiroAt: null, violada: false }, 'a1')
  );
}
