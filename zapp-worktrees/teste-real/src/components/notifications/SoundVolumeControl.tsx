import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VolumeSliderPopoverContent } from '@/components/ui/VolumeSliderPopoverContent';
import { VolumeTriggerButton } from '@/components/ui/VolumeTriggerButton';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { useVolumeRocker } from '@/hooks/ui/useVolumeRocker';
import {
  SOUND_VOLUME_LABEL,
  SOUND_VOLUME_LABEL_MUTED,
  SOUND_VOLUME_SLIDER_LABEL,
} from '@/lib/volumeLabels';
import { cn } from '@/lib/utils';
import { log } from '@/lib/logger';

/** Passo e faixa do volume dos sons de alerta — espelha o painel (`sound_volume`, 10–100). */
const SOUND_VOLUME_STEP = 5;
const SOUND_VOLUME_MIN = 10;
const SOUND_VOLUME_MAX = 100;
/** Abaixo disso o atendente pode não perceber o alerta; mostramos o ponto de atenção. */
const LOW_VOLUME_THRESHOLD = 30;
/**
 * D06/B6 — a gravação vai para `user_settings` **~400 ms depois do último movimento**.
 * Antes cada passo era um POST (medido: 7 gravações em ~10 ações); arrastar o slider com
 * a rede caída virava uma pilha de upserts. A tela anda na hora; a rede, no fim do gesto.
 */
const SAVE_DEBOUNCE_MS = 400;

const clampVolume = (value: number) =>
  Math.min(SOUND_VOLUME_MAX, Math.max(SOUND_VOLUME_MIN, Math.round(value)));

/**
 * Controle rápido do volume dos **sons de alerta** na sidebar.
 *
 * Substitui o antigo `SoundMuteToggle`, que só mutava e não permitia subir/abaixar o
 * volume. Agora o usuário sobe e desce o volume dos alertas:
 *  - clique = mudo/desmudo (mantido, como no controle de mídias ao lado);
 *  - clique longo = abre o slider vertical (gráfico de aumentar/diminuir);
 *  - scroll sobre o ícone e setas ↑/↓ ajustam de 5 em 5;
 *  - a tecla `M` alterna o mudo.
 *
 * Volume e mudo saem SEMPRE das preferências (`useNotificationSettings`), nunca de
 * constantes. O ícone reflete o nível: `Volume1` (baixo) → `Volume2` (alto), ou
 * `VolumeX` quando mudo. Mudo e volume são estados SEPARADOS (S39): o clique no botão
 * grava só `soundEnabled` — nunca zera o volume —, então desmutar devolve o último
 * volume escolhido, e o mínimo do slider (10) impede um 0 acidental.
 *
 * O volume mostrado na tela é o valor PENDENTE (o que o usuário acabou de escolher);
 * a gravação sai agrupada, ver `SAVE_DEBOUNCE_MS`.
 */
