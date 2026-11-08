import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Megaphone, Users, FileText } from 'lucide-react';
import React from 'react';
import type { CommandItem } from '@/components/ui/command-palette-data';
import { supabase } from '@/integrations/supabase/client';
import { replaceTalkXOpenRoute, replaceTalkXRoute, replaceTalkXTabRoute } from '@/components/talkx/talkxRoute';

interface TalkXCampaignSlim { id: string; name: string; status: string }
interface TalkXSegment { id: string; name: string }
interface TalkXTemplate { id: string; name: string }

// Chaves canônicas de CAMPAIGN_STATUS (kit/constants.ts) — `sending`, não `running`
const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho', scheduled: 'Agendada', sending: 'Em andamento',
  paused: 'Pausada', completed: 'Concluída', cancelled: 'Cancelada',
};

/**
 * Grava o endereço do item (campanha, segmento ou template) ANTES de trocar de
 * módulo: o TalkXView lê a URL ao montar (e o TalkXSegments/X094 leem o id do
 * endereço), então o item certo abre direto, sem passar pela Visão geral. Com o
 * módulo já aberto, o popstate faz o TalkXView reler o endereço.
 */
function openTalkXItem(onNavigate: ((view: string) => void) | undefined, route: () => void) {
  const jaNoTalkX = new URLSearchParams(window.location.search).get('view') === 'talkx';
  route();
  onNavigate?.('talkx');
  if (jaNoTalkX) window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useTalkXCommandItems(onNavigate?: (view: string) => void, open?: boolean): CommandItem[] {
  const enabled = !!open;

  const campaignsQuery = useQuery({
    queryKey: ['talkx-campaigns-palette'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_campaigns')
        .select('id, name, status')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as TalkXCampaignSlim[];
    },
    enabled,
    staleTime: 60_000,
  });

  const segmentsQuery = useQuery({
    queryKey: ['talkx-segments-palette'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_segments')
        .select('id, name')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as TalkXSegment[];
    },
    enabled,
    staleTime: 60_000,
  });

  const templatesQuery = useQuery({
    queryKey: ['talkx-templates-palette'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_templates')
        .select('id, name')
        .order('use_count', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as TalkXTemplate[];
    },
    enabled,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const campaigns = (campaignsQuery.data as TalkXCampaignSlim[] | undefined) ?? [];
    const segments = (segmentsQuery.data as TalkXSegment[] | undefined) ?? [];
    const templates = (templatesQuery.data as TalkXTemplate[] | undefined) ?? [];

    const campaignItems: CommandItem[] = campaigns.map((c) => ({
      id: `talkx-campaign-${c.id}`,
      title: c.name,
      description: STATUS_LABEL[c.status] ?? c.status,
      icon: React.createElement(Megaphone, { className: 'h-4 w-4' }),
      category: 'talkx' as const,
      keywords: ['campanha', 'talkx', 'disparos', c.status],
      badge: STATUS_LABEL[c.status],
      action: () => openTalkXItem(onNavigate, () => {
        replaceTalkXRoute({ campaignId: c.id });
        // Anti-regressão do consumidor acima: ?segment=/?template= obsoletos não
        // podem sobreviver à abertura de uma campanha, senão o TalkXView os leria
        // como pedido de aba na próxima navegação por tab.
        const url = new URL(window.location.href);
        url.searchParams.delete('segment');
        url.searchParams.delete('mode');
        url.searchParams.delete('template');
        url.searchParams.delete('ttab');
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      }),
    }));

    const segmentItems: CommandItem[] = segments.map((s) => ({
      id: `talkx-segment-${s.id}`,
      title: s.name,
      description: 'Segmento Talk X',
      icon: React.createElement(Users, { className: 'h-4 w-4' }),
      category: 'talkx' as const,
      keywords: ['segmento', 'talkx', 'público'],
      action: () => openTalkXItem(onNavigate, () => {
        replaceTalkXOpenRoute({ kind: 'segment', id: s.id });
        replaceTalkXTabRoute({ tab: 'segments' });
        // O id de template (e a sub-aba do editor) não sobrevivem à troca de item.
        const url = new URL(window.location.href);
        url.searchParams.delete('template');
        url.searchParams.delete('ttab');
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
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
        replaceTalkXOpenRoute({ kind: 'template', id: t.id });
        replaceTalkXTabRoute({ tab: 'templates' });
        // O id de segmento (e o modo do construtor) não sobrevivem à troca de item.
        const url = new URL(window.location.href);
        url.searchParams.delete('segment');
        url.searchParams.delete('mode');
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      }),
    }));

    return [...campaignItems, ...segmentItems, ...templateItems];
  }, [campaignsQuery.data, segmentsQuery.data, templatesQuery.data, onNavigate]);
}
