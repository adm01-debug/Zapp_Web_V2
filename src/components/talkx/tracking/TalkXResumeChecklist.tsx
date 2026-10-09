/**
 * TL-162 (X159) — "Checklist para retomar" (campanha pausada, tela 13).
 *
 * Renderiza os 5 itens que o operador confere antes de retomar: 1 e 5 são
 * conferência manual (checkbox que persiste, CAP-056); 2, 3 e 4 o sistema já
 * verificou e o item mostra o selo. Cada item tem o atalho para onde se resolve.
 */
import { ClipboardCheck, ExternalLink } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Pill } from '@/components/dashboard/overview/DashboardCard';
import { RailCard } from '../kit/rail';
import type { PillTone } from '../kit/constants';
import type {
  TalkXResumeChecklistItem,
  TalkXResumeChecklistItemKey,
} from '@/hooks/integrations/useTalkXResumeChecklist';

/** Para onde cada item manda quem vai resolver. */
const CHECKLIST_LINK_LABEL: Record<TalkXResumeChecklistItemKey, string> = {
  segments: 'Ver segmentos',
  templates: 'Ver template',
  limits: 'Ver limites',
  schedule: 'Ver agendamentos',
  autoresponse: 'Ver configurações',
};

function badgeFor(item: TalkXResumeChecklistItem): { label: string; tone: PillTone } {
  if (item.verification === 'manual') {
    return item.status === 'done'
      ? { label: 'Conferido', tone: 'success' }
      : { label: 'Pendente', tone: 'muted' };
  }
  if (item.status === 'attention') return { label: 'Atenção', tone: 'warning' };
  if (item.status === 'ok') return { label: 'Verificado agora', tone: 'success' };
  return { label: 'Não verificado', tone: 'muted' };
}

export interface TalkXResumeChecklistProps {
  items: TalkXResumeChecklistItem[];
  onToggle?: (key: TalkXResumeChecklistItemKey, checked: boolean) => void;
  onNavigate?: (key: TalkXResumeChecklistItemKey) => void;
  disabled?: boolean;
  className?: string;
}

export function TalkXResumeChecklist({
  items,
  onToggle,
  onNavigate,
  disabled = false,
  className,
}: TalkXResumeChecklistProps) {
  const conferidos = items.filter((item) => item.status === 'ok' || item.status === 'done').length;

  return (
    <RailCard
      icon={ClipboardCheck}
      color="amber"
      title="Checklist para retomar"
      subtitle="O que conferir antes de retomar a campanha"
      className={className}
      right={<Pill label={`${conferidos} de ${items.length}`} tone={conferidos === items.length ? 'success' : 'warning'} />}
    >
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => {
          const badge = badgeFor(item);
          const titleId = `talkx-resume-checklist-${item.key}-titulo`;
          return (
            <li
              key={item.key}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-input/20 p-3"
            >
              {item.verification === 'manual' ? (
                <Checkbox
                  id={`talkx-resume-checklist-${item.key}`}
                  checked={item.status === 'done'}
                  disabled={disabled}
                  onCheckedChange={(value) => onToggle?.(item.key, value === true)}
                  aria-labelledby={titleId}
                  className="mt-0.5"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${item.status === 'attention' ? 'bg-warning' : item.status === 'ok' ? 'bg-success' : 'bg-muted-foreground'}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <p id={titleId} className="text-xs font-semibold text-foreground leading-snug">{item.title}</p>
                <p className="text-2xs text-foreground-secondary leading-snug mt-0.5">{item.subtitle}</p>
              </div>
              <Pill label={badge.label} tone={badge.tone} className="shrink-0" />
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  aria-label={`${CHECKLIST_LINK_LABEL[item.key]} — ${item.title}`}
                  className="talkx-glow-ring shrink-0 inline-flex items-center gap-1 text-2xs font-semibold text-primary hover:underline mt-0.5"
                >
                  {CHECKLIST_LINK_LABEL[item.key]}
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </RailCard>
  );
}
