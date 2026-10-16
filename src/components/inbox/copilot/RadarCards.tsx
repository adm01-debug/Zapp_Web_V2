/**
 * CV-053 — Cartões do painel RADAR.
 * Cada cartão é recolhível. Reaproveitam componentes existentes.
 */
import React from 'react';
import { ChevronDown, ChevronRight, Zap, MapPin, MessageSquare, AlertCircle, Package, User, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RadarCardId } from '@/hooks/copilot/useRadarPanel';
import type { CopilotSessionState } from '@/hooks/copilot/useCopilotSession';
import type { LiveSuggestion } from '@/hooks/copilot/useLiveSuggestions';

// ─── Card base ────────────────────────────────────────────────
interface CardProps {
  id: RadarCardId;
  title: string;
  icon: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

function CardBase({ id, title, icon, collapsed, onToggle, children, badge }: CardProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/80 text-sm" role="region" aria-labelledby={`radar-card-${id}`}>
      <button
        id={`radar-card-${id}`}
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left hover:bg-muted/30 transition-colors rounded-t-lg"
        aria-expanded={!collapsed}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        {badge}
        {collapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
      </button>
      {!collapsed && <div className="px-2.5 pb-2.5">{children}</div>}
    </div>
  );
}

// ─── Stage card ───────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  E1: 'Recepção', E2: 'Descoberta', E3: 'Proposta', E4: 'Negociação', E5: 'Fechamento', E6: 'Pós-venda',
};
const STAGE_COLORS: Record<string, string> = {
  E1: 'bg-slate-400', E2: 'bg-blue-400', E3: 'bg-indigo-400', E4: 'bg-amber-400', E5: 'bg-green-400', E6: 'bg-emerald-500',
};

interface StageCardProps {
  stage: CopilotSessionState['stage'] | null;
  temperature: number | null;
  collapsed: boolean;
  onToggle: () => void;
}

export function StageCard({ stage, temperature, collapsed, onToggle }: StageCardProps) {
  const label = stage ? STAGE_LABELS[stage] ?? stage : 'Aguardando...';
  const badge = stage ? (
    <span className={cn('ml-auto mr-1 h-1.5 w-1.5 rounded-full shrink-0', STAGE_COLORS[stage] ?? 'bg-muted')} />
  ) : null;

  return (
    <CardBase id="stage" title="Etapa da venda" icon={<MapPin className="h-3.5 w-3.5" />} collapsed={collapsed} onToggle={onToggle} badge={badge}>
      <div className="flex items-center gap-2 pt-1">
        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold text-white', stage ? STAGE_COLORS[stage] : 'bg-muted')}>
          {stage ?? '—'}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
        {temperature != null && (
          <span className={cn('ml-auto text-[11px] font-semibold', temperature >= 70 ? 'text-green-500' : temperature >= 40 ? 'text-amber-500' : 'text-muted-foreground')}>
            {temperature}°
          </span>
        )}
      </div>
    </CardBase>
  );
}

// ─── BRINDE card ──────────────────────────────────────────────
const BRINDE_LETTERS = ['B', 'R', 'I', 'N', 'D', 'E'] as const;
const BRINDE_LABELS: Record<string, string> = {
  B: 'Budget', R: 'Responsável', I: 'Intenção', N: 'Número', D: 'Data', E: 'Entrega',
};

interface BrindeCardProps {
  brindeState: CopilotSessionState['brinde_state'] | null;
  collapsed: boolean;
  onToggle: () => void;
}

export function BrindeCard({ brindeState, collapsed, onToggle }: BrindeCardProps) {
  const filled = brindeState ? BRINDE_LETTERS.filter((l) => brindeState[l]) : [];
  const badge = (
    <span className="ml-auto mr-1 text-[10px] text-muted-foreground">{filled.length}/6</span>
  );

  return (
    <CardBase id="brinde" title="B·R·I·N·D·E" icon={<Zap className="h-3.5 w-3.5" />} collapsed={collapsed} onToggle={onToggle} badge={badge}>
      <div className="mt-1 space-y-1">
        {BRINDE_LETTERS.map((letter) => {
          const value = brindeState?.[letter];
          return (
            <div key={letter} className="flex items-start gap-2 text-[11px]">
              <span className={cn('shrink-0 w-4 font-bold', value ? 'text-primary' : 'text-muted-foreground/40')}>{letter}</span>
              <span className="text-[10px] text-muted-foreground shrink-0 w-16">{BRINDE_LABELS[letter]}</span>
              {value ? (
                <span className="text-xs leading-tight flex-1 line-clamp-2">{value}</span>
              ) : (
                <span className="text-[10px] text-muted-foreground/50 italic">não preenchido</span>
              )}
            </div>
          );
        })}
      </div>
    </CardBase>
  );
}

// ─── Suggestions card (mini) ──────────────────────────────────
interface SuggestionsCardProps {
  suggestions: LiveSuggestion[];
  loading: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onUse: (text: string) => void;
}

