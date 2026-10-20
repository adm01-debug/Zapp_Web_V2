/**
 * Adapter de chamadas do canal **WhatsApp** — etapa T24 de
 * `docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md` (linha 82).
 *
 * Texto do plano: `dial` → `NotSupported`; `accept` → `answered_by` + abre a
 * conversa do contato no inbox ("Atenda no aparelho da linha; a conversa foi
 * aberta aqui"); `reject` → `declined` local, rótulo "Ignorar" (D7=b).
 *
 * ## Contrato (decisão registrada, porque o plano é omisso)
 *
 * NÃO existe no repo um contrato de adapter agnóstico de canal com
 * `dial/accept/reject`: o único adapter é `CallAdapter`
 * (`src/lib/calls/adapters/CallAdapter.ts:26-85`), com **12 métodos moldados em
 * tipos do `sip.js`** (`hostOf/isDialable/createInviter/invite/...`) e **sem
 * `dial`** — discar, no motor atual, é `CallEngine.makeCall`
 * (`src/lib/calls/adapters/CallEngine.ts:196`), que exige um `UserAgent`.
 * Implementar aquele contrato para o WhatsApp seria mentir: não há UA/Session/
 * Invitation/DTMF do lado WhatsApp (D2=a: só eventos, sem áudio aqui).
 *
 * O motor recebe **um** adapter fixo (`useSipClient.ts:58`), sem seleção por
 * canal — lacuna de arquitetura já medida em `~/auditorias/telefonia-fase2/
 * ESPECIFICACAO-FASE2.md:163`. Estender `CallAdapter` tocaria `CallEngine` e
 * `SipCallAdapter` (fora do escopo desta etapa). Por isso este arquivo modela a
 * **superfície mínima própria do canal**, reusando os tipos de domínio que já
 * existem (`UpsertMyCallInput`/`UpsertMyCallResult` de `persistence.ts`,
 * `CallChannel`/`desfechoDaChamada`, `CapabilityReason`/`REASON_LABEL` de
 * `capabilities.ts`) e deixando tudo atrás de **portas injetadas**, para ser
 * plugada numa etapa de seleção por canal sem reescrita.
 *
 * Módulo **headless**: nenhum import de React, Supabase ou UI — mesmo padrão do
 * `SipCallAdapter`, que também não importa React.
 */

import { REASON_LABEL, type CapabilityReason } from './capabilities';
import type { CallChannel } from './callStatus';
import {
  desfechoDaChamada,
  type UpsertMyCallInput,
  type UpsertMyCallResult,
} from './persistence';

/** Canal deste adapter — a mesma união de `calls.channel` (`callStatus.ts:9`). */
export const CANAL_WHATSAPP: CallChannel = 'whatsapp';

/**
 * Motivo canônico do "não disca daqui" (`capabilities.ts:19`). O WhatsApp entra
 * sempre como somente-recebidas (T23): este adapter não tem caminho de saída.
 */
export const MOTIVO_SEM_SAIDA: CapabilityReason = 'whatsapp_no_outbound';

/** Mensagem literal do plano (`:82`) — a UI mostra ao agente no `accept`. */
export const MENSAGEM_ATENDA_WHATSAPP =
  'Atenda no aparelho da linha; a conversa foi aberta aqui';

/** Rótulo do botão de recusa do WhatsApp — D7=b: "Ignorar" = `declined` local. */
export const ROTULO_IGNORAR_WHATSAPP = 'Ignorar';

/**
 * Erro do `dial` do WhatsApp. Separado (e não um `throw` genérico) para quem
 * consome poder distinguir "canal não disca" de falha técnica, e para carregar
 * o `reason` operacional canônico que a UI já sabe rotular.
 */
export class NotSupportedError extends Error {
  /** Motivo operacional (`capabilities.ts`) — aqui, `whatsapp_no_outbound`. */
  readonly reason: CapabilityReason;

  constructor(reason: CapabilityReason = MOTIVO_SEM_SAIDA) {
    super(REASON_LABEL[reason]);
    this.name = 'NotSupportedError';
    this.reason = reason;
  }
}

/**
 * Porta de abertura da conversa no inbox. **Injetada**, não importada: o
 * adapter é headless e testável sem DOM. A implementação real é
 * `openContactChat` (`src/components/catalog/useSendProduct.ts:58-80`), que
 * navega para `view=inbox` e dispara o evento `open-contact-chat` — escutado em
 * `src/hooks/inbox/useRealtimeInbox.ts:73-82`, que seleciona a conversa pelo
 * `contactId`.
 */
export type AbrirConversaPort = (contactId: string) => void;

/**
 * Porta de persistência. Mesmo contrato de `persistence.ts`: a implementação
 * real é `upsertMyCall` (ou `FilaDePersistencia.executar`), que fala com a RPC
 * `upsert_my_call` e **nunca lança** (devolve `{ ok, error }`).
 */
export type PersistirPort = (input: UpsertMyCallInput) => Promise<UpsertMyCallResult>;

/** Dependências do adapter — tudo o que é I/O entra por aqui. */
export interface WhatsAppCallPorts {
  abrirConversa: AbrirConversaPort;
  persistir: PersistirPort;
}

/**
 * Dados de uma chamada de WhatsApp recebida. `callId` é o mesmo id usado em
 * `calls.id` (o `sessionId` da máquina); `contactId` é o dono da conversa que
 * será aberta no inbox.
 */
export interface WhatsAppIncomingCall {
  callId: string;
  contactId: string;
  phone?: string | null;
  name?: string | null;
}

/** Saída do `accept`: a mensagem ao agente + o resultado da gravação. */
export interface WhatsAppAcceptResult {
  /** Literal do plano: `MENSAGEM_ATENDA_WHATSAPP`. */
  mensagem: string;
  persistencia: UpsertMyCallResult;
}

