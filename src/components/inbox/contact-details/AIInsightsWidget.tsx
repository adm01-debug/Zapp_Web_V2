/**
 * AIInsightsWidget — "Insights da IA": resumo curto da inteligência comercial
 * do CRM (dica de abordagem, alerta, rapport, gatilho e ação recomendada).
 *
 * Restaurado (2026-11-12) do widget que saiu como órfão na #1886. Usa a mesma
 * query de `useContactIntelligence` (deduplicada pelo React Query) e vive na
 * aba IA. Com a integração do CRM desligada não consulta nada; sem dado real
 * mostra o vazio honesto — nunca texto inventado.
 */
import type { ReactNode } from 'react';
import { AlertTriangle, Heart, Lightbulb, Shield, Zap } from 'lucide-react';
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

export function buildInsightLines(data: ContactIntelligenceData | null | undefined): InsightLine[] {
  if (!data?.found) return [];
  const lines: InsightLine[] = [];
  const push = (key: string, label: string, icon: ReactNode, text: string | null | undefined) => {
    const value = text?.trim();
    if (value) lines.push({ key, label, icon, text: value });
  };
  push('opening', 'Dica de abordagem', <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />, data.briefing?.opening_tip);
  push('risk', 'Alerta', <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />, data.briefing?.risk_alert);
  push('rapport', 'Rapport', <Heart className="w-3.5 h-3.5" aria-hidden="true" />, data.rapport?.suggestions?.[0]);
  push('trigger', 'Gatilho', <Zap className="w-3.5 h-3.5" aria-hidden="true" />, data.triggers?.[0]?.trigger_name);
  push('action', 'Ação recomendada', <Shield className="w-3.5 h-3.5" aria-hidden="true" />, data.churn?.recommended_actions?.[0]);
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
            <span className="sr-only">{line.label}: </span>
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
