import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart3, Users, CheckCircle2, XCircle, Clock, Loader2, Send, Download, Timer
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TalkXRecipientsList } from './TalkXRecipientsList';
import { motion } from 'framer-motion';
import type { TalkXCampaign, TalkXRecipient } from '@/hooks/integrations/useTalkX';

interface Props {
  campaignId: string;
}

export function TalkXLiveMonitor({ campaignId }: Props) {
  const [campaign, setCampaign] = useState<TalkXCampaign | null>(null);
  const [recipientsKey, setRecipientsKey] = useState(0);

  const { data } = useQuery({
    queryKey: ['talkx-campaign-live', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();
      if (error) throw error;
      return data as TalkXCampaign;
    },
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (data) setCampaign(data);
  }, [data]);

  // Realtime updates for campaign AND recipients
  useEffect(() => {
    const channel = supabase
      .channel(`talkx-monitor-${campaignId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'talkx_campaigns', filter: `id=eq.${campaignId}` },
        (payload) => {
          setCampaign(payload.new as TalkXCampaign);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'talkx_recipients', filter: `campaign_id=eq.${campaignId}` },
        () => {
          setRecipientsKey((k) => k + 1);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  const handleExportCSV = async () => {
    const { data: recipients } = await supabase
      .from('talkx_recipients')
      .select('*, contacts:contact_id(name, nickname, phone, company)')
      .eq('campaign_id', campaignId)
      .order('created_at');

    if (!recipients || recipients.length === 0) return;

    const rows = recipients.map((r: any) => ({
      Nome: r.contacts?.name || '',
      Apelido: r.contacts?.nickname || '',
      Telefone: r.contacts?.phone || '',
      Empresa: r.contacts?.company || '',
      Status: r.status,
      Mensagem: r.personalized_message || '',
      Erro: r.error_message || '',
      'Enviada em': r.sent_at || '',
    }));

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((h) => `"${String((row as Record<string, string>)[h]).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `talkx-${campaign?.name || 'campanha'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const elapsedTime = useMemo(() => {
    if (!campaign?.started_at) return null;
    const start = new Date(campaign.started_at).getTime();
    const end = campaign.completed_at ? new Date(campaign.completed_at).getTime() : Date.now();
    const diffSeconds = Math.floor((end - start) / 1000);
    const mins = Math.floor(diffSeconds / 60);
    const secs = diffSeconds % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hours}h ${remMins}m`;
    }
    return `${mins}m ${secs}s`;
  }, [campaign?.started_at, campaign?.completed_at]);

  if (!campaign) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-muted rounded-xl" />
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  const progress =
    campaign.total_recipients > 0
      ? Math.round(((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100)
      : 0;

  const remaining = campaign.total_recipients - campaign.sent_count - campaign.failed_count;
  const successRate =
    campaign.sent_count + campaign.failed_count > 0
      ? Math.round((campaign.sent_count / (campaign.sent_count + campaign.failed_count)) * 100)
      : 0;

  // Mini donut SVG for success rate
  const donutRadius = 18;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const donutOffset = donutCircumference - (successRate / 100) * donutCircumference;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Campaign Header */}
      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-foreground truncate">{campaign.name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-1">{campaign.message_template}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {elapsedTime && (
                <Badge variant="outline" className="gap-1">
                  <Timer className="w-3 h-3" />
                  {elapsedTime}
                </Badge>
              )}
              <Badge
                variant={campaign.status === 'sending' ? 'default' : 'secondary'}
                className="gap-1"
              >
                {campaign.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin" />}
                {campaign.status === 'sending' ? 'Enviando...' : campaign.status === 'completed' ? 'Concluída' : campaign.status}
              </Badge>
            </div>
          </div>
          <Progress value={progress} className="h-3 mb-2" />
          <p className="text-xs text-muted-foreground text-right">{progress}% concluído</p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: campaign.total_recipients, icon: Users, cls: 'text-primary' },
          { label: 'Enviadas', value: campaign.sent_count, icon: CheckCircle2, cls: 'text-primary' },
          { label: 'Falhas', value: campaign.failed_count, icon: XCircle, cls: 'text-destructive' },
          { label: 'Restantes', value: remaining, icon: Clock, cls: 'text-muted-foreground' },
        ].map(({ label, value, icon: Icon, cls }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="border-border/50">
              <CardContent className="flex items-center gap-2 p-3">
                <Icon className={`w-4 h-4 ${cls} shrink-0`} />
                <div className="min-w-0">
                  <p className="text-lg font-bold text-foreground">{value}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
        {/* Success Rate with mini donut */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-border/50">
            <CardContent className="flex items-center gap-2 p-3">
              <svg width="40" height="40" viewBox="0 0 44 44" className="shrink-0">
                <circle cx="22" cy="22" r={donutRadius} fill="none" strokeWidth="4" className="stroke-muted" />
                <circle
                  cx="22" cy="22" r={donutRadius} fill="none" strokeWidth="4"
                  className="stroke-primary"
                  strokeDasharray={donutCircumference}
                  strokeDashoffset={donutOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 22 22)"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
                <text x="22" y="22" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[9px] font-bold">
                  {successRate}%
                </text>
              </svg>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground truncate">Taxa Sucesso</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recipients List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              Destinatários
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={handleExportCSV} className="gap-1 text-xs">
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[400px] overflow-auto">
          <TalkXRecipientsList campaignId={campaignId} key={recipientsKey} />
        </CardContent>
      </Card>
    </div>
  );
}