export function SoundVolumeControl({ className }: { className?: string }) {
  const { settings, updateSettings } = useNotificationSettings();

  const muted = !settings.soundEnabled;
  const savedVolume = settings.soundVolume;

  // Valor na tela durante o movimento (ainda não gravado). `null` = a tela segue as
  // preferências — é assim que um desfazer (falha) reaparece sem travar no valor perdido.
  const [pendingVolume, setPendingVolume] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const volume = pendingVolume ?? savedVolume;

  const saveTimerRef = useRef<number | null>(null);
  /** Último valor pedido pelo usuário — o que o timer pendente vai gravar. */
  const targetRef = useRef<number | null>(null);
  /** Quantas gravações estão em voo: a resposta da primeira não pode apagar o indicador da segunda. */
  const inFlightRef = useRef(0);
  const mountedRef = useRef(true);

  const cancelScheduledSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  // Desmontou: o timer pendente morre junto (nada de gravar sem tela para mostrar o valor).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelScheduledSave();
    };
  }, [cancelScheduledSave]);

  /**
   * Grava o valor agrupado. O desfazer e o aviso curto de falha são do
   * `useNotificationSettings` (ele desfaz o otimista e avisa uma vez por rajada); aqui
   * soltamos o valor pendente para a tela voltar a seguir as preferências — sem isso o
   * controle ficaria preso mostrando um volume que o banco recusou.
   */
  const commitPendingVolume = useCallback(async () => {
    saveTimerRef.current = null;
    const target = targetRef.current;
    targetRef.current = null;
    if (target === null) return;

    inFlightRef.current += 1;
    setSaving(true);
    try {
      await updateSettings({ soundVolume: target });
    } catch (error) {
      // O hook já desfaz o otimista e mostra o toast; aqui só encerramos a promessa
      // disparada com `void` para não virar unhandled rejection no controle.
      log.warn('Failed to commit sidebar sound volume:', error);
    } finally {
      inFlightRef.current -= 1;
      if (mountedRef.current) {
        if (inFlightRef.current === 0) setSaving(false);
        // Só solta o pendente se ele AINDA for o que foi gravado: um movimento novo
        // durante a gravação mantém o valor novo na tela (nada de pulo para trás).
        setPendingVolume((atual) => (atual === target ? null : atual));
      }
    }
  }, [updateSettings]);

  const scheduleSave = useCallback(
    (target: number) => {
      targetRef.current = target;
      cancelScheduledSave();
      saveTimerRef.current = window.setTimeout(() => {
        void commitPendingVolume();
      }, SAVE_DEBOUNCE_MS);
    },
    [cancelScheduledSave, commitPendingVolume],
  );

  const setVolume = useCallback(
    (value: number) => {
      const target = clampVolume(value);
      setPendingVolume(target);
      scheduleSave(target);
    },
    [scheduleSave],
  );
  const adjustBy = useCallback(
    (delta: number) => {
      setVolume(volume + delta);
    },
    [setVolume, volume],
  );
  const toggleMuted = useCallback(() => {
    void updateSettings({ soundEnabled: !settings.soundEnabled });
  }, [updateSettings, settings.soundEnabled]);

  const rootRef = useRef<HTMLSpanElement>(null);
  const rocker = useVolumeRocker({
    step: SOUND_VOLUME_STEP,
    onAdjust: adjustBy,
    onToggleMute: toggleMuted,
    rootRef,
  });

  const label = muted ? SOUND_VOLUME_LABEL_MUTED : `${SOUND_VOLUME_LABEL}: ${volume}%`;
  const showLowVolumeDot = muted || volume < LOW_VOLUME_THRESHOLD;
  const Icon = muted ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const trigger = (
    <VolumeTriggerButton
      label={label}
      muted={muted}
      icon={<Icon className="h-[16px] w-[16px]" />}
      className={cn(
        'h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground',
        !muted && 'text-primary',
      )}
      lowDot={showLowVolumeDot}
      lowDotTestId="sound-volume-low-dot"
      rocker={rocker}
    />
  );

  return (
    <Popover open={rocker.open} onOpenChange={rocker.setOpen}>
      <PopoverAnchor asChild>
        <span
          ref={rootRef}
          className={cn('relative inline-flex items-center', className)}
          onClick={(event) => event.stopPropagation()}
        >
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <p>{label}</p>
            </TooltipContent>
          </Tooltip>
        </span>
      </PopoverAnchor>

      <PopoverContent
        side="right"
        align="center"
        collisionPadding={8}
        className="z-[60] w-56 p-3 motion-reduce:animate-none"
        onClick={(event) => event.stopPropagation()}
      >
        <VolumeSliderPopoverContent
          title={SOUND_VOLUME_SLIDER_LABEL}
          valueLabel={muted ? 'Mudo' : `${volume}%`}
          volume={volume}
          muted={muted}
          min={SOUND_VOLUME_MIN}
          max={SOUND_VOLUME_MAX}
          step={SOUND_VOLUME_STEP}
          thumbLabel={SOUND_VOLUME_SLIDER_LABEL}
          onVolumeChange={setVolume}
          onToggleMute={toggleMuted}
          valueTestId="sound-volume-value"
          footer={
            // S38 — indicador discreto: informa que a gravação está em curso e NÃO
            // desabilita o slider (o usuário continua ajustando enquanto salva).
            saving ? (
              <p role="status" data-testid="sound-volume-saving" className="text-3xs text-muted-foreground">
                Salvando…
              </p>
            ) : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}
