import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Megaphone, Users, FileText } from 'lucide-react';
import React from 'react';
import type { CommandItem } from '@/components/ui/command-palette-data';
import type { TalkXCampaign } from './useTalkX';
import { replaceTalkXOpenRoute, replaceTalkXRoute, replaceTalkXTabRoute } from '@/components/talkx/talkxRoute';

interface TalkXSegment { id: string; name: string }
interface TalkXTemplate { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho', scheduled: 'Agendada', running: 'Em andamento',
  paused: 'Pausada', completed: 'Concluída', cancelled: 'Cancelada',
};

/**
 * Grava o endereço do item (campanha → tela da campanha; segmento/template → a aba
 * deles) ANTES de trocar de módulo: o TalkXView lê a URL ao montar, então o item certo
 * abre direto, sem passar pela Visão geral. Com o módulo já aberto, o popstate faz o
 * TalkXView reler o endereço.
 */
function openTalkXItem(onNavigate: ((view: string) => void) | undefined, route: () => void) {
  const jaNoTalkX = new URLSearchParams(window.location.search).get('view') === 'talkx';
  route();
  onNavigate?.('talkx');
  if (jaNoTalkX) window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useTalkXCommandItems(onNavigate?: (view: string) => void): CommandItem[] {
  const queryClient = useQueryClient();

  // Track cache freshness so the memo recomputes when TalkX data loads
  const campaignsUpdatedAt = queryClient.getQueryState(['talkx-campaigns'])?.dataUpdatedAt ?? 0;
  const segmentsUpdatedAt = queryClient.getQueryState(['talkx-segments'])?.dataUpdatedAt ?? 0;
  const templatesUpdatedAt = queryClient.getQueryState(['talkx-templates'])?.dataUpdatedAt ?? 0;

  return useMemo(() => {
    const campaigns = queryClient.getQueryData<TalkXCampaign[]>(['talkx-campaigns']) ?? [];
    const segments = queryClient.getQueryData<TalkXSegment[]>(['talkx-segments']) ?? [];
    const templates = queryClient.getQueryData<TalkXTemplate[]>(['talkx-templates']) ?? [];

    const campaignItems: CommandItem[] = campaigns.map((c) => ({
      id: `talkx-campaign-${c.id}`,
      title: c.name,
      description: STATUS_LABEL[c.status] ?? c.status,
      icon: React.createElement(Megaphone, { className: 'h-4 w-4' }),
      category: 'talkx' as const,
      keywords: ['campanha', 'talkx', 'disparos', c.status],
      badge: STATUS_LABEL[c.status],
      action: () => openTalkXItem(onNavigate, () => replaceTalkXRoute({ campaignId: c.id })),
    }));

    const segmentItems: CommandItem[] = segments.map((s) => ({
      id: `talkx-segment-${s.id}`,
      title: s.name,
      description: 'Segmento Talk X',
      icon: React.createElement(Users, { className: 'h-4 w-4' }),
      category: 'talkx' as const,
      keywords: ['segmento', 'talkx', 'público'],
      action: () => openTalkXItem(onNavigate, () => {
        replaceTalkXOpenRoute(null);
        replaceTalkXTabRoute({ tab: 'segments' });
      }),
    }));

    const templateItems: CommandItem[] = templates.map((t) => ({
      id: `talkx-template-${t.id}`,
      title: t.name,
      description: 'Template de mensagem',
      icon: React.createElement(FileText, { className: 'h-4 w-4' }),
      category: 'talkx' as const,
      keywords: ['template', 'talkx', 'mensagem', 'modelo'],
      action: () => openTalkXItem(onNavigate, () => {
        replaceTalkXOpenRoute(null);
        replaceTalkXTabRoute({ tab: 'templates' });
      }),
    }));

    return [...campaignItems, ...segmentItems, ...templateItems];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, campaignsUpdatedAt, segmentsUpdatedAt, templatesUpdatedAt, onNavigate]);
}
