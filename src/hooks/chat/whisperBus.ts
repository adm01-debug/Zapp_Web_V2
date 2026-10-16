/**
 * Barramento local (mesma aba, sem rede) dos sussurros gravados.
 *
 * Vive em módulo próprio, sem dependência de auth nem de react-query, de
 * propósito: `useWhisperMessagesMutation` — que `useChatPanelHandlers` importa —
 * só precisa PUBLICAR o aviso. Enquanto `notificarSussurroEnviado` morava em
 * `useWhisperCount`, importá-lo arrastava o contexto de auth e o cache offline
 * (`useAuth` → `useOfflineCache` → `getLogger`) para dentro de todo consumidor da
 * mutação, derrubando os testes que montam o handler sem provedor de auth.
 */
type Ouvinte = (contactId: string) => void;

const ouvintes = new Set<Ouvinte>();

/**
 * Avisa quem está com a MESMA conversa aberta que um sussurro foi gravado. Serve
 * à reconsulta na mesma aba; quem está em outra sessão é avisado pelo realtime.
 */
export function notificarSussurroEnviado(contactId: string): void {
  ouvintes.forEach((ouvinte) => ouvinte(contactId));
}

/** Registra um ouvinte do aviso local. Devolve a função de cancelamento. */
export function assinarSussurroEnviado(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export type { Ouvinte };
