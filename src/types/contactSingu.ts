/**
 * CT-002 — contrato único dos campos do Singu no módulo Contatos.
 *
 * Regra do módulo: **campo ausente = `null` (ou omitido), nunca erro**. Todo
 * campo é opcional e nulável porque o Singu ainda vai entregar parte deles
 * (CT-111) e porque a tela precisa mostrar o vazio no mesmo lugar em que hoje
 * não existe dado. Nada aqui é inventado: só o que o Singu devolveu vira valor.
 */

/** Último pedido do cliente no Singu. */
export interface ContactSinguLastOrder {
  /** Data do pedido em ISO (`YYYY-MM-DD`) ou `null`. */
  data: string | null;
  /** Valor do pedido em reais ou `null`. */
  valor: number | null;
}

/** Resumo do contato no Singu, no formato único que o módulo Contatos consome. */
export interface ContactSinguSummary {
  /** Apelido do contato. */
  apelido?: string | null;
  /** Cargo do contato na empresa. */
  cargo?: string | null;
  /** Departamento do contato na empresa. */
  departamento?: string | null;
  /** Nome da empresa do contato. */
  empresa?: string | null;
  /** URL do logo da empresa. */
  logo?: string | null;
  /** Ramo de atuação da empresa. */
  ramo?: string | null;
  /** UF da empresa (sigla de 2 letras). */
  uf?: string | null;
  /** Nome do vendedor responsável pelo cliente. */
  vendedor?: string | null;
  /** Cliente ativado (`true`) ou inativo (`false`) — `null` quando o Singu não diz. */
  ativo?: boolean | null;
  /** Dias desde a última compra. */
  diasSemComprar?: number | null;
  /** Último pedido (data e valor). */
  ultimoPedido?: ContactSinguLastOrder | null;
  /** Segmento RFM (ex.: `champion`). */
  rfmSegmento?: string | null;
  /** Pontuação RFM. */
  rfmScore?: number | null;
  /** Total de pedidos do cliente. */
  totalPedidos?: number | null;
  /** Valor total já comprado, em reais. */
  valorTotal?: number | null;
}

/** Contato do Zapp que precisa do resumo do Singu. */
export interface SinguContactRef {
  /** Id do contato no Zapp — é a chave do resumo devolvido. */
  id: string;
  /** Telefone atual do contato: o Singu resolve a empresa por ele. */
  phone: string;
}

/** Resumo por contato do Zapp (chave = `SinguContactRef.id`). */
export type ContactSinguSummaryMap = Map<string, ContactSinguSummary>;

/**
 * Adaptador do Singu. Duas implementações: o `realAdapter` (Singu/CRM real, em
 * `services/crm/singu-adapter.ts`) e o adaptador de teste (só dev/teste, em
 * `services/crm/singu-adapter.mock.ts`).
 */
export interface SinguAdapter {
  /** `real` fala com o Singu; `mock` devolve dados de teste. */
  readonly kind: 'real' | 'mock';
  /**
   * Resumo por contato do Zapp. Contato que o Singu não devolveu fica FORA do
   * mapa (nada é inventado) e todo campo ausente no resumo fica `null`.
   */
  fetchSummaries(contacts: SinguContactRef[]): Promise<ContactSinguSummaryMap>;
}
