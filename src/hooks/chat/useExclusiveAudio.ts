import { useSyncExternalStore } from 'react';

/**
 * A01 — reprodução EXCLUSIVA de áudio da aba Arquivos (um áudio por vez).
 *
 * O estado mora no módulo, fora do React: cada cartão precisa saber se ELE é o áudio que
 * está tocando, e tocar outro item tem de pausar o anterior mesmo quando os dois estão em
 * ramos diferentes da árvore (Grid, Lista e Tabela são vistas alternativas do mesmo painel).
 * `getPlayingAudioId` devolve um primitivo estável (`string | null`) — requisito do
 * `useSyncExternalStore`, como no store de notificações do chat interno.
 */

/** Como o store pausa o som de um cartão; quem monta é o próprio cartão. */
export interface ExclusiveAudioController {
  pause: () => void;
}

type Listener = () => void;

let playingId: string | null = null;
const controllers = new Map<string, ExclusiveAudioController>();
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Id do áudio tocando agora; `null` = nenhum. É também o snapshot do hook. */
export function getPlayingAudioId(): string | null {
  return playingId;
}

/**
 * Registra o controlador de pausa de `id` e devolve o cancelamento do registro. O
 * cancelamento PAUSA o áudio e libera a exclusividade quando era ele o que tocava: desmontar
 * o cartão (troca de aba/conversa, fechar a tela) não deixa som fantasma nem id pendurado.
 */
export function registerExclusiveAudio(
  id: string,
  controller: ExclusiveAudioController,
): () => void {
  controllers.set(id, controller);
  return () => {
    if (controllers.get(id) === controller) controllers.delete(id);
    controller.pause();
    if (playingId !== id) return;
    playingId = null;
    notify();
  };
}

/**
 * `id` passou a tocar. Se havia outro áudio tocando, ele é PAUSADO antes — é isso que
 * garante um áudio por vez na aba inteira. Idempotente para o mesmo id.
 */
export function playExclusiveAudio(id: string): void {
  const previousId = playingId;
  if (previousId === id) return;
  playingId = id;
  if (previousId) controllers.get(previousId)?.pause();
  notify();
}

/**
 * `id` pediu pausa (clique de novo, fim do áudio ou falha): pausa o elemento dele e libera a
 * exclusividade quando era ele o áudio atual. Idempotente.
 */
export function pauseExclusiveAudio(id: string): void {
  controllers.get(id)?.pause();
  if (playingId !== id) return;
  playingId = null;
  notify();
}

/** Leitura reativa do id tocando mais as ações do store (identidade estável das funções). */
export function useExclusiveAudio(): {
  playingId: string | null;
  play: (id: string) => void;
  pause: (id: string) => void;
  register: (id: string, controller: ExclusiveAudioController) => () => void;
} {
  const playingId = useSyncExternalStore(subscribe, getPlayingAudioId, () => null);
  return {
    playingId,
    play: playExclusiveAudio,
    pause: pauseExclusiveAudio,
    register: registerExclusiveAudio,
  };
}
