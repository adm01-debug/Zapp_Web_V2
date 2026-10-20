// TalkXHealthCard.tsx — X148: card "Saúde da Campanha" (acompanhamento da campanha).
//
// Apresentação apenas: a regra (estado do worker, pausa automática × manual, taxa medida)
// está em ./talkxHealth.ts, porque o lint só admite componente exportado em arquivo .tsx.
// Nenhum token/cor novo: só classes que já existem no projeto.

import { Activity, HelpCircle } from 'lucide-react';
import { Pill } from '@/components/dashboard/overview/DashboardCard';
import { RailCard, MetaRow, fmtDateTime } from '../talkxShared';
import { deriveTalkXHealth, fmtRatePerMinute, type TalkXHealthInput } from './talkxHealth';

export interface TalkXHealthCardProps extends TalkXHealthInput {
  /** Rótulo do status da conexão WhatsApp da campanha (hook `useTalkXConnectionStatus`). */
  connectionLabel?: string | null;
  /** Taxa medida (msgs/min); null = sem envio para medir. */
  ratePerMinute?: number | null;
  /** Início da campanha (a tela já mostrava esta linha). */
  startedAt?: string | null;
  /** Abre a ajuda do módulo. */
  onOpenHelp?: () => void;
}

/**
 * "Saúde da Campanha": status atual (com o que fazer quando parou), conexão WhatsApp,
 * taxa medida por minuto e o início da campanha.
 */
export function TalkXHealthCard({
  connectionLabel,
  ratePerMinute,
  startedAt,
  onOpenHelp,
  ...healthInput
}: TalkXHealthCardProps) {
  const health = deriveTalkXHealth(healthInput);

  return (
    <RailCard
      icon={Activity}
      color="blue"
      title="Saúde da Campanha"
      right={<Pill label={health.pillLabel} tone={health.tone} dot />}
    >
      <div className="pt-1 space-y-0.5">
        <MetaRow label="Status atual" value={health.label} />
        {/* O botão só existe quando há saída de verdade: sem `onOpenHelp` ele não é
            renderizado (botão sem ação é o defeito clássico desta tela). */}
        {health.needsHelp && onOpenHelp && (
          <div className="pb-1">
            <button
              type="button"
              onClick={onOpenHelp}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-primary/40 bg-primary/10 text-2xs font-semibold text-primary hover:bg-primary/20"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Ver o que fazer
            </button>
          </div>
        )}
        <MetaRow label="Conexão WhatsApp" value={connectionLabel ?? '—'} />
        <MetaRow label="Taxa de envio (por minuto)" value={fmtRatePerMinute(ratePerMinute)} />
        <MetaRow label="Iniciado em" value={startedAt ? fmtDateTime(startedAt) : '—'} />
      </div>
    </RailCard>
  );
}
