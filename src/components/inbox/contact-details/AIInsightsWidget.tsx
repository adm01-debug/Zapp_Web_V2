import type { ReactNode } from 'react';
import { Lightbulb, AlertTriangle, Heart, Zap, Shield, Sparkles, ChevronRight } from 'lucide-react';
import { useContactIntelligence } from '@/hooks/crm/useContactIntelligence';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';

interface AIInsightsWidgetProps {
  contactId: string;
}

/** Resumo compacto do ContactIntelligencePanel (mesma query, dedupada pelo React Query) — só aparece com dado real. */
export function AIInsightsWidget({ contactId }: AIInsightsWidgetProps) {
  const { data } = useContactIntelligence(isExternalConfigured ? contactId : undefined);
  if (!data?.found) return null;

  const items: { icon: ReactNode; text: string }[] = [];
  if (data.briefing?.opening_tip) items.push({ icon: <Lightbulb className="w-3.5 h-3.5" />, text: data.briefing.opening_tip });
  if (data.briefing?.risk_alert) items.push({ icon: <AlertTriangle className="w-3.5 h-3.5" />, text: data.briefing.risk_alert });
  if (data.rapport?.suggestions?.[0]) items.push({ icon: <Heart className="w-3.5 h-3.5" />, text: data.rapport.suggestions[0] });
  if (data.triggers?.[0]?.trigger_name) items.push({ icon: <Zap className="w-3.5 h-3.5" />, text: data.triggers[0].trigger_name });
  if (data.churn?.recommended_actions?.[0]) items.push({ icon: <Shield className="w-3.5 h-3.5" />, text: data.churn.recommended_actions[0] });

  const lines = items.slice(0, 4);
  if (!lines.length) return null;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-kpi-tile-purple-fg/30 bg-kpi-tile-purple p-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-kpi-tile-purple-fg" />
        <span className="text-sm font-semibold text-kpi-tile-purple-fg">Insights da IA</span>
      </div>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-kpi-tile-purple-fg">
            <span className="shrink-0">{line.icon}</span>
            <span className="flex-1 truncate">{line.text}</span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
          </div>
        ))}
      </div>
    </div>
  );
}
