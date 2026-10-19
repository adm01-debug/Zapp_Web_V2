import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { fmtTime } from '../talkxShared';
import { TalkXQueryBoundary, TalkXSkeletonRows } from '../kit/states';
import {
  TIMELINE_PREVIEW_SIZE, useTalkXCampaignTimeline, type TalkXTimelineItem,
} from '@/hooks/integrations/useTalkXCampaignTimeline';
import { describeTimelineEvent, timelineKindOptions } from './talkxTimelineCopy';

/**
 * X152 — "Linha do Tempo Operacional" lida do servidor.
 *
 * Antes: a aba do Monitor (`TalkXLiveMonitor`) pintava um ponto colorido para 4 tipos e
 * escrevia o tipo cru do banco quando o evento não tinha mensagem ("resumed"), com 50
 * eventos fixos e sem "Ver todos".
 *
 * Agora: cada item sai do mapa `talkxTimelineCopy` (ícone, cor, título e frase em
 * português), o horário HH:mm fica à esquerda, o card mostra os 5 últimos e "Ver todos"
 * abre o painel lateral com o filtro por tipo e a página seguinte pelo cursor.
 *
 * @param campaignId a linha do tempo é por campanha: qualquer tela que abra uma
 * campanha usa este componente passando o id.
 */

const KINDS = timelineKindOptions();

function TimelineRow({ item }: { item: TalkXTimelineItem }) {
  const description = describeTimelineEvent(item);
  const Icon = description.icon;
  return (
    <li className="flex items-start gap-3">
      <span className="w-10 shrink-0 pt-1 text-2xs font-medium tabular-nums text-muted-foreground">{fmtTime(item.at)}</span>
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-input/30',
          description.tone,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 pb-3">
        <p className="text-xs font-semibold text-foreground">{description.title}</p>
        {description.detail && (
          <p className="mt-0.5 break-words text-2xs leading-relaxed text-foreground-secondary">{description.detail}</p>
        )}
      </div>
    </li>
  );
}

export function TalkXOperationalTimeline({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('all');

  // O painel tem o próprio filtro: enquanto ele não é aberto, não consulta nada.
  const card = useTalkXCampaignTimeline(campaignId);
  const panel = useTalkXCampaignTimeline(campaignId, {
    kinds: kind === 'all' ? [] : [kind],
    enabled: open,
  });

  const preview = card.items.slice(0, TIMELINE_PREVIEW_SIZE);

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[15px] font-bold text-foreground">Linha do Tempo Operacional</p>
        {card.items.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-2xs font-semibold text-[hsl(var(--primary-text))] hover:text-primary"
          >
            Ver todos
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <TalkXQueryBoundary
        query={{ isLoading: card.isLoading, isFetching: card.isFetching, isError: card.isError, error: card.error }}
        entity="atividades da campanha"
        onRetry={() => { void card.refetch(); }}
        skeleton={<TalkXSkeletonRows rows={3} />}
        isEmpty={card.items.length === 0}
        empty={<p className="text-xs text-muted-foreground">Nenhum evento registrado ainda.</p>}
      >
        <ul>
          {preview.map((item) => <TimelineRow key={item.id} item={item} />)}
        </ul>
        {card.items.length > TIMELINE_PREVIEW_SIZE && (
          <p className="border-t border-border/40 pt-2 text-2xs text-muted-foreground">
            Mostrando os {TIMELINE_PREVIEW_SIZE} últimos de {card.items.length}
            {card.hasMore ? ' carregados' : ''}.
          </p>
        )}
      </TalkXQueryBoundary>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="space-y-3 border-b border-border/60 px-4 py-3 text-left">
            <SheetTitle className="text-[15px]">Linha do Tempo Operacional</SheetTitle>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-8 w-full bg-input/40 text-xs">
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {KINDS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <TalkXQueryBoundary
              query={{ isLoading: panel.isLoading, isFetching: panel.isFetching, isError: panel.isError, error: panel.error }}
              entity="atividades da campanha"
              onRetry={() => { void panel.refetch(); }}
              skeleton={<TalkXSkeletonRows rows={5} />}
              isEmpty={panel.items.length === 0}
              empty={<p className="text-xs text-muted-foreground">Nenhum evento deste tipo.</p>}
            >
              <ul>
                {panel.items.map((item) => <TimelineRow key={item.id} item={item} />)}
              </ul>
              {panel.hasMore && (
                <button
                  type="button"
                  onClick={panel.loadMore}
                  disabled={panel.isLoadingMore}
                  className="mt-1 h-9 w-full rounded-lg border border-border/70 bg-input/40 text-xs font-semibold text-foreground-secondary hover:bg-muted/40 disabled:opacity-60"
                >
                  {panel.isLoadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              )}
            </TalkXQueryBoundary>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
