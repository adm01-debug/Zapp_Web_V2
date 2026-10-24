import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { useResolvedStorageUrl } from '@/hooks/storage/useResolvedStorageUrl';
import { useExclusiveAudio, getPlayingAudioId } from '@/hooks/chat/useExclusiveAudio';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { attachMediaVolume } from '@/lib/mediaVolumeElement';
import { formatDuration } from './fileDisplay';

/**
 * A02 — Play/Pause do áudio direto no cartão da aba Arquivos (Grid, Lista e Tabela).
 *
 * Três decisões do plano moram aqui:
 * - D02: quem garante "um áudio por vez" é o store `useExclusiveAudio`; desmontar o cartão
 *   (troca de aba/conversa, fechar a tela) pausa o som e libera o dono do áudio.
 * - D03: a URL assinada só é resolvida no PRIMEIRO clique — enquanto `armed` é falso o
 *   resolver recebe fonte vazia, então abrir a aba não assina nem baixa áudio nenhum. Erro
 *   de URL expirada renova UMA vez (`refresh`) e tenta de novo; falhando, "Não foi possível
 *   tocar".
 * - D04: tempo restante em m:ss e barra fina de progresso enquanto toca; ao terminar volta
 *   ao estado de play.
 *
 * `attachMediaVolume` não é enfeite: o contrato das superfícies de mídia de conversa
 * (`tests/contracts/media-volume-surfaces.contract.test.ts`) exige que um player novo entre
 * no controle ÚNICO de volume — fora dele o áudio tocaria no volume cheio e o slider mentiria.
 */

/** Mesma ação dos outros botões da linha (olho, compartilhar, ⋮) nas três vistas. */
const BUTTON =
  'w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface AudioPlayButtonProps {
  /** Item de ÁUDIO (`ContactMediaItem.type === 'audio'`). Ninguém renderiza este botão fora disso. */
  item: ContactMediaItem;
}

