import { useMemo, useState, lazy, Suspense } from 'react';
import {
  Calendar, BarChart3, MessageSquare, Circle, Building2, Target, ShoppingBag,
  FileText, Zap, TrendingUp, History as HistoryIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatBRL, formatRelativeTime } from '@/lib/formatters';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { useContactCrm360, useContactLeadScore, useAdvanceDealStage } from '@/hooks/crm/useContactCrm360';
import { useNextBestAction } from '@/hooks/chat/useNextBestAction';
import { useConversationTasks } from '@/hooks/chat/useConversationTasks';
import type { Conversation, Message } from '@/types/chat';
import type { ConversationTab } from '../chat/ConversationTabs';
import { KpiStrip } from './KpiStrip';
import { SectionCard } from './SectionCard';
import { OpenDealsList } from './OpenDealsList';
import { EmptyState } from '@/components/ui/empty-state';

const EditContactDialog = lazy(() =>
  import('../contact-details/EditContactDialog').then((m) => ({ default: m.EditContactDialog })));

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberta', waiting: 'Aguardando', resolved: 'Resolvida', archived: 'Arquivada',
};

const PURCHASE_STATUS_PILL: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-warning/15 text-warning border-warning/30' },
  approved: { label: 'Aprovado', className: 'bg-success/15 text-success border-success/30' },
  completed: { label: 'Concluído', className: 'bg-primary/15 text-primary border-primary/30' },
  cancelled: { label: 'Cancelado', className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

interface Crm360TabProps {
  conversation: Conversation;
  messages: Message[];
  onTabChange: (tab: ConversationTab) => void;
}

export function Crm360Tab({ conversation, messages, onTabChange }: Crm360TabProps) {
  const contactId = conversation.contact.id;
  const contactName = conversation.contact.name;
  const [editOpen, setEditOpen] = useState(false);

  const { data: crm360 } = useContactCrm360(contactId);
  const { actions: nextActions } = useNextBestAction(contactId, contactName);
  const { createTask } = useConversationTasks(contactId);
  const { data: extra } = useContactLeadScore(contactId);
  const advanceStage = useAdvanceDealStage(contactId);

  const lastInteractionAt = useMemo(() => {
    if (messages.length === 0) return null;
    return messages.reduce((max, m) => (m.timestamp.getTime() > max.getTime() ? m.timestamp : max), messages[0].timestamp);
  }, [messages]);

  const leadScore = extra?.lead_score ?? null;
  const leadScoreLabel = leadScore == null ? 'Sem score' : leadScore >= 80 ? 'Alto potencial' : leadScore >= 50 ? 'Médio' : 'Baixo';

  const nextStage = useMemo(() => {
    if (!crm360?.currentDeal || !crm360.currentStage) return null;
    const sorted = crm360.stages;
    const idx = sorted.findIndex((s) => s.id === crm360.currentStage!.id);
    return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
  }, [crm360]);

  const pipelineTotal = crm360
    ? crm360.pipeline.propostas.total + crm360.pipeline.negociacao.total + crm360.pipeline.ganhos.total
    : 0;

  return (
    <div className="flex flex-col gap-4" data-testid="crm360-tab">
      <KpiStrip
        cells={[
          { icon: Calendar, label: 'Cliente desde', value: conversation.contact.created_at ? format(new Date(conversation.contact.created_at), 'dd MMM yyyy', { locale: ptBR }) : '—', tone: 'blue' },
          { icon: BarChart3, label: 'Lead score', value: leadScore ?? '—', tone: 'green', sublabel: leadScore != null ? leadScoreLabel : undefined },
          { icon: MessageSquare, label: 'Última interação', value: lastInteractionAt ? formatRelativeTime(lastInteractionAt) : '—', tone: 'blue' },
          { icon: Circle, label: 'Status', value: STATUS_LABEL[conversation.contact.conversation_status ?? ''] ?? '—', tone: 'green' },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard
          icon={Building2}
          title="Empresa"
          action={{ label: conversation.contact.company ? 'Editar' : 'Adicionar empresa', onClick: () => setEditOpen(true) }}
        >
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{conversation.contact.company || 'Sem empresa'}</p>
              {conversation.contact.job_title && (
                <p className="text-xs text-muted-foreground truncate">{conversation.contact.job_title}</p>
              )}
            </div>
          </div>
          {editOpen && (
            <Suspense fallback={null}>
              <EditContactDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                contact={{
                  id: conversation.contact.id,
                  name: conversation.contact.name,
                  phone: conversation.contact.phone,
                  avatar: conversation.contact.avatar ?? undefined,
                  email: conversation.contact.email ?? undefined,
                  nickname: conversation.contact.nickname ?? undefined,
                  job_title: conversation.contact.job_title ?? undefined,
                  company: conversation.contact.company ?? undefined,
                  contact_type: conversation.contact.contact_type,
                }}
              />
            </Suspense>
          )}
        </SectionCard>

        <SectionCard icon={Target} title="Etapa no funil" action={{ label: 'Ver funil →', onClick: () => navigateToView('pipeline') }}>
          {crm360?.currentDeal ? (
            <>
              <ol className="flex items-center gap-1 overflow-x-auto">
                {crm360.stages.map((stage, i) => {
                  const active = stage.id === crm360.currentStage?.id;
                  const passed = crm360.currentStage ? stage.position <= crm360.currentStage.position : false;
                  return (
                    <li key={stage.id} className="flex items-center gap-1 shrink-0">
                      {i > 0 && <span className="w-4 h-px bg-border" />}
                      <span
                        className={cn(
                          'h-7 px-2.5 rounded-full text-[11px] font-medium border whitespace-nowrap',
                          active ? 'bg-primary text-primary-foreground border-primary' : passed ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted/40 text-muted-foreground border-border'
                        )}
                      >
                        {stage.name}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Última atualização: {crm360.currentDeal.updated_at ? formatRelativeTime(crm360.currentDeal.updated_at) : '—'}</span>
                {nextStage && (
                  <button
                    type="button"
                    className="text-primary font-medium hover:underline disabled:opacity-50"
                    disabled={advanceStage.isPending}
                    onClick={() => advanceStage.mutate({ dealId: crm360.currentDeal!.id, nextStageId: nextStage.id, nextStageName: nextStage.name })}
                  >
                    Avançar etapa →
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              <ol className="flex items-center gap-1 opacity-50">
                {(crm360?.stages ?? []).map((stage, i) => (
                  <li key={stage.id} className="flex items-center gap-1 shrink-0">
                    {i > 0 && <span className="w-4 h-px bg-border" />}
                    <span className="h-7 px-2.5 rounded-full text-[11px] font-medium border bg-muted/40 text-muted-foreground border-border whitespace-nowrap">{stage.name}</span>
                  </li>
                ))}
              </ol>
              <p className="text-sm text-muted-foreground">Nenhuma negociação aberta</p>
              <button type="button" onClick={() => navigateToView('pipeline')} className="h-8 px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25">
                Criar negociação
              </button>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={ShoppingBag} title="Últimas compras" tone="blue" action={{ label: 'Ver todas →', onClick: () => onTabChange('orders') }}>
          {!crm360 || crm360.purchases.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="Nenhuma compra registrada" description="Compras deste contato aparecerão aqui." size="sm" />
          ) : (
            <ul className="space-y-2">
              {crm360.purchases.slice(0, 3).map((p) => {
                const pill = PURCHASE_STATUS_PILL[p.status ?? ''] ?? PURCHASE_STATUS_PILL.pending;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground">{p.purchased_at ? format(new Date(p.purchased_at), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.amount != null && <span className="text-sm font-semibold tabular-nums">{formatBRL(p.amount)}</span>}
                      <span className={cn('h-6 px-2.5 rounded-full border text-[11px] font-semibold inline-flex items-center', pill.className)}>{pill.label}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={FileText} title="Propostas em aberto" tone="blue">
          <OpenDealsList deals={crm360?.openDeals ?? []} limit={3} />
        </SectionCard>

        <SectionCard icon={BarChart3} title="Ticket médio" tone="green">
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold tabular-nums">{crm360?.ticketMedio != null ? formatBRL(crm360.ticketMedio) : '—'}</p>
            {crm360?.ticketDeltaPct != null && (
              <span className={cn('h-6 px-2 rounded-full text-[11px] font-semibold inline-flex items-center', crm360.ticketDeltaPct >= 0 ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive')}>
                {crm360.ticketDeltaPct >= 0 ? '+' : ''}{crm360.ticketDeltaPct.toFixed(0)}%
              </span>
            )}
          </div>
        </SectionCard>

        <SectionCard icon={Target} title="Produtos de interesse">
          {!crm360 || crm360.interesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum interesse marcado</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {crm360.interesses.map((tag) => (
                <span key={tag} className="h-6 px-2.5 rounded-full bg-primary/15 text-primary border border-primary/30 text-[11px] font-semibold inline-flex items-center">{tag}</span>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Zap} title="Próxima melhor ação" tone="purple">
          {nextActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem ações sugeridas</p>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-primary/10 border border-primary/30 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{nextActions[0].label}</p>
                <p className="text-xs text-muted-foreground truncate">{nextActions[0].description}</p>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline shrink-0"
                onClick={() => createTask({ title: nextActions[0].label })}
              >
                Criar tarefa →
              </button>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={TrendingUp} title="Pipeline comercial" tone="blue" action={{ label: 'Ver pipeline →', onClick: () => navigateToView('pipeline') }}>
          {!crm360 || pipelineTotal === 0 ? (
            <p className="text-sm text-muted-foreground">Sem negociações</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="h-2.5 rounded-full overflow-hidden flex bg-muted/40">
                <div className="bg-primary h-full" style={{ width: `${(crm360.pipeline.propostas.total / pipelineTotal) * 100}%` }} />
                <div className="bg-warning h-full" style={{ width: `${(crm360.pipeline.negociacao.total / pipelineTotal) * 100}%` }} />
                <div className="bg-success h-full" style={{ width: `${(crm360.pipeline.ganhos.total / pipelineTotal) * 100}%` }} />
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" />Propostas {crm360.pipeline.propostas.count} · {((crm360.pipeline.propostas.total / pipelineTotal) * 100).toFixed(0)}%</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" />Negociação {crm360.pipeline.negociacao.count} · {((crm360.pipeline.negociacao.total / pipelineTotal) * 100).toFixed(0)}%</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" />Ganhos {crm360.pipeline.ganhos.count} · {((crm360.pipeline.ganhos.total / pipelineTotal) * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard icon={HistoryIcon} title="Últimas interações comerciais" action={{ label: 'Ver histórico →', onClick: () => onTabChange('history') }} className="xl:col-span-2">
          {!crm360 || crm360.interacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma interação comercial</p>
          ) : (
            <ul className="space-y-2">
              {crm360.interacoes.map((it) => (
                <li key={it.id} className="flex items-center gap-3">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', {
                    primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', muted: 'bg-muted-foreground',
                  }[it.color])} />
                  <span className="text-xs text-muted-foreground shrink-0 w-24">{format(new Date(it.at), 'dd MMM, HH:mm', { locale: ptBR })}</span>
                  <span className="text-sm truncate">{it.text}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
