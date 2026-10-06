/**
 * Fila de agendamento de mensagem (`scheduled_messages`) — item #196 (achado R2-API-017).
 *
 * PRODUTOR E ESTADOS EXISTEM. `src/hooks/chat/useScheduledMessages.ts` insere a
 * pendencia, lista e cancela; a migration 20251220182411 cria a tabela com os estados
 * `pending`/`sent`/`failed`/`cancelled`, o indice parcial de `scheduled_at` para
 * `pending` e o gatilho de `updated_at`.
 *
 * EXECUTOR NAO EXISTE no codigo versionado. Nenhuma Edge Function consulta
 * `scheduled_messages` para ENTREGAR; nenhuma migracao cria cron ou funcao de envio
 * desta fila. Sem consumidor, os estados `sent` e `failed` nunca sao alcancados por
 * codigo versionado: agendar grava a INTENCAO, e a entrega fica sem executor.
 *
 * Este modulo e a fonte unica e versionada desse contrato (registro
 * `AGENDAMENTO_VERSION`). Ele NAO envia nada, NAO fala com o banco e nao tem efeito
 * nenhum: e um modulo puro, consumido pelo teste de contrato desta pasta e disponivel
 * para a tela/hook dizerem a verdade ao operador ("agendado" continua sendo so
 * intencao registrada enquanto nao houver executor). Quando um executor entrar, muda-se
 * `EXECUTOR_DE_AGENDAMENTO` e `AGENDAMENTO_VERSION` — e o teste de contrato
 * (`__tests__/agendamento.test.ts`) compara este registro com a arvore versionada, para
 * a fila nao voltar a ser meio-ligada em silencio.
 */

/** Versao do registro de execucao. Muda sempre que um executor entra ou sai. */
export const AGENDAMENTO_VERSION = "2026-10-06.1";

/** Tabela da fila. */
export const TABELA_DA_FILA = "scheduled_messages";

/**
 * Estados que a tabela declara (comentario da coluna `status` na migration
 * 20251220182411). Sao os unicos desfechos que existem hoje.
 */
export const ESTADOS_DA_FILA = ["pending", "sent", "failed", "cancelled"] as const;

export type EstadoDaFila = (typeof ESTADOS_DA_FILA)[number];

/** Referencia a um executor versionado dentro do repositorio. */
export interface ExecutorVersionado {
  /** Identificador estavel (Edge Function / modulo). */
  id: string;
  /** Papel do executor, em uma linha. */
  papel: string;
}

/**
 * Executor versionado que CONSOME a fila para entregar.
 *
 * `null` = so produtor: nenhum consumidor versionado entrega `scheduled_messages`.
 * E o estado real de hoje, provado pelo teste de contrato contra `supabase/functions`.
 */
export const EXECUTOR_DE_AGENDAMENTO: ExecutorVersionado | null = null;

/**
 * Contrato que QUALQUER executor desta fila tem de cumprir antes de substituir o `null`
 * acima. Sao os quatro requisitos do aceite do achado R2-API-017; ficam declarados como
 * dado para o proximo cartao (o executor em si) nao os redescobrir.
 */
export interface ContratoDoExecutor {
  /** Posse do item sem corrida entre workers. */
  claim: string;
  /** Quem pode mandar para aquele contato por aquela conexao. */
  autorizacao: string;
  /** Desfechos de onde um item travado volta a andar. */
  estadosRecuperaveis: readonly string[];
  /** O que fazer quando o provedor nao confirma o envio. */
  reconciliacao: string;
}

export const CONTRATO_DO_EXECUTOR: ContratoDoExecutor = {
  claim:
    "Reivindicar o item com transicao atomica (o item so sai de 'pending' se o UPDATE " +
    "ainda encontrar o status 'pending') e solta-lo por lease para um worker morto nao " +
    "travar a fila.",
  autorizacao:
    "Entregar apenas com a conexao do item (ou a do contato) conectada e com instancia " +
    "resolvida, usando a identidade de quem agendou; sem isso o item nao vira envio.",
  estadosRecuperaveis: [
    "pendente vencido -> envio",
    "reivindicado com lease expirado -> volta a pendente",
  ],
  reconciliacao:
    "Resultado incerto do provedor nunca vira reenvio automatico: o item fica terminal " +
    "com o motivo registrado e a confirmacao e somente-leitura por id do provedor.",
};

/**
 * Peca que ainda falta para um executor existir de ponta a ponta. Declarado para o
 * proximo cartao: nao e trabalho desta fila nem deste modulo.
 */
export const PREREQUISITOS_ABERTOS: readonly string[] = [
  "estado de posse com lease na tabela (hoje so existem pending/sent/failed/cancelled)",
  "caminho de entrada com credencial de maquina (sem usuario autenticado na fila)",
  "job periodico que acorde a fila (nenhuma migracao agenda este envio)",
  "id do provedor guardado no item para a reconciliacao somente-leitura",
];

/** Ha executor versionado que consome a fila? */
export function agendamentoTemExecutorVersionado(): boolean {
  return EXECUTOR_DE_AGENDAMENTO !== null;
}

/** O executor versionado da fila, ou `null` quando so existe o produtor. */
export function executorDeAgendamento(): ExecutorVersionado | null {
  return EXECUTOR_DE_AGENDAMENTO;
}

/** O valor pertence aos estados declarados da tabela? */
export function estadoDaFilaConhecido(valor: string): valor is EstadoDaFila {
  return (ESTADOS_DA_FILA as readonly string[]).some((estado) => estado === valor);
}

/** Quantos dos estados declarados hoje sao alcancados por codigo versionado. */
export function estadosAlcancadosPorExecutor(): readonly EstadoDaFila[] {
  return agendamentoTemExecutorVersionado() ? ["pending", "sent", "failed", "cancelled"] : [];
}

/**
 * Texto operacional do que acontece ao agendar uma mensagem hoje. Nao promete entrega:
 * nenhum executor versionado consome esta fila.
 */
export function descreverAgendamento(): string {
  return (
    `Agendado e intencao registrada: nenhum executor versionado consome a fila ` +
    `${TABELA_DA_FILA} para entregar (registro v${AGENDAMENTO_VERSION}). ` +
    `Os estados ${ESTADOS_DA_FILA.join("/")} existem na tabela, mas sem consumidor o ` +
    `item fica em 'pending' — cancelar funciona, entregar ainda nao.`
  );
}

/** Texto operacional de um estado da fila, com o desfecho real de hoje. */
export function descreverEstadoDaFila(valor: string): string {
  if (!estadoDaFilaConhecido(valor)) {
    return `Estado desconhecido ('${valor}') na fila ${TABELA_DA_FILA} (registro v${AGENDAMENTO_VERSION}).`;
  }
  if (!agendamentoTemExecutorVersionado()) {
    return (
      `Estado '${valor}': so o produtor o escreve. Sem executor versionado, 'sent' e ` +
      `'failed' nao sao escritos por codigo nenhum (registro v${AGENDAMENTO_VERSION}).`
    );
  }
  return `Estado '${valor}' da fila ${TABELA_DA_FILA} (registro v${AGENDAMENTO_VERSION}).`;
}
