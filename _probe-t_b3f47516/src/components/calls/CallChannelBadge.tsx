import { cn } from '@/lib/utils';
import { describeReason, type CapabilityReason } from '@/lib/calls/capabilities';
import type { CallChannel } from '@/lib/calls/callStatus';

/** Nome operacional do canal, como o agente o chama. */
const NOME_DO_CANAL: Record<CallChannel, string> = {
  voip: 'VoIP',
  whatsapp: 'WhatsApp',
};

interface CallChannelBadgeProps {
  channel: CallChannel;
  /**
   * Motivo pelo qual o canal está limitado (quando há). O texto vem de
   * `describeReason` — é por aqui que o caso do D8 mostra
   * "Disponível para supervisores" para quem não enxerga a linha.
   */
  motivo?: CapabilityReason | null;
  /**
   * T30: por qual linha a chamada fala ("pela linha <nome>") ou o motivo de ela
   * não aparecer ("Disponível para supervisores", D8). Texto pronto, vindo de
   * `rotuloLinhaWhatsApp`; o selo não decide nada.
   */
  linha?: string | null;
  className?: string;
}

/**
 * Selo do canal da chamada. Só apresentação: quem decide o canal e o motivo é
 * quem chama (`IncomingCallAlert`, a partir das capacidades de `useCallChannels`).
 */
export function CallChannelBadge({ channel, motivo, linha, className }: CallChannelBadgeProps) {
  const texto = describeReason(motivo);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground',
        className,
      )}
    >
      {NOME_DO_CANAL[channel]}
      {texto ? <span className="opacity-80">· {texto}</span> : null}
      {!texto && linha ? <span className="opacity-80">· {linha}</span> : null}
    </span>
  );
}