export function SuggestionsCard({ suggestions, loading, collapsed, onToggle, onUse }: SuggestionsCardProps) {
  const best = suggestions[0];
  const badge = loading ? (
    <span className="ml-auto mr-1 flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
  ) : suggestions.length > 0 ? (
    <span className="ml-auto mr-1 text-[10px] text-primary font-semibold">{suggestions.length}</span>
  ) : null;

  return (
    <CardBase id="suggestions" title="Sugestões" icon={<MessageSquare className="h-3.5 w-3.5" />} collapsed={collapsed} onToggle={onToggle} badge={badge}>
      {loading && suggestions.length === 0 && (
        <p className="pt-1 text-[10px] text-muted-foreground italic">RADAR analisando...</p>
      )}
      {!loading && !best && (
        <p className="pt-1 text-[10px] text-muted-foreground italic">Aguardando momento-chave...</p>
      )}
      {best && (
        <div className="pt-1 space-y-1">
          {suggestions.map((s: LiveSuggestion, i: number) => (
            <div key={s.id} className="flex items-start gap-1.5 rounded bg-muted/40 p-1.5">
              <span className="shrink-0 text-[10px] font-bold text-muted-foreground">{i + 1}.</span>
              <p
                className="flex-1 text-[11px] leading-relaxed line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                onClick={() => onUse(s.text)}
                role="button"
                tabIndex={0}
                aria-label={`Usar sugestão ${i + 1}`}
                onKeyDown={(e) => e.key === 'Enter' && onUse(s.text)}
              >
                {s.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </CardBase>
  );
}

// ─── Next step card ───────────────────────────────────────────
interface NextStepCardProps {
  nextStep: string | null;
  collapsed: boolean;
  onToggle: () => void;
}

export function NextStepCard({ nextStep, collapsed, onToggle }: NextStepCardProps) {
  return (
    <CardBase id="next_step" title="Próximo passo" icon={<ArrowRight className="h-3.5 w-3.5" />} collapsed={collapsed} onToggle={onToggle}>
      {nextStep ? (
        <p className="pt-1 text-xs leading-relaxed">{nextStep}</p>
      ) : (
        <p className="pt-1 text-[10px] text-muted-foreground italic">Aguardando análise...</p>
      )}
    </CardBase>
  );
}

// ─── Alerts card ─────────────────────────────────────────────
interface AlertsCardProps {
  alerts: string[];
  collapsed: boolean;
  onToggle: () => void;
}

export function AlertsCard({ alerts, collapsed, onToggle }: AlertsCardProps) {
  const badge = alerts.length > 0 ? (
    <span className="ml-auto mr-1 rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">{alerts.length}</span>
  ) : null;

  return (
    <CardBase id="alerts" title="Alertas" icon={<AlertCircle className="h-3.5 w-3.5" />} collapsed={collapsed} onToggle={onToggle} badge={badge}>
      {alerts.length === 0 ? (
        <p className="pt-1 text-[10px] text-muted-foreground italic">Sem alertas ativos.</p>
      ) : (
        <ul className="pt-1 space-y-1">
          {alerts.map((a: string, i: number) => (
            <li key={i} className="flex items-start gap-1.5 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              {a}
            </li>
          ))}
        </ul>
      )}
    </CardBase>
  );
}

// ─── Products card ────────────────────────────────────────────
interface ProductsCardProps {
  products: string[];
  collapsed: boolean;
  onToggle: () => void;
}

export function ProductsCard({ products, collapsed, onToggle }: ProductsCardProps) {
  return (
    <CardBase id="products" title="Produtos sugeridos" icon={<Package className="h-3.5 w-3.5" />} collapsed={collapsed} onToggle={onToggle}>
      {products.length === 0 ? (
        <p className="pt-1 text-[10px] text-muted-foreground italic">Aguardando análise de produto...</p>
      ) : (
        <ul className="pt-1 space-y-0.5">
          {products.map((p: string, i: number) => (
            <li key={i} className="rounded bg-muted/40 px-2 py-1 text-[11px]">{p}</li>
          ))}
        </ul>
      )}
    </CardBase>
  );
}

// ─── Decision maker card ──────────────────────────────────────
interface DecisionMakerCardProps {
  decisionRole: string | null;
  stakeholders: CopilotSessionState['stakeholders'];
  collapsed: boolean;
  onToggle: () => void;
}

export function DecisionMakerCard({ decisionRole, stakeholders, collapsed, onToggle }: DecisionMakerCardProps) {
  return (
    <CardBase id="decision_maker" title="Quem decide" icon={<User className="h-3.5 w-3.5" />} collapsed={collapsed} onToggle={onToggle}>
      {!decisionRole && (!stakeholders || stakeholders.length === 0) ? (
        <p className="pt-1 text-[10px] text-muted-foreground italic">Não identificado ainda.</p>
      ) : (
        <div className="pt-1 space-y-1">
          {decisionRole && (
            <p className="text-[11px]">Papel: <span className="font-semibold">{decisionRole}</span></p>
          )}
          {stakeholders?.map((s: { name: string; role?: string }, i: number) => (
            <div key={i} className="rounded bg-muted/40 px-2 py-1 text-[11px]">
              <span className="font-medium">{s.name}</span>
              {s.role && <span className="text-muted-foreground"> · {s.role}</span>}
            </div>
          ))}
        </div>
      )}
    </CardBase>
  );
}
