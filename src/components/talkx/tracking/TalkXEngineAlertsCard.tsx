// X158 — C-11: card "Alertas do motor" (acompanhamento da campanha).
//
// `talkx_alerts` é escrita pelo tick do motor e não tinha nenhuma tela lendo: o
// operador só percebia a falha quando a campanha parava de sair. Aqui os
// alertas abertos aparecem junto da saúde da campanha, com o motivo que o
// motor gravou no `payload`.
//
// Apresentação apenas: leitura e tradução dos `kind`/`payload` estão em
// `@/hooks/integrations/useTalkXEngineAlerts`.
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Pill } from '@/components/dashboard/overview/DashboardCard';
import { useTalkXEngineAlerts } from '@/hooks/integrations/useTalkXEngineAlerts';
import { RailCard, TalkXQueryBoundary, TalkXSkeletonRows, fmtAgo } from '../talkxShared';

export interface TalkXEngineAlertsCardProps {
  /** Campanha em acompanhamento; sem ela o card mostra todos os alertas abertos. */
  campaignId?: string | null;
}

/** De onde vem o alerta, do ponto de vista de quem está olhando a campanha. */
function scopeLabel(alertCampaignId: string | null, currentCampaignId?: string | null) {
  if (!alertCampaignId) return 'Motor (geral)';
  if (currentCampaignId && alertCampaignId === currentCampaignId) return 'Esta campanha';
  return `Campanha ${alertCampaignId.slice(0, 8)}`;
}

/**
 * "Alertas do motor": o que o motor registrou e ainda não resolveu.
 * Vazio aqui é boa notícia — por isso o estado vazio é afirmativo, não cinza.
 */
export function TalkXEngineAlertsCard({ campaignId }: TalkXEngineAlertsCardProps) {
  const { alerts, isLoading, isError, error, refetch } = useTalkXEngineAlerts(campaignId);
  const total = alerts?.length ?? 0;
  const criticos = (alerts ?? []).filter((alert) => alert.tone === 'danger').length;

  return (
    <RailCard
      icon={AlertTriangle}
      color="red"
      title="Alertas do motor"
      right={
        isLoading ? undefined : total > 0
          ? <Pill label={`${total} ${total === 1 ? 'aberto' : 'abertos'}`} tone={criticos > 0 ? 'danger' : 'warning'} dot />
          : <Pill label="Sem alertas" tone="success" dot />
      }
    >
      <TalkXQueryBoundary
        query={{ isLoading, isError, error }}
        entity="alertas do motor"
        onRetry={refetch}
        skeleton={<TalkXSkeletonRows rows={2} />}
        isEmpty={total === 0}
        empty={
          <div className="py-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-[hsl(var(--dash-green))]" />
              Nenhum alerta aberto
            </p>
            <p className="mt-1 text-2xs text-muted-foreground leading-relaxed">
              O motor não registrou falha de envio nem ciclo degradado.
              Alertas aparecem aqui para administradores e supervisores.
            </p>
          </div>
        }
      >
        <ul className="divide-y divide-border/50">
          {(alerts ?? []).map((alert) => (
            <li key={alert.id} className="py-2 first:pt-1 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{alert.label}</span>
                <Pill label={alert.tone === 'danger' ? 'Crítico' : 'Atenção'} tone={alert.tone} dot />
              </div>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                {scopeLabel(alert.campaignId, campaignId)} · aberto há {fmtAgo(alert.openedAt)}
              </p>
              {alert.detail && (
                <p className="mt-0.5 text-2xs text-muted-foreground break-words">{alert.detail}</p>
              )}
            </li>
          ))}
        </ul>
      </TalkXQueryBoundary>
    </RailCard>
  );
}