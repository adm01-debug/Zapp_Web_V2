/**
 * AIInsightsWidget — "Insights da IA": o que a inteligência comercial do CRM
 * traz e que NÃO aparece em outro lugar da tela: ações recomendadas extras,
 * abordagem de venda pelo DISC, palavras a evitar e a última interação.
 *
 * Sem repetição: dica de abordagem e alerta já estão no card "Briefing"
 * (Inteligência comercial, painel do contato); rapport e gatilhos ficam no
 * Perfil Singu; a 1ª ação recomendada aparece no bloco de churn quando o CRM
 * não manda os fatores de risco.
 *
 * Restaurado (2026-11-12) do widget que saiu como órfão na #1886. Usa a mesma
 * query de `useContactIntelligence` (deduplicada pelo React Query) e vive na
 * aba IA. Com a integração do CRM desligada não consulta nada; sem dado real
 * mostra o vazio honesto — nunca texto inventado.
 */
import type { ReactNode } from 'react';
import { Ban, History, Shield, Target } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useContactIntelligence, type ContactIntelligenceData } from '@/hooks/crm/useContactIntelligence';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';

interface AIInsightsWidgetProps {
  contactId: string;
}

interface InsightLine {
  key: string;
  label: string;
  icon: ReactNode;
  text: string;
}

const MAX_LINES = 4;

/** O bloco de churn do ContactIntelligencePanel mostra a 1ª ação só quando não há fatores de risco. */
function actionsNotShownElsewhere(data: ContactIntelligenceData): string[] {
  const actions = data.churn?.recommended_actions ?? [];
  const factors = data.churn?.risk_factors ?? null;
  const panelShowsReasons = !!factors && Object.values(factors)
    .some((value) => ['string', 'number', 'boolean'].includes(typeof value));
  return panelShowsReasons ? actions : actions.slice(1);
}

function buildInsightLines(data: ContactIntelligenceData | null | undefined): InsightLine[] {
  if (!data?.found) return [];
  const lines: InsightLine[] = [];
  const push = (key: string, label: string, icon: ReactNode, text: string | null | undefined) => {
    const value = text?.trim();
    if (value) lines.push({ key, label, icon, text: value });
  };
  actionsNotShownElsewhere(data).slice(0, 2).forEach((action, i) => {
    push(`action-${i}`, 'Ação recomendada', <Shield className="w-3.5 h-3.5" aria-hidden="true" />, action);
  });
  push('disc-approach', 'Abordagem de venda (DISC)', <Target className="w-3.5 h-3.5" aria-hidden="true" />, data.disc_tips?.sales_approach?.[0]);
  const avoid = (data.disc_tips?.keywords_to_avoid ?? []).map((k) => k?.trim()).filter(Boolean).slice(0, 4);
  if (avoid.length) push('disc-avoid', 'Evite', <Ban className="w-3.5 h-3.5" aria-hidden="true" />, avoid.join(', '));
  const last = data.last_interactions?.[0];
  if (last) {
    const summary = last.resumo?.trim() || last.assunto?.trim();
    if (summary) push('last', 'Última interação', <History className="w-3.5 h-3.5" aria-hidden="true" />, `${summary} (${last.channel})`);
  }
  return lines.slice(0, MAX_LINES);
}

function Muted({ testId, children }: { testId: string; children: string }) {
  return <p data-testid={testId} className="text-sm text-muted-foreground">{children}</p>;
}

function AIInsightsBody({ contactId }: AIInsightsWidgetProps) {
  const { data, isLoading } = useContactIntelligence(contactId);

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="ai-insights-loading">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
      </div>
    );
  }

  // O hook devolve null tanto sem ficha quanto quando a consulta ao CRM falha.
  const lines = buildInsightLines(data);
  if (!lines.length) return <Muted testId="ai-insights-empty">Sem insights do CRM para este contato.</Muted>;

  return (
    <ul className="space-y-1.5" data-testid="ai-insights">
      {lines.map((line) => (
        <li key={line.key} className="flex items-start gap-2 rounded-lg bg-muted/20 p-2 text-xs">
          <span className="shrink-0 mt-0.5 text-kpi-purple-fg">{line.icon}</span>
          <span className="min-w-0">
            <span className="font-medium text-muted-foreground">{line.label}: </span>
            <span className="text-foreground break-words">{line.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AIInsightsWidget({ contactId }: AIInsightsWidgetProps) {
  const crmEnabled = useCRMIntegrationEnabled();
  // Kill switch fail-closed: sem a integração ligada não consulta nem lê cache.
  if (!crmEnabled) return <Muted testId="ai-insights-disabled">Integração com o CRM desligada.</Muted>;
  return <AIInsightsBody contactId={contactId} />;
}
