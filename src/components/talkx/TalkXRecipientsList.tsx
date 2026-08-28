import React from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, SkipForward } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import type { TalkXRecipient } from '@/hooks/integrations/useTalkX';

const STATUS_MAP: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: 'Pendente', icon: Clock, color: 'text-muted-foreground' },
  sending: { label: 'Enviando', icon: Loader2, color: 'text-primary' },
  sent: { label: 'Enviada', icon: CheckCircle2, color: 'text-primary' },
  delivered: { label: 'Entregue', icon: CheckCircle2, color: 'text-accent-foreground' },
  failed: { label: 'Falhou', icon: XCircle, color: 'text-destructive' },
  skipped: { label: 'Pulado', icon: SkipForward, color: 'text-muted-foreground' },
};

interface Props {
  campaignId: string;
}

export function TalkXRecipientsList({ campaignId }: Props) {
  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ['talkx-recipients-list', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_recipients')
        .select('*, contacts:contact_id(name, nickname, phone, company, avatar_url)')
        .eq('campaign_id', campaignId)
        .order('created_at');
      if (error) throw error;
      return data as TalkXRecipient[];
    },
    enabled: !!campaignId,
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-muted rounded w-2/3" />
              <div className="h-2.5 bg-muted rounded w-1/3" />
            </div>
            <div className="h-5 bg-muted rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (recipients.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nenhum destinatário adicionado
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {recipients.map((r, index) => {
        const cfg = STATUS_MAP[r.status] || STATUS_MAP.pending;
        const Icon = cfg.icon;

        return (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.5) }}
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0 overflow-hidden">
              {r.contacts?.avatar_url ? (
                <img src={r.contacts.avatar_url} alt="" className="w-full h-full object-cover"  loading="lazy" decoding="async"/>
              ) : (
                (r.contacts?.name || '?')[0].toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {r.contacts?.name || 'Desconhecido'}
                {r.contacts?.nickname && (
                  <span className="text-muted-foreground ml-1">({r.contacts.nickname})</span>
                )}
              </p>
              {r.personalized_message && (
                <p className="text-xs text-muted-foreground truncate">{r.personalized_message}</p>
              )}
              {r.error_message && (
                <p className="text-xs text-destructive truncate">{r.error_message}</p>
              )}
            </div>
            <Badge variant="outline" className={`gap-1 shrink-0 ${cfg.color}`}>
              <Icon className={`w-3 h-3 ${r.status === 'sending' ? 'animate-spin' : ''}`} />
              {cfg.label}
            </Badge>
          </motion.div>
        );
      })}
    </div>
  );
}
