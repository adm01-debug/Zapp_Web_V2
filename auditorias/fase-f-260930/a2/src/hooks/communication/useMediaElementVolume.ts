import { useLayoutEffect, type RefObject } from 'react';
import { applyMediaVolume, applyMediaVolumeGain } from '@/lib/mediaVolumeElement';
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
 */
export function useMediaElementVolume<T extends HTMLMediaElement>(
  ref: RefObject<T | null>,
  options: UseMediaElementVolumeOptions = {},
): UseMediaVolumeResult {
  const mediaVolume = useMediaVolume();
  const { gain, muted } = mediaVolume;
  const manageMuted = options.manageMuted !== false;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const apply = () => {
      if (manageMuted) applyMediaVolume(element, gain, muted);
      else applyMediaVolumeGain(element, gain);
    };

    apply();
    element.addEventListener('loadedmetadata', apply);
    return () => {
      element.removeEventListener('loadedmetadata', apply);
    };
  });

  return mediaVolume;
}
