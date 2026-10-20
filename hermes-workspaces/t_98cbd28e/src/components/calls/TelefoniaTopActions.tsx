import { Phone } from 'lucide-react';
import { useCallChannels } from '@/hooks/calls/useCallChannels';
import { describeReason } from '@/lib/calls/capabilities';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PeriodSelect } from './PeriodSelect';
import type { PeriodoValue } from './periodos';

interface TelefoniaTopActionsProps {
  period: PeriodoValue;
  onPeriodChange: (valor: PeriodoValue) => void;
}

/**
 * T35: os controles do topo da tela de Telefonia.
 *
 * Os rotulos dos chips refletem o que `useCallChannels` diz AGORA (aceite do T35):
 * cada chip usa a `reason` do seu canal via `describeReason` - e por isso que o
 * agente comum ve "Disponível para supervisores" no chip do WhatsApp (D8) sem que
 * este componente saiba nada sobre permissao.
 *
 * Chip nao e botao de acao: aqui so mostra o estado do canal. Ligar e no historico
 * e no contact-details (T29: o clique-para-discar unificado).
 */
export function TelefoniaTopActions({ period, onPeriodChange }: TelefoniaTopActionsProps) {
  const { voip, whatsapp } = useCallChannels();

  const canais = [
    { chave: 'voip', rotulo: 'VoIP', ok: voip.canDial || voip.canReceive, motivo: describeReason(voip.reason) },
    { chave: 'whatsapp', rotulo: 'WhatsApp', ok: whatsapp.canReceive, motivo: describeReason(whatsapp.reason) },
  ] as const;

  return (
    <div className="flex items-center gap-2 h-10" data-testid="tel-top-actions">
      {canais.map((c) => (
        <TooltipProvider key={c.chave} delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                data-testid={`tel-chip-${c.chave}`}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium"
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${c.ok ? 'bg-success' : 'bg-muted-foreground/40'}`}
                />
                {c.rotulo}
              </span>
            </TooltipTrigger>
            <TooltipContent>{c.motivo ?? `${c.rotulo} disponível`}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
      <PeriodSelect value={period} onValueChange={onPeriodChange} />
    </div>
  );
}
