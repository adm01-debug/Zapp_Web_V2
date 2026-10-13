/**
 * ContactIntelligencePanel
 *
 * Seção "Inteligência comercial" do painel do contato (12/10/2026): mostra
 * APENAS risco de churn (nível + motivo) e melhores horários de contato.
 * DISC/VAK/Big Five e "Rapport & gatilhos" já vivem na seção Singu
 * (sidebar/SinguProfileSection.tsx) e não são repetidos aqui.
 *
 * Sem dado do CRM a seção não inventa nada: mostra um estado vazio honesto.
 */
import { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';
import { Clock, Shield, TrendingDown } from 'lucide-react';
import { useContactIntelligence } from '@/hooks/crm/useContactIntelligence';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import type { BestTime, ChurnData } from '@/hooks/crm/useContactIntelligence';

interface ContactIntelligencePanelProps {
  contactId: string;
}

// ========================
// Sub-components
// ========================

const CHURN_LEVEL_LABEL: Record<string, string> = {
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
};

const CHURN_LEVEL_CLASSES: Record<string, string> = {
  high: 'bg-destructive/10 border-destructive/20 text-destructive',
  medium: 'bg-warning/10 border-warning/20 text-warning',
  low: 'bg-success/10 border-success/20 text-success',
};

/** Motivo do risco: só o que o CRM devolveu em `risk_factors`, sem texto inventado. */
function churnReasons(churn: ChurnData): { label: string; value: string }[] {
  if (!churn.risk_factors) return [];
  return Object.entries(churn.risk_factors)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 4)
    .map(([key, value]) => ({ label: key.replace(/_/g, ' '), value: String(value) }));
}

function ChurnAlert({ churn }: { churn: ChurnData }) {
  const reasons = churnReasons(churn);

  return (
    <div
      data-testid="intelligence-churn"
      className={cn('rounded-lg p-2.5 border', CHURN_LEVEL_CLASSES[churn.risk_level] || 'bg-muted/10')}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <TrendingDown className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Risco de churn</span>
        </div>
        <span className="text-xs font-bold">
          {CHURN_LEVEL_LABEL[churn.risk_level] || churn.risk_level} · {Math.round(churn.churn_probability)}%
        </span>
      </div>
      {reasons.length > 0 ? (
        <ul className="text-3xs opacity-80 mt-1 space-y-0.5">
          {reasons.map((reason) => (
            <li key={reason.label}>
              <span className="font-medium">{reason.label}:</span> {reason.value}
            </li>
          ))}
        </ul>
      ) : churn.recommended_actions?.[0] ? (
        <p className="text-3xs opacity-80 mt-1">{churn.recommended_actions[0]}</p>
      ) : null}
    </div>
  );
}

function BestTimesSection({ times }: { times: BestTime[] }) {
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  if (!times.length) {
    return (
      <div data-testid="intelligence-best-times" className="bg-muted/10 rounded-md p-2 text-xs text-muted-foreground">
        <p>Sem horários observados para este contato.</p>
      </div>
    );
  }

  return (
    <div data-testid="intelligence-best-times" className="flex flex-wrap gap-1.5">
      {times.map((t, i) => (
        <div key={i} className="bg-muted/20 rounded-md px-2 py-1 text-center">
          <p className="text-3xs text-muted-foreground">{dayNames[t.day_of_week] || '?'}</p>
          <p className="text-xs font-medium">{t.hour}h</p>
          {t.success_rate != null && t.success_rate > 0 && (
            <p className="text-[9px] text-success">{t.success_rate}%</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ========================
// Main Component
// ========================

function ContactIntelligencePanelInner({ contactId }: ContactIntelligencePanelProps) {
  const { data, isLoading } = useContactIntelligence(contactId);
  const reduceMotion = useReducedMotion();
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (!data?.found) {
    return (
      <p data-testid="intelligence-empty" className="bg-muted/10 rounded-md p-2 text-xs text-muted-foreground">
        Sem inteligência comercial para este contato.
      </p>
    );
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Risco de churn — nível + motivo devolvidos pelo CRM */}
      <div className="space-y-1.5">
        <h5 className="text-2xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-primary" />
          Risco de perda
        </h5>
        {data.churn ? (
          <ChurnAlert churn={data.churn} />
        ) : (
          <p className="bg-muted/10 rounded-md p-2 text-xs text-muted-foreground">Sem risco calculado para este contato.</p>
        )}
      </div>

      {/* Melhores horários de contato */}
      <div className="space-y-1.5">
        <h5 className="text-2xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-primary" />
          Melhores horários
        </h5>
        <BestTimesSection times={data.best_times} />
      </div>
    </motion.div>
  );
}

/**
 * Portão da integração: o dado vem do CRM externo, então sem integração ligada
 * a seção diz isso e não chama a query (evita depender de provider de query em
 * telas que ainda não têm um).
 */
function ContactIntelligencePanelGate({ contactId }: ContactIntelligencePanelProps) {
  const crmEnabled = useCRMIntegrationEnabled();

  if (!crmEnabled) {
    return (
      <p data-testid="intelligence-empty" className="bg-muted/10 rounded-md p-2 text-xs text-muted-foreground">
        Integração com o CRM desligada.
      </p>
    );
  }

  return <ContactIntelligencePanelInner contactId={contactId} />;
}

export const ContactIntelligencePanel = memo(ContactIntelligencePanelGate);