/** Saída do `reject`: o rótulo D7=b + o resultado da gravação local. */
export interface WhatsAppRejectResult {
  /** Rótulo do botão: `ROTULO_IGNORAR_WHATSAPP` ("Ignorar"). */
  rotulo: string;
  persistencia: UpsertMyCallResult;
}

export class WhatsAppCallAdapter {
  /**
   * Canal deste adapter — a identidade do canal que ele atende, no mesmo valor
   * de `calls.channel` (`callStatus.ts:9`), e a fonte única do canal que as
   * gravações abaixo levam à RPC (`this.channel`, não uma constante paralela).
   *
   * Seleção por canal no estado atual (medido em 08/10):
   *  - o caminho que chega aqui é o de ENTRADA: o canal da notificação decide o
   *    executor (`acaoDoAlerta.canalDaNotificacao` → `executorDaAcao` →
   *    `useAcoesDoAlerta` → `accept`/`reject` deste adapter);
   *  - não existe seleção de SAÍDA que alcance este adapter: o WhatsApp é
   *    somente-recebidas por decisão (T23 → `whatsapp_no_outbound`) e a "saída
   *    por WhatsApp" está na lista do que o plano NÃO promete
   *    (`PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md`, T98). O único
   *    canal que disca é o VoIP; `dial` daqui lança `NotSupportedError`.
   */
  readonly channel: CallChannel = CANAL_WHATSAPP;

  constructor(private readonly ports: WhatsAppCallPorts) {}

  /**
   * O WhatsApp **não disca daqui**: o único caminho de saída do produto é VoIP
   * (T23 marca o canal como `canDial: false`). Lança `NotSupportedError` de
   * forma síncrona — não faz sentido devolver uma promise que só rejeita.
   */
  dial(_phone: string): never {
    throw new NotSupportedError();
  }

  /**
   * Atende localmente uma chamada recebida do WhatsApp.
   *
   * `answered_by` é **derivado de `answered_at`** pela RPC `upsert_my_call`
   * (`supabase/migrations/20260926800000_calls_telefonia_v2.sql:344-347`: com
   * `answered_at` não nulo, grava o perfil de quem atendeu). Por isso a RPC não
   * tem `p_answered_by` e este adapter **não passa** esse campo: marca o
   * atendimento com `status: 'answered'` + `answeredAt`, e o banco deriva.
   *
   * `channel: 'whatsapp'` é explícito e obrigatório: a RPC faz
   * `coalesce(p_channel,'voip')` (`:331`) — omitir gravaria VoIP em silêncio.
   *
   * A conversa do contato é aberta pela porta injetada. Não há áudio aqui
   * (D2=a): atender significa registrar + levar o agente para o chat.

   * ## Pré-condição medida (registrada, não escondida)
   *
   * `answered_by` só é preenchido no ramo `ON CONFLICT DO UPDATE` da RPC
   * (`20260926800000:344-346`); o `INSERT` (`:327-334`) **não lista a coluna**.
   * Logo: este `accept` deriva `answered_by` **porque a linha já existe** — quem
   * a cria é o webhook (T25, `record_incoming_call_event`) com o mesmo `id`.
   * Se o `accept` fosse o primeiro write da linha, `answered_by` ficaria nulo.
   *
   * Sobre o `channel`: medi depois que a versão vigente de
   * `record_incoming_call_event` **grava `channel='whatsapp'` nas duas
   * inserções** e o preserva no `ON CONFLICT` por
   * `COALESCE(public.calls.channel, EXCLUDED.channel)`. A imutabilidade vale
   * para quem **não** passa o canal (o `SET` do `upsert_my_call` não inclui
   * `channel`). Como o webhook cria a linha antes, ela nasce com o canal certo;
   * o `channel: 'whatsapp'` abaixo é a garantia caso o adapter seja o primeiro
   * write.
   */
  async accept(call: WhatsAppIncomingCall): Promise<WhatsAppAcceptResult> {
    const persistencia = await this.ports.persistir({
      id: call.callId,
      direction: 'inbound',
      status: 'answered',
      // O canal sai do campo do adapter: uma única fonte para o que ele atende
      // e para o que ele grava (SL-247).
      channel: this.channel,
      peerNumber: call.phone ?? null,
      peerName: call.name ?? null,
      contactId: call.contactId,
      answeredAt: new Date().toISOString(),
    });
    this.ports.abrirConversa(call.contactId);
    return { mensagem: MENSAGEM_ATENDA_WHATSAPP, persistencia };
  }

  /**
   * Recusa **local** uma chamada do WhatsApp (D7=b): grava `declined` sem
   * nenhuma chamada de rede ao Evolution GO (não há endpoint de recusa
   * comprovado). O rótulo que a UI mostra é "Ignorar".
   *
   * O par `(status, end_reason)` é derivado de `desfechoDaChamada` — o mesmo
   * dono da regra de persistência (`persistence.ts:166`): `{ endedBy: 'reject' }`
   * → `{ status: 'declined', endReason: 'declined' }`, ambos dentro dos CHECKs
   * de `calls.status`/`calls.end_reason`.
   */
  async reject(call: WhatsAppIncomingCall): Promise<WhatsAppRejectResult> {
    const { status, endReason } = desfechoDaChamada(null, 'inbound', {
      endedBy: 'reject',
      sipCode: null,
    });
    const persistencia = await this.ports.persistir({
      id: call.callId,
      direction: 'inbound',
      status,
      channel: this.channel,
      peerNumber: call.phone ?? null,
      peerName: call.name ?? null,
      contactId: call.contactId,
      endedAt: new Date().toISOString(),
      endReason,
    });
    return { rotulo: ROTULO_IGNORAR_WHATSAPP, persistencia };
  }
}
