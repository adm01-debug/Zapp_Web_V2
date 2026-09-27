import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Megaphone, Users, FileText } from 'lucide-react';
import React from 'react';
import type { CommandItem } from '@/components/ui/command-palette-data';
import type { TalkXCampaign } from './useTalkX';

interface TalkXSegment { id: string; name: string }
interface TalkXTemplate { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho', scheduled: 'Agendada', running: 'Em andamento',
  paused: 'Pausada', completed: 'Concluída', cancelled: 'Cancelada',
};

export function useTalkXCommandItems(): CommandItem[] {
  const queryClient = useQueryClient();

  return useMemo(() => {
    const campaigns = queryClient.getQueryData<TalkXCampaign[]>(['talkx-campaigns']) ?? [];
    const segments = queryClient.getQueryData<TalkXSegment[]>(['talkx-segments']) ?? [];
    const templates = queryClient.getQueryData<TalkXTemplate[]>(['talkx-templates']) ?? [];

    const campaignItems: CommandItem[] = campaigns.slice(0, 8).map((c) => ({
      id: `talkx-campaign-${c.id}`,
      title: c.name,
      description: STATUS_LABEL[c.status] ?? c.status,
      icon: React.createElement(Megaphone, { className: 'h-4 w-4' }),
      category: 'talkx' as const,
      keywords: ['campanha', 'talkx', 'disparos', c.status],
      badge: STATUS_LABEL[c.status],
    }));

    const segmentItems: CommandItem[] = segments.slice(0, 4).map((s) => ({
      id: `talkx-segment-${s.id}`,
      title: s.name,
      description: 'Segmento Talk X',
      icon: React.createElement(Users, { className: 'h-4 w-4' }),
      category: 'talkx' as const,
      keywords: ['segmento', 'talkx', 'público'],
    }));

    const templateItems: CommandItem[] = templates.slice(0, 4).map((t) => ({
      id: `talkx-template-${t.id}`,
      title: t.name,
      description: 'Template de mensagem',
      icon: React.createElement(FileText, { className: 'h-4 w-4' }),
      category: 'talkx' as const,
      keywords: ['template', 'talkx', 'mensagem', 'modelo'],
    }));

    return [...campaignItems, ...segmentItems, ...templateItems];
  }, [queryClient]);
}
