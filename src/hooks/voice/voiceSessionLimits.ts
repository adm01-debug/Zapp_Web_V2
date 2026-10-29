/**
 * Limites da sessão de microfone do agente de voz (Scribe).
 *
 * O `useScribe` mantém o microfone aberto enquanto o operador quiser — mas ninguém
 * lembra de fechar a escuta: o operador sai da frente da tela e o microfone segue
 * captando o ambiente. Estes são os três limites que encerram a sessão sozinhos.
 *
 * Os valores são a decisão do produto (não do navegador): 60 s sem fala, 5 min de
 * teto duro e aba oculta encerram na hora.
 */
export const VOICE_SESSION_LIMITS = {
  /** Sem nenhuma fala por este tempo, a escuta termina. */
  inactivityMs: 60_000,
  /** Teto duro: passou disso, a sessão termina mesmo com fala o tempo todo. */
  maxDurationMs: 300_000,
} as const;

export type VoiceSessionEndReason = 'inactivity' | 'duration' | 'hidden';

const MENSAGENS: Record<VoiceSessionEndReason, string> = {
  inactivity: 'A escuta foi encerrada após 60 segundos sem fala.',
  duration: 'A escuta foi encerrada após 5 minutos de sessão.',
  hidden: 'A escuta foi encerrada porque a aba saiu de foco.',
};

/**
 * Aviso em pt-BR do motivo do encerramento. O texto mora aqui (e não na tela) para
 * que a mensagem seja a mesma em qualquer caminho que encerre a sessão.
 */
export function voiceSessionEndMessage(reason: VoiceSessionEndReason): string {
  return MENSAGENS[reason];
}
