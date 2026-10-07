import { useSyncExternalStore } from 'react';
import {
  getSnapshot,
  setMuted as storeSetMuted,
  setVolume as storeSetVolume,
  subscribe,
  toGain,
  toggleMuted as storeToggleMuted,
} from '@/lib/mediaVolumeStore';
import { detectNativeVolumeSupport, isMediaVolumeControllable } from '@/lib/mediaVolumeElement';

export interface UseMediaVolumeResult {
  /** 0–100 (o valor que o usuário escolheu, não o ganho aplicado). */
  volume: number;
  muted: boolean;
  /** Curva perceptual já aplicada ao elemento: `(volume/100)²`. */
  gain: number;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  /** `false` quando o agente ignora `element.volume` e não há AudioContext (D5). */
  isSupported: boolean;
}

/**
 * E06 — fonte única do volume de mídia para todos os players (D2).
 * O valor é global (E12): trocar de mensagem não zera nem recria o volume.
 *
 * Por usuário NO APARELHO (S33/D07): o persistido é
 * `zapp.media.volume.<userId>` / `zapp.media.muted.<userId>`. A identidade é
 * resolvida DENTRO do store, pela sessão que o `supabase-js` já mantém no
 * `localStorage` — este hook não usa `useAuth` de propósito: players montam fora
 * do `AuthProvider` (onde `useAuth` lança) e aqui ele é só o adaptador para
 * `useSyncExternalStore`. Assinatura e formato do retorno não mudam.
 */
export function useMediaVolume(): UseMediaVolumeResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const isSupported = isMediaVolumeControllable();

  return {
    volume: snapshot.volume,
    muted: snapshot.muted,
    gain: toGain(snapshot.volume),
    setVolume: storeSetVolume,
    setMuted: storeSetMuted,
    toggleMuted: storeToggleMuted,
    isSupported,
  };
}
