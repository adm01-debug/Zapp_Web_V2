/**
 * R2-CALL-007 — decisão PURA de quem executa a ação do alerta de chamada
 * (`Atender`/`Ignorar`) e com qual identidade.
 *
 * Defeito medido: o alerta escolhia rótulo/capacidade pelo canal, mas os
 * handlers chamavam `accept()`/`reject()` do provider de sessão **sem canal e
 * sem identidade** — e o provider sempre fala com o SIP. Com uma notificação de
 * WhatsApp B na tela e uma sessão SIP A tocando/ativa, o clique em B mexia em A,
 * e o fluxo local documentado do WhatsApp (gravar o desfecho + abrir a conversa)
 * nunca rodava.
 *
 * Aqui fica só a decisão (sem React, sem I/O): o canal da notificação decide o
 * executor, e o contrato local do WhatsApp exige identidade própria.
 */

import type { CallChannel } from './callStatus';

/**
 * Canal da notificação que chegou. Quem traz `whatsapp_connection_id` é
 * WhatsApp; sem ele, a linha é a do VoIP (mesma leitura do alerta).
 */
export function canalDaNotificacao(whatsappConnectionId: string | null | undefined): CallChannel {
  return whatsappConnectionId ? 'whatsapp' : 'voip';
}

/**
 * Quem executa a ação: `whatsapp` = contrato local do canal (adapter, sem
 * áudio/SIP); `sip` = máquina da sessão (VoIP). O nome do canal é o dono — não
 * existe caminho em que uma ação de WhatsApp caia no SIP.
 */
export type ExecutorDaAcao = 'whatsapp' | 'sip';

export function executorDaAcao(canal: CallChannel): ExecutorDaAcao {
  return canal === 'whatsapp' ? 'whatsapp' : 'sip';
}

/**
 * Identidade mínima que o contrato local do WhatsApp exige: o id da NOTIFICAÇÃO
 * (a linha de `calls` daquele canal) e o contato dono da conversa. Sem os dois
 * não há operação alvo — e agir sobre a sessão corrente seria atuar em OUTRA
 * chamada.
 */
export function alvoDoWhatsApp(notificacao: {
  callId: string | null;
  contact_id: string | null;
}): { callId: string; contactId: string } | null {
  if (!notificacao.callId || !notificacao.contact_id) return null;
  return { callId: notificacao.callId, contactId: notificacao.contact_id };
}
