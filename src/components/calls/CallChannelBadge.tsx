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
  className?: string;
}

/**
 * Selo do canal da chamada. Só apresentação: quem decide o canal e o motivo é
 * quem chama (`IncomingCallAlert`, a partir das capacidades de `useCallChannels`).
 */
export function CallChannelBadge({ channel, motivo, className }: CallChannelBadgeProps) {
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
    </span>
  );
}
