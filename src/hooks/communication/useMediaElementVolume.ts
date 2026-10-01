import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { applyMediaVolume, applyMediaVolumeGain, bindMediaVolume } from '@/lib/mediaVolumeElement';
import { getSnapshot, toGain } from '@/lib/mediaVolumeStore';
import { useMediaVolume, type UseMediaVolumeResult } from './useMediaVolume';

interface UseMediaElementVolumeOptions {
  /**
   * `false` mantém o mute do elemento sob controle do componente (usado no preview
   * de vídeo do balão, que é deliberadamente mudo no hover — E20).
   */
  manageMuted?: boolean;
}

/**
 * E07 — aplica o volume global no elemento de mídia apontado pela ref.
 *
 * Sem array de dependências de propósito: o balão recria o `<video>` quando a URL
 * assinada renova (`key={resolvedUrl}`), e um efeito preso ao elemento antigo deixaria
 * o novo a 100%. Rodar a cada commit também reaplica depois de qualquer mudança do
 * store, sem estado intermediário para dessincronizar.
 *
 * E10 — a ligação (listeners + inscrição no store) é feita UMA vez por elemento e o
 * desligamento (que solta o ganho e, quando é o último, fecha o `AudioContext`) corre
 * só no unmount: soltar a cada commit derrubaria o áudio de quem continua na tela.
 * Por isso os callbacks de evento leem o store NA HORA (`getSnapshot`) em vez de capturar
 * o ganho do render — sem ref-espelho, que `react-hooks/refs` proíbe escrever no render.
 */
export function useMediaElementVolume<T extends HTMLMediaElement>(
  ref: RefObject<T | null>,
  options: UseMediaElementVolumeOptions = {},
): UseMediaVolumeResult {
  const mediaVolume = useMediaVolume();
  const { gain, muted } = mediaVolume;
  const manageMuted = options.manageMuted !== false;

  const elementoRef = useRef<T | null>(null);
  const modoRef = useRef<boolean | null>(null);
  const desligarRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (elementoRef.current !== element || modoRef.current !== manageMuted) {
      // O elemento anterior (URL assinada trocou, key mudou) sai antes de o novo entrar.
      desligarRef.current?.();
      const aplicarDoStore = () => {
        const atual = getSnapshot();
        if (manageMuted) applyMediaVolume(element, toGain(atual.volume), atual.muted);
        else applyMediaVolumeGain(element, toGain(atual.volume));
      };
      elementoRef.current = element;
      modoRef.current = manageMuted;
      desligarRef.current = bindMediaVolume(element, aplicarDoStore);
    }

    // Aplica com o valor deste render — a cada commit, como antes.
    if (manageMuted) applyMediaVolume(element, gain, muted);
    else applyMediaVolumeGain(element, gain);
  });

  useEffect(
    () => () => {
      desligarRef.current?.();
      desligarRef.current = null;
      elementoRef.current = null;
      modoRef.current = null;
    },
    [],
  );

  return mediaVolume;
}