export function AudioPlayButton({ item }: AudioPlayButtonProps) {
  const { playingId, play, pause, register } = useExclusiveAudio();
  const playing = playingId === item.id;

  /** D03 — a fonte só é armada no primeiro clique. */
  const [armed, setArmed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const detachVolumeRef = useRef<(() => void) | null>(null);
  /** Cartão criado e ainda sem URL: o efeito abaixo liga a fonte quando ela chegar. */
  const waitingUrlRef = useRef(false);
  const retriedRef = useRef(false);
  const retryingRef = useRef(false);
  const failedRef = useRef(false);

  const { url, error, refresh } = useResolvedStorageUrl(
    armed ? item.url : '',
    undefined,
    armed ? { signedUrl: item.signedUrl, signedUrlExpiresAt: item.expiresAt } : undefined,
  );

  /**
   * A intenção de tocar ESTE item continua viva? O store é a autoridade (o `playingId` do
   * render fica velho dentro de um `await`): se o usuário pausou — ou outro item assumiu —
   * durante a renovação da URL, a continuação assíncrona tem de desistir, senão o som
   * começaria depois do pause.
   */
  const isPlayIntentCurrent = useCallback(() => getPlayingAudioId() === item.id, [item.id]);

  /** Mensagem de falha (idempotente) — sem tocar em estado do React para poder rodar do efeito. */
  const notifyFailure = useCallback(() => {
    if (failedRef.current) return;
    failedRef.current = true;
    waitingUrlRef.current = false;
    pause(item.id);
    toast.error('Não foi possível tocar');
  }, [item.id, pause]);

  const failPlayback = useCallback(() => {
    notifyFailure();
    setElapsed(0);
    setDuration(0);
  }, [notifyFailure]);

  /**
   * Erro do elemento ou `play()` recusado. A primeira falha renova a URL UMA vez (D03) e
   * tenta de novo no mesmo elemento; a segunda mostra "Não foi possível tocar".
   */
  const handleFailure = useCallback(
    (audio: HTMLAudioElement) => {
      if (failedRef.current || retryingRef.current) return;
      if (retriedRef.current) {
        failPlayback();
        return;
      }
      retriedRef.current = true;
      retryingRef.current = true;
      void refresh().then((fresh) => {
        retryingRef.current = false;
        if (!isPlayIntentCurrent()) return;
        if (!fresh) {
          failPlayback();
          return;
        }
        if (audio.src !== fresh) audio.src = fresh;
        void audio.play().catch(() => {
          if (retriedRef.current) failPlayback();
        });
      });
    },
    [failPlayback, isPlayIntentCurrent, refresh],
  );

  /** Liga a fonte e toca. Amarra o `onerror` aqui para ele enxergar o `refresh` da fonte armada. */
  const startPlayback = useCallback(
    (audio: HTMLAudioElement, source: string) => {
      audio.onerror = () => handleFailure(audio);
      if (audio.src !== source) audio.src = source;
      void audio.play().catch(() => handleFailure(audio));
    },
    [handleFailure],
  );

  useEffect(() => {
    if (!waitingUrlRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (url) {
      waitingUrlRef.current = false;
      if (isPlayIntentCurrent()) startPlayback(audio, url);
      return;
    }
    if (error) notifyFailure();
  }, [url, error, startPlayback, notifyFailure, isPlayIntentCurrent]);

  // D02/requisito 5: desmontar pausa o som e libera o dono do áudio no store.
  useEffect(() => {
    const unregister = register(item.id, {
      pause: () => {
        // Desiste do play que ainda esperava a URL: sem isso o áudio começaria sozinho
        // depois de o usuário pausar (ou depois de outro item assumir) — som fantasma.
        waitingUrlRef.current = false;
        audioRef.current?.pause();
      },
    });
    return () => {
      unregister();
      detachVolumeRef.current?.();
      detachVolumeRef.current = null;
      audioRef.current = null;
      waitingUrlRef.current = false;
    };
  }, [item.id, register]);

  const ensureAudio = (): HTMLAudioElement => {
    const existing = audioRef.current;
    if (existing) return existing;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.onloadedmetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.ontimeupdate = () => setElapsed(audio.currentTime);
    audio.onplay = () => play(item.id);
    audio.onpause = () => pause(item.id);
    audio.onended = () => {
      setElapsed(0);
      pause(item.id);
    };
    detachVolumeRef.current = attachMediaVolume(audio);
    audioRef.current = audio;
    return audio;
  };

  const handleToggle = () => {
    if (playing) {
      pause(item.id);
      return;
    }
    failedRef.current = false;
    retriedRef.current = false;
    retryingRef.current = false;
    play(item.id);
    const audio = ensureAudio();
    if (url) {
      startPlayback(audio, url);
      return;
    }
    if (armed) {
      // Fonte já armada e ainda sem URL em mãos (renovação anterior falhou): renova ao clicar.
      retryingRef.current = true;
      void refresh().then((fresh) => {
        retryingRef.current = false;
        if (!isPlayIntentCurrent()) return;
        if (!fresh) {
          failPlayback();
          return;
        }
        startPlayback(audio, fresh);
      });
      return;
    }
    waitingUrlRef.current = true;
    setArmed(true);
  };

  const remaining = duration > 0 ? Math.max(0, duration - elapsed) : 0;
  const percent = duration > 0 ? Math.min(100, Math.max(0, (elapsed / duration) * 100)) : 0;
  const active = playing || elapsed > 0;

  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <button
        type="button"
        aria-label={playing ? 'Pausar áudio' : 'Tocar áudio'}
        className={BUTTON}
        onClick={(event) => {
          // D05: clicar no play/pause não abre a janela de visualização nem marca o cartão.
          event.stopPropagation();
          handleToggle();
        }}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>
      {active && (
        <>
          {duration > 0 && (
            <span
              data-testid={`audio-remaining-${item.id}`}
              className="text-2xs tabular-nums leading-none text-muted-foreground"
            >
              {formatDuration(remaining)}
            </span>
          )}
          <span
            role="progressbar"
            aria-label="Progresso do áudio"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            className="h-0.5 w-7 overflow-hidden rounded-full bg-muted"
          >
            <span className="block h-full bg-primary" style={{ width: `${percent}%` }} />
          </span>
        </>
      )}
    </span>
  );
}
