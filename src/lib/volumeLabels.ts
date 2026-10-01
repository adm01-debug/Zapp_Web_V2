/**
 * Rótulos (pt-BR) dos controles de volume, num módulo sem React/sem efeitos.
 *
 * **Fonte única**: os componentes (`MediaVolumeControl`, `SoundVolumeControl`) e o E2E
 * (`e2e/media-volume.spec.ts`) importam daqui. Assim, renomear um rótulo quebra o
 * **typecheck** — que roda no gate de PR — em vez de quebrar em silêncio o E2E
 * autenticado, que só roda depois do merge na main (repo público não pode referenciar
 * os secrets E2E em workflow de PR).
 */

/** Gatilho dos ALERTAS, sem mudo. O sufixo `: N%` é acrescentado pelo componente. */
export const SOUND_VOLUME_LABEL = 'Volume dos alertas';
/** Gatilho dos ALERTAS quando mudo. */
export const SOUND_VOLUME_LABEL_MUTED = 'Sons de alerta mudos';
/** Título do popover e rótulo acessível do thumb do slider dos ALERTAS. */
export const SOUND_VOLUME_SLIDER_LABEL = 'Volume dos alertas';

/** Gatilho das MÍDIAS, sem mudo. */
export const MEDIA_VOLUME_LABEL = 'Volume dos áudios e vídeos';
/** Gatilho das MÍDIAS quando mudo. */
export const MEDIA_VOLUME_LABEL_MUTED = 'Áudios e vídeos mudos';
/** Título do popover e rótulo acessível do thumb do slider das MÍDIAS. */
export const MEDIA_VOLUME_SLIDER_LABEL = 'Volume das mídias';
