/**
 * Barramento do áudio em reprodução — o `audioPlaybackBus` do app antigo (V3)
 * encostado no que a V2 já faz melhor.
 *
 * A V3 guarda um mute POR player (o handle do `<audio>` ativo troca o volume do
 * `AudioContext` dele). Na V2 o volume das mídias de conversa é UM valor global
 * (`src/lib/mediaVolumeStore.ts`, D2/E11/D4): o botão do balão, o do fullscreen e
 * o da sidebar leem o MESMO valor, com uma tecla `M` local valendo quando o foco
 * está dentro do player (`useVolumeRocker`, E16). Trazer um segundo dono do estado
 * faria o botão mostrar um valor e o som tocar outro — é exatamente o que a V2
 * evitou. Então este módulo responde só à pergunta que falta ao atalho global
 * ("tem áudio tocando agora?") e delega o mute ao store único.
 *
 * "Tem áudio tocando" vem do barramento de reprodução exclusiva (A01/PH-22,
 * `src/hooks/chat/useExclusiveAudio.ts`): o mesmo id que o balão do chat e os
 * cartões da aba Arquivos registram — não há um segundo registro para
 * dessincronizar.
 */
import { getPlayingAudioId } from '@/hooks/chat/useExclusiveAudio';
import { getSnapshot, toggleMuted } from '@/lib/mediaVolumeStore';

export interface MuteToggleResult {
  /** Estado do mudo DEPOIS do toque. */
  muted: boolean;
  /** Volume do controle global (0–100), preservado pelo mute (D4). */
  volume: number;
}

/** Id do áudio tocando agora (`null` = nenhum) — o mesmo store da A01/PH-22. */
export function getActiveAudioId(): string | null {
  return getPlayingAudioId();
}

/**
 * Silencia/restaura o áudio ativo. Devolve `null` quando NADA está tocando — o
 * atalho global é então ignorado (mesmo contrato do `toggleMuteActive` da V3), em
 * vez de mutar um áudio que ainda nem começou.
 */
export function toggleMuteActive(): MuteToggleResult | null {
  if (getPlayingAudioId() === null) return null;
  toggleMuted();
  const { muted, volume } = getSnapshot();
  return { muted, volume };
}
