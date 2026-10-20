/**
 * Contrato do **motor** de ligações por WhatsApp — etapa E005 de
 * `docs/plans/PLANO_LIGACOES_WHATSAPP_MEOWCALLER_100_ETAPAS_2026-10-07.md`
 * (Fase 0) e §2 "Arquitetura-alvo".
 *
 * Por que existe: o plano exige que o motor seja **trocável** sem refazer o
 * resto. Hoje o candidato é o fork da Evolution GO + `meowcaller`; amanhã pode
 * ser a API oficial da Meta. Quem fala com a tela é o estado do app
 * (`CallSessionProvider` + `WhatsAppCallAdapter`), não o serviço: é este
 * contrato que fica no meio. Trocar a implementação (gateway, endpoint, protocolo)
 * não muda quem chama.
 *
 * **Este módulo é só a forma — nenhum WebSocket, HTTP, áudio ou React aqui.**
 * Nenhuma implementação real mora neste arquivo; a E005 existe justamente para
 * fixar a fronteira e o teste de contrato antes de qualquer motor de verdade.
 *
 * Diferente de `adapters/CallAdapter.ts` (12 métodos moldados em tipos do
 * `sip.js`, sem `dial`), aqui a superfície é a do canal: os quatro verbos da
 * ponte REST (`POST /call/dial|answer|hangup|reject`,
 * `docs/plans/PLANO_LIGACOES_WHATSAPP_MEOWCALLER_100_ETAPAS_2026-10-07.md:46`)
 * mais os eventos.
 * Hoje `WhatsAppCallAdapter.dial` lança `NotSupportedError` e o provider sempre
 * disca por VoIP; nada disso muda neste cartão — a interface nasce sem estar
 * ligada a ninguém.
 */

import type { CallSessionEvent } from './session';

/**
 * Referência de uma ligação **dentro do motor** (o id que os demais métodos
 * usam para mirar a chamada). É o `provider_call_id` do plano (E075): o mesmo
 * valor que o webhook usa para gravar a linha de `calls` de forma idempotente.
 */
export type WhatsAppCallRef = string;

/**
 * Evento emitido pelo motor. O `ref` diz a que ligação o evento pertence (a
 * maioria dos eventos de áudio não tem `sessionId` no corpo); `event` usa o
 * **vocabulário canônico já existente** (`CallSessionEvent`, o Apêndice C da
 * máquina de sessão) — o motor não inventa uma segunda lista de eventos, só
 * correlaciona.
 */
export interface WhatsAppCallEngineEvent {
  ref: WhatsAppCallRef;
  event: CallSessionEvent;
}

/** Assinante dos eventos do motor. */
export type WhatsAppCallEngineListener = (payload: WhatsAppCallEngineEvent) => void;

/**
 * Contrato do motor. Quem implementa fala com o serviço (gateway/HTTP/WS);
 * quem consome trata evento. Nenhum método devolve estado local: o estado é da
 * máquina de sessão, alimentada pelos eventos.
 */
export interface WhatsAppCallEngine {
  /**
   * Disca para um número. Resolve com a referência da ligação criada.
   * **Rejeita em falha real** (sem linha, serviço fora) — quem chama decide o
   * que mostrar; não devolve `null` silencioso.
   */
  dial(phone: string): Promise<WhatsAppCallRef>;

  /**
   * Atende uma oferta recebida. **Nunca lança** para `ref` desconhecida
   * (no-op): mesmo princípio de `CallAdapter.reject` — atender/recusar que falha
   * não pode derrubar a tela da chamada.
   */
  answer(ref: WhatsAppCallRef): Promise<void>;

  /**
   * Encerra uma ligação em andamento. **Nunca lança** para `ref` desconhecida
   * (no-op).
   */
  hangup(ref: WhatsAppCallRef): Promise<void>;

  /**
   * Recusa uma oferta recebida. **Nunca lança** para `ref` desconhecida
   * (no-op).
   */
  reject(ref: WhatsAppCallRef): Promise<void>;

  /**
   * Assina os eventos do motor. Devolve a função que cancela a assinatura —
   * idempotente: cancelar duas vezes não pode quebrar quem desmonta a tela.
   */
  on(listener: WhatsAppCallEngineListener): () => void;
}
