/**
 * ContactIntelligencePanel
 * 
 * Unified commercial intelligence panel for the contact details sidebar.
 * Sections: Pre-contact Briefing, Mental Triggers, Rapport Suggestions,
 * Best Contact Times, Churn Risk, DISC Communication Tips.
 */
import { memo } from 'react';
import { useContactIntelligence } from '@/hooks/crm/useContactIntelligence';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Brain,
  Lightbulb,
  Heart,
  Clock,
  AlertTriangle,
  MessageSquare,
  Target,
  Zap,
  Shield,
  TrendingDown,
  User,
  Calendar,
  ThumbsUp,
  Ban,
} from 'lucide-react';
import type {
  ContactBriefing,
  MentalTrigger,
  RapportData,
  BestTime,
  ChurnData,
  DISCTips,
} from '@/hooks/crm/useContactIntelligence';

interface ContactIntelligencePanelProps {
  contactId: string;
}

// ========================
// Sub-components
// ========================

function BriefingCard({ briefing }: { briefing: ContactBriefing }) {
  return (
    <div className="space-y-2">
      {/* Opening tip */}
      <div className="bg-primary/5 border border-primary/10 rounded-lg p-2.5">
        <div className="flex items-start gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-foreground leading-relaxed">{briefing.opening_tip}</p>
        </div>
      </div>

      {/* Risk alert */}
      {briefing.risk_alert && (
        <div className="bg-destructive/5 border border-destructive/10 rounded-lg p-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-destructive leading-relaxed">{briefing.risk_alert}</p>
          </div>
        </div>
      )}

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-muted/20 rounded-md p-1.5 text-center">
          <p className="text-[10px] text-muted-foreground">Último contato</p>
          <p className="text-xs font-medium">
            {briefing.days_since_last_contact != null
              ? briefing.days_since_last_contact === 0
                ? 'Hoje'
                : `${briefing.days_since_last_contact}d`
              : '—'}
          </p>
        </div>
        <div className="bg-muted/20 rounded-md p-1.5 text-center">
          <p className="text-[10px] text-muted-foreground">Interações</p>
          <p className="text-xs font-medium">{briefing.total_interactions}</p>
        </div>
        <div className="bg-muted/20 rounded-md p-1.5 text-center">
          <p className="text-[10px] text-muted-foreground">Score</p>
          <p className={cn(
            'text-xs font-medium',
            (briefing.relationship_score || 0) >= 70 ? 'text-success' :
            (briefing.relationship_score || 0) >= 40 ? 'text-warning' : 'text-muted-foreground'
          )}>
            {briefing.relationship_score || '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

function TriggersSection({ triggers }: { triggers: MentalTrigger[] }) {
  if (!triggers.length) return null;

  const categoryColors: Record<string, string> = {
    reciprocity: 'bg-accent/10 text-accent border-accent/20',
    social: 'bg-info/10 text-info border-info/20',
    authority: 'bg-warning/10 text-warning border-warning/20',
    scarcity: 'bg-destructive/10 text-destructive border-destructive/20',
    commitment: 'bg-success/10 text-success border-success/20',
    liking: 'bg-secondary/10 text-secondary border-secondary/20',
  };

  return (
    <div className="space-y-1.5 max-h-[240px] overflow-y-auto scrollbar-thin">
      {triggers.slice(0, 4).map((trigger, i) => (
        <div key={i} className="bg-muted/10 rounded-md p-2 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">{trigger.trigger_name}</span>
            <Badge variant="outline" className={cn('text-[9px] py-0 px-1.5', categoryColors[trigger.category] || 'bg-muted/20')}>
              {trigger.category}
            </Badge>
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">{trigger.description}</p>
          {trigger.examples?.[0] && (
            <p className="text-[10px] text-primary/70 mt-1 italic">Ex: "{trigger.examples[0]}"</p>
          )}
        </div>
      ))}
      {triggers.length > 4 && (
        <p className="text-[10px] text-muted-foreground text-center py-1">+{triggers.length - 4} gatilhos adicionais</p>
      )}
    </div>
  );
}

function RapportSection({ rapport }: { rapport: RapportData }) {
  if (!rapport.suggestions?.length) return null;

  return (
    <div className="space-y-1.5">
      {rapport.suggestions.map((suggestion, i) => (
        <div key={i} className="flex items-start gap-2 bg-success/5 border border-success/10 rounded-md p-2">
          <Heart className="w-3 h-3 text-success mt-0.5 shrink-0" />
          <span className="text-xs text-foreground">{suggestion}</span>
        </div>
      ))}
    </div>
  );
}

function BestTimesSection({ times }: { times: BestTime[] }) {
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  if (!times.length) {
    return (
      <div className="bg-muted/10 rounded-md p-2 text-xs text-muted-foreground">
        <p>Sem dados suficientes. Sugestão: Seg–Sex entre 9h e 11h costuma ter melhor resposta.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {times.map((t, i) => (
        <div key={i} className="bg-muted/20 rounded-md px-2 py-1 text-center">
          <p className="text-[10px] text-muted-foreground">{dayNames[t.day_of_week] || '?'}</p>
          <p className="text-xs font-medium">{t.hour}h</p>
          {t.success_rate != null && t.success_rate > 0 && (
            <p className="text-[9px] text-success">{t.success_rate}%</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ChurnAlert({ churn }: { churn: ChurnData }) {
  const levelColors: Record<string, string> = {
    high: 'bg-destructive/10 border-destructive/20 text-destructive',
    medium: 'bg-warning/10 border-warning/20 text-warning',
    low: 'bg-success/10 border-success/20 text-success',
  };

  return (
    <div className={cn('rounded-lg p-2.5 border', levelColors[churn.risk_level] || 'bg-muted/10')}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <TrendingDown className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Risco de churn</span>
        </div>
        <span className="text-xs font-bold">{Math.round(churn.churn_probability)}%</span>
      </div>
      {churn.recommended_actions && churn.recommended_actions.length > 0 && (
        <p className="text-[10px] opacity-80 mt-1">
          {churn.recommended_actions[0]}
        </p>
      )}
    </div>
  );
}

function DISCSection({ disc }: { disc: DISCTips }) {
  const profileColors: Record<string, string> = {
    D: 'bg-destructive/10 text-destructive',
    I: 'bg-warning/10 text-warning',
    S: 'bg-success/10 text-success',
    C: 'bg-info/10 text-info',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge className={cn('text-xs', profileColors[disc.profile] || 'bg-muted')}>
          {disc.profile} — {disc.name}
        </Badge>
      </div>

      {disc.communication_tips && disc.communication_tips.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground font-medium uppercase">Como comunicar:</p>
          {disc.communication_tips.slice(0, 3).map((tip, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px]">
              <ThumbsUp className="w-3 h-3 text-success mt-0.5 shrink-0" />
              <span>{tip}</span>
            </div>
          ))}
        </div>
      )}

      {disc.keywords_to_use && disc.keywords_to_use.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-muted-foreground mr-1">Usar:</span>
          {disc.keywords_to_use.slice(0, 6).map((kw, i) => (
            <Badge key={i} variant="outline" className="text-[9px] py-0 px-1 bg-success/5 text-success border-success/20">
              {kw}
            </Badge>
          ))}
        </div>
      )}

      {disc.keywords_to_avoid && disc.keywords_to_avoid.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-muted-foreground mr-1">Evitar:</span>
          {disc.keywords_to_avoid.slice(0, 6).map((kw, i) => (
            <Badge key={i} variant="outline" className="text-[9px] py-0 px-1 bg-destructive/5 text-destructive border-destructive/20">
              {kw}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ========================
// Main Component
// ========================

function ContactIntelligencePanelInner({ contactId }: ContactIntelligencePanelProps) {
  const { data, isLoading } = useContactIntelligence(contactId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-24" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (!data?.found) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Briefing */}
      <div className="space-y-1.5">
        <h5 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-primary" />
          Briefing pré-contato
        </h5>
        <BriefingCard briefing={data.briefing} />
      </div>

      {/* DISC Tips */}
      {data.disc_tips && (
        <div className="space-y-1.5">
          <h5 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-primary" />
            Perfil DISC — comunicação
          </h5>
          <DISCSection disc={data.disc_tips} />
        </div>
      )}

      {/* Triggers */}
      {data.triggers.length > 0 && (
        <div className="space-y-1.5">
          <h5 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-primary" />
            Gatilhos mentais sugeridos
          </h5>
          <TriggersSection triggers={data.triggers} />
        </div>
      )}

      {/* Rapport */}
      {data.rapport.suggestions && data.rapport.suggestions.length > 0 && (
        <div className="space-y-1.5">
          <h5 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-primary" />
            Rapport
          </h5>
          <RapportSection rapport={data.rapport} />
        </div>
      )}

      {/* Best times */}
      <div className="space-y-1.5">
        <h5 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-primary" />
          Melhores horários
        </h5>
        <BestTimesSection times={data.best_times} />
      </div>

      {/* Churn */}
      {data.churn && (
        <div className="space-y-1.5">
          <h5 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" />
            Risco de perda
          </h5>
          <ChurnAlert churn={data.churn} />
        </div>
      )}
    </motion.div>
  );
}

export const ContactIntelligencePanel = memo(ContactIntelligencePanelInner);
