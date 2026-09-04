import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { AnimatePresence } from 'framer-motion';
import {
  Zap, Plus, Play, Eye, Loader2, MessageSquare,
  Send, BarChart3, CheckCircle2, Search, Filter, ShieldBan
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useTalkX, TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { supabase } from '@/integrations/supabase/client';
import { TalkXCampaignEditor } from './TalkXCampaignEditor';
import { TalkXLiveMonitor } from './TalkXLiveMonitor';
import { TalkXCampaignCard } from './TalkXCampaignCard';
import { toast } from 'sonner';
import { TalkXBlacklist } from './TalkXBlacklist';
import { TalkXAnalytics } from './TalkXAnalytics';

export default function TalkXView() {
  const {
    campaigns, isLoading, selectedCampaignId, setSelectedCampaignId,
    createCampaign, deleteCampaign, startCampaign, pauseCampaign, cancelCampaign, refetchCampaigns,
  } = useTalkX();

  const [showEditor, setShowEditor] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<TalkXCampaign | null>(null);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredCampaigns = useMemo(() => {
    let result = campaigns;
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.message_template.toLowerCase().includes(q)
      );
    }
    return result;
  }, [campaigns, searchQuery, statusFilter]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !showEditor) {
      e.preventDefault();
      handleNewCampaign();
    }
  }, [showEditor]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const channel = supabase
      .channel('talkx-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'talkx_campaigns' }, () => {
        refetchCampaigns();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetchCampaigns]);

  const handleNewCampaign = () => {
    setEditingCampaign(null);
    setShowEditor(false);
    setTimeout(() => setShowEditor(true), 0);
  };

  const handleDuplicate = async (campaign: TalkXCampaign) => {
    try {
      await createCampaign.mutateAsync({
        name: `${campaign.name} (cópia)`,
        message_template: campaign.message_template,
        typing_delay_min: campaign.typing_delay_min,
        typing_delay_max: campaign.typing_delay_max,
        send_interval_min: campaign.send_interval_min,
        send_interval_max: campaign.send_interval_max,
        whatsapp_connection_id: campaign.whatsapp_connection_id,
        media_url: campaign.media_url,
        media_type: campaign.media_type,
      });
      toast.success('Campanha duplicada!');
    } catch {
      toast.error('Erro ao duplicar campanha');
    }
  };

  const handleView = (campaign: TalkXCampaign) => {
    setSelectedCampaignId(campaign.id);
    setActiveTab('monitor');
  };

  if (showEditor) {
    return (
      <TalkXCampaignEditor
        campaign={editingCampaign}
        onClose={() => { setShowEditor(false); refetchCampaigns(); }}
      />
    );
  }

  const stats = [
    { label: 'Total', value: campaigns.length, icon: BarChart3, cls: 'text-primary' },
    { label: 'Ativas', value: campaigns.filter(c => c.status === 'sending').length, icon: Play, cls: 'text-primary' },
    { label: 'Concluídas', value: campaigns.filter(c => c.status === 'completed').length, icon: CheckCircle2, cls: 'text-accent-foreground' },
    { label: 'Enviadas', value: campaigns.reduce((a, c) => a + c.sent_count, 0), icon: Send, cls: 'text-primary' },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-6 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <Zap className="w-5 h-5 md:w-6 md:h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold font-display text-foreground">Talk X</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Marketing humanizado com simulação de digitação</p>
          </div>
        </div>
        <Button onClick={handleNewCampaign} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          Nova Campanha
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon, cls }) => (
          <Card key={label} className="border-border/50">
            <CardContent className="flex items-center gap-3 p-3 md:p-4">
              <Icon className={`w-5 h-5 ${cls} shrink-0`} />
              <div className="min-w-0">
                <p className="text-xl md:text-2xl font-bold text-foreground">{value}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground truncate">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="campaigns" className="gap-2 flex-1 sm:flex-none">
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Campanhas</span>
          </TabsTrigger>
          <TabsTrigger value="monitor" className="gap-2 flex-1 sm:flex-none" disabled={!selectedCampaignId}>
            <Eye className="w-4 h-4" />
            <span className="hidden sm:inline">Monitor</span>
          </TabsTrigger>
          <TabsTrigger value="blacklist" className="gap-2 flex-1 sm:flex-none">
            <ShieldBan className="w-4 h-4" />
            <span className="hidden sm:inline">Opt-out</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2 flex-1 sm:flex-none">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="flex-1 overflow-auto mt-4 space-y-4">
          {/* Search & Filter Bar */}
          {campaigns.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar campanhas... (N para nova)"
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px] h-9">
                  <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="sending">Enviando</SelectItem>
                  <SelectItem value="paused">Pausada</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="scheduled">Agendada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4 md:p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-5 bg-muted rounded w-1/3" />
                      <div className="h-5 bg-muted rounded w-16" />
                    </div>
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="flex gap-3">
                      <div className="h-3 bg-muted rounded w-12" />
                      <div className="h-3 bg-muted rounded w-20" />
                      <div className="h-3 bg-muted rounded w-16" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <Card className="border-dashed border-2 border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-12 md:py-16 gap-4 px-6">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Zap className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-lg text-foreground">Crie sua primeira campanha Talk X</h3>
                  <p className="text-muted-foreground text-sm mt-1 max-w-md">
                    Envie mensagens personalizadas para vários contatos simulando digitação humana.
                    Use variáveis como {'{{nome}}'}, {'{{apelido}}'} e {'{{empresa}}'}.
                  </p>
                </div>
                <Button onClick={handleNewCampaign} className="gap-2 mt-2">
                  <Plus className="w-4 h-4" />
                  Criar Campanha
                </Button>
              </CardContent>
            </Card>
          ) : filteredCampaigns.length === 0 ? (
            <GenericEmptyState icon={Search} title="Sem campanhas" description="Nenhuma campanha encontrada com os filtros atuais"
              actionLabel="Limpar filtros" onAction={() => { setSearchQuery(''); setStatusFilter('all'); }} className="py-8" />
          ) : (
            <div className="grid gap-3">
              <AnimatePresence mode="popLayout">
                {filteredCampaigns.map((campaign) => (
                  <TalkXCampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    onEdit={(c) => { setEditingCampaign(c); setShowEditor(true); }}
                    onView={handleView}
                    onDuplicate={handleDuplicate}
                    onStart={startCampaign}
                    onPause={pauseCampaign}
                    onCancel={cancelCampaign}
                    onDelete={(id) => deleteCampaign.mutate(id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        <TabsContent value="monitor" className="flex-1 overflow-auto mt-4">
          {selectedCampaignId ? (
            <TalkXLiveMonitor campaignId={selectedCampaignId} />
          ) : (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              Selecione uma campanha para monitorar
            </div>
          )}
        </TabsContent>

        <TabsContent value="blacklist" className="flex-1 overflow-auto mt-4">
          <TalkXBlacklist />
        </TabsContent>

        <TabsContent value="analytics" className="flex-1 overflow-auto mt-4">
          <TalkXAnalytics campaigns={campaigns} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
