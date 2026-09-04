import { useState, lazy, Suspense } from 'react';
import { useCampaigns, Campaign } from '@/hooks/communication/useCampaigns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Megaphone, Plus, Play, Pause, Trash2, Edit2, Send, Clock, CheckCircle2,
  XCircle, AlertCircle, Users, Loader2, Eye,
} from 'lucide-react';
import { CampaignCreateDialog } from './CampaignCreateDialog';

const CampaignABTesting = lazy(() => import('./CampaignABTesting').then(m => ({ default: m.CampaignABTesting })));
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft: { label: 'Rascunho', color: 'bg-muted text-muted-foreground', icon: Edit2 },
  scheduled: { label: 'Agendada', color: 'bg-info/20 text-info', icon: Clock },
  sending: { label: 'Enviando', color: 'bg-warning/20 text-warning', icon: Send },
  completed: { label: 'Concluída', color: 'bg-success/20 text-success', icon: CheckCircle2 },
  cancelled: { label: 'Cancelada', color: 'bg-destructive/20 text-destructive', icon: XCircle },
  paused: { label: 'Pausada', color: 'bg-warning/20 text-warning', icon: Pause },
};

export function CampaignsView() {
  const { campaigns, isLoading, createCampaign, updateCampaign, deleteCampaign } = useCampaigns();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = campaigns.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: campaigns.length,
    active: campaigns.filter(c => c.status === 'sending').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
    totalSent: campaigns.reduce((sum, c) => sum + c.sent_count, 0),
  };

  const getProgress = (campaign: Campaign) => {
    if (campaign.total_contacts === 0) return 0;
    return Math.round((campaign.sent_count / campaign.total_contacts) * 100);
  };

  return (
    <div className="flex flex-col w-full min-w-0 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <Megaphone className="w-6 h-6 md:w-7 md:h-7 text-primary" />
            Campanhas
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">Envio em massa e broadcast para contatos</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Megaphone, color: 'text-primary' },
          { label: 'Ativas', value: stats.active, icon: Play, color: 'text-warning' },
          { label: 'Concluídas', value: stats.completed, icon: CheckCircle2, color: 'text-success' },
          { label: 'Mensagens Enviadas', value: stats.totalSent, icon: Send, color: 'text-info' },
        ].map(stat => (
          <Card key={stat.label} className="border-secondary/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn('p-2 rounded-lg bg-secondary/20', stat.color)}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input placeholder="Buscar campanha..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="scheduled">Agendada</SelectItem>
            <SelectItem value="sending">Enviando</SelectItem>
            <SelectItem value="completed">Concluída</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campaign List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Megaphone className="w-12 h-12 mb-4 opacity-30" />
            <p className="font-medium">Nenhuma campanha encontrada</p>
            <p className="text-sm">Crie sua primeira campanha de broadcast</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filtered.map(campaign => {
                const status = statusConfig[campaign.status] || statusConfig.draft;
                const StatusIcon = status.icon;
                const progress = getProgress(campaign);

                return (
                  <motion.div key={campaign.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <Card className="border-secondary/30 hover:border-primary/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedCampaign(campaign)}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-foreground truncate">{campaign.name}</h3>
                              <Badge variant="outline" className={cn('text-xs', status.color)}>
                                <StatusIcon className="w-3 h-3 mr-1" />{status.label}
                              </Badge>
                            </div>
                            {campaign.description && <p className="text-sm text-muted-foreground truncate">{campaign.description}</p>}
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {campaign.total_contacts} contatos</span>
                              <span className="flex items-center gap-1"><Send className="w-3 h-3" /> {campaign.sent_count} enviados</span>
                              {campaign.failed_count > 0 && (
                                <span className="flex items-center gap-1 text-destructive"><AlertCircle className="w-3 h-3" /> {campaign.failed_count} erros</span>
                              )}
                              <span>{format(new Date(campaign.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                            </div>
                            {(campaign.status === 'sending' || campaign.status === 'completed') && (
                              <div className="mt-2 flex items-center gap-2">
                                <Progress value={progress} className="flex-1 h-2" />
                                <span className="text-xs text-muted-foreground font-mono">{progress}%</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 ml-4" onClick={e => e.stopPropagation()}>
                            {campaign.status === 'draft' && (
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-success hover:text-success"
                                onClick={() => updateCampaign.mutate({ id: campaign.id, status: 'sending' })} aria-label="Iniciar campanha">
                                <Play className="w-4 h-4" />
                              </Button>
                            )}
                            {campaign.status === 'sending' && (
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-warning hover:text-warning"
                                onClick={() => updateCampaign.mutate({ id: campaign.id, status: 'paused' })} aria-label="Pausar campanha">
                                <Pause className="w-4 h-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => deleteCampaign.mutate(campaign.id)} aria-label="Excluir campanha">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>

      <CampaignCreateDialog open={showCreate} onOpenChange={setShowCreate} createCampaign={createCampaign} />

      {/* Detail Dialog */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
          {selectedCampaign && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />{selectedCampaign.name}
                </DialogTitle>
                <DialogDescription>{selectedCampaign.description || 'Sem descrição'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total', value: selectedCampaign.total_contacts },
                    { label: 'Enviados', value: selectedCampaign.sent_count },
                    { label: 'Entregues', value: selectedCampaign.delivered_count },
                    { label: 'Lidos', value: selectedCampaign.read_count },
                    { label: 'Falhas', value: selectedCampaign.failed_count },
                    { label: 'Progresso', value: `${getProgress(selectedCampaign)}%` },
                  ].map(item => (
                    <div key={item.label} className="bg-secondary/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-lg font-bold text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-secondary/10 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Mensagem</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{selectedCampaign.message_content}</p>
                </div>
                <Suspense fallback={<div className="h-20 bg-muted/20 rounded-xl animate-pulse" />}>
                  <CampaignABTesting campaignId={selectedCampaign.id} />
                </Suspense>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
