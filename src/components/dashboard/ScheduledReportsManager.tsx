/**
 * ScheduledReportsManager — redesign navy
 * Preserva integralmente:
 *  - Queries diretas a Supabase (sem hook customizado)
 *  - REPORT_TYPE_LABELS e FREQUENCY_LABELS existentes
 *  - Mutations createConfig, toggleActive, deleteConfig
 *  - Self-contained state: formName, formType, formFrequency, formRecipients
 *  - recipients como texto livre separado por vírgula (não chips)
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileText, Plus, Trash2, RefreshCw, Calendar, LayoutTemplate, Lightbulb, BarChart3, Users, Heart, MessageSquare, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DashboardCard, SectionHeader } from './overview/DashboardCard';

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Diário', weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal',
};
const REPORT_TYPE_LABELS: Record<string, string> = {
  performance: 'Desempenho da Equipe', satisfaction: 'Satisfação', sla: 'Métricas SLA',
  conversations: 'Volume de Atendimentos', agents: 'Agentes', full: 'Resumo Executivo',
};
const TYPE_ICONS: Record<string, React.ElementType> = {
  performance: Users, satisfaction: Heart, sla: BarChart3,
  conversations: MessageSquare, agents: Users, full: FileText,
};
const TYPE_TILES: Record<string, string> = {
  performance: 'bg-dash-tile-green', satisfaction: 'bg-dash-tile-red',
  sla: 'bg-dash-tile-violet', conversations: 'bg-dash-tile-amber',
  agents: 'bg-dash-tile-blue', full: 'bg-dash-tile-blue',
};
const TEMPLATES = [
  { key: 'full', label: 'Resumo Executivo', desc: 'Visão geral do atendimento, principais métricas e destaques do período.' },
  { key: 'performance', label: 'Desempenho da Equipe', desc: 'Produtividade, tempo de resposta e ranking de agentes.' },
  { key: 'sla', label: 'Métricas de SLA', desc: 'Cumprimento de SLA, tempos médios e análise de filas.' },
  { key: 'conversations', label: 'Volume de Atendimentos', desc: 'Total de conversas, por canal e por período.' },
  { key: 'satisfaction', label: 'Satisfação do Cliente', desc: 'NPS, CSAT e análise de sentimentos.' },
];
const FREQ_TILES = [
  { value: 'daily', label: 'Diário', sub: 'Todo dia' },
  { value: 'weekly', label: 'Semanal', sub: 'Toda semana' },
  { value: 'monthly', label: 'Mensal', sub: 'Todo mês' },
  { value: 'biweekly', label: 'Personalizada', sub: 'Sob demanda' },
];

export function ScheduledReportsManager() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('performance');
  const [formFrequency, setFormFrequency] = useState('weekly');
  const [formRecipients, setFormRecipients] = useState('');
  const [tipDismissed, setTipDismissed] = useState(false);
  const [freqFilter, setFreqFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['scheduled-reports'],
    queryFn: async () => {
      const { data, error } = await supabase.from('scheduled_report_configs').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const openCreate = (presetType?: string) => {
    if (presetType) setFormType(presetType);
    setShowCreate(true);
  };

  const createConfig = useMutation({
    mutationFn: async () => {
      const recipients = formRecipients.split(',').map(r => r.trim()).filter(Boolean);
      const { error } = await supabase.from('scheduled_report_configs').insert({ name: formName, report_type: formType, frequency: formFrequency, recipients, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-reports'] });
      setShowCreate(false);
      setFormName(''); setFormType('performance'); setFormFrequency('weekly'); setFormRecipients('');
      toast.success('Relatório criado com sucesso');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('scheduled_report_configs').update({ is_active: !isActive }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-reports'] }),
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scheduled_report_configs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); toast.success('Relatório removido'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = configs.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    const matchFreq = freqFilter === 'all' || c.frequency === freqFilter;
    return matchSearch && matchFreq;
  });

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-2.5">
        {/* Principal */}
        <DashboardCard testid="reports-main-card">
          <SectionHeader icon={FileText} title="Relatórios Agendados" subtitle="Configure e gerencie relatórios automáticos enviados por email" tileSize={44}
            right={<button onClick={() => openCreate()} className="h-8 px-3 rounded-md bg-primary text-white text-[13px] font-semibold flex items-center gap-1 hover:bg-primary/90 transition-colors"><Plus className="w-3.5 h-3.5" />Novo Relatório</button>}
          />
          {/* Filtros */}
          <div className="flex gap-2 mt-3 flex-wrap">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar relatórios…" className="h-9 flex-1 min-w-[160px] rounded-lg bg-input border-border text-[13px]" />
            <Select value={freqFilter} onValueChange={setFreqFilter}>
              <SelectTrigger className="h-9 w-[150px] text-[13px] rounded-lg bg-input border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as frequências</SelectItem>
                {Object.entries(FREQUENCY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {filtered.length === 0 ? (
            <div className="mt-4 border border-dashed border-border/60 rounded-xl py-14 flex flex-col items-center text-muted-foreground gap-3">
              <FileText className="w-11 h-11 text-primary opacity-60" />
              <p className="text-[18px] font-bold text-foreground">Nenhum relatório agendado ainda</p>
              <p className="text-[13px] text-center max-w-[320px]">Crie relatórios automáticos para receber insights do seu atendimento diretamente no seu email.</p>
              <Button onClick={() => openCreate()} className="bg-primary text-white h-9 px-4 text-[13px]"><Plus className="w-3.5 h-3.5 mr-1" />Criar meu primeiro relatório</Button>
            </div>
          ) : (
            <div className="mt-3 space-y-1">
              {filtered.map(cfg => {
                const Ico = TYPE_ICONS[cfg.report_type] ?? FileText;
                return (
                  <div key={cfg.id} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                    <div className={cn('w-[34px] h-[34px] rounded-[8px] flex items-center justify-center shrink-0', TYPE_TILES[cfg.report_type] ?? 'bg-dash-tile-blue')}>
                      <Ico className="w-4 h-4 text-white/90" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold truncate">{cfg.name}</div>
                      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <span>{REPORT_TYPE_LABELS[cfg.report_type] ?? cfg.report_type}</span>
                        <span>·</span><span>{FREQUENCY_LABELS[cfg.frequency] ?? cfg.frequency}</span>
                        <span>·</span><span>{cfg.recipients?.length ?? 0} destinatário(s)</span>
                      </div>
                    </div>
                    <Switch checked={cfg.is_active} onCheckedChange={() => toggleActive.mutate({ id: cfg.id, isActive: cfg.is_active })} />
                    <button onClick={() => deleteConfig.mutate(cfg.id)} className="w-7 h-7 rounded-md hover:bg-destructive/10 flex items-center justify-center shrink-0">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </DashboardCard>

        {/* Rail */}
        <div className="space-y-2.5">
          <DashboardCard testid="reports-templates-card">
            <SectionHeader icon={LayoutTemplate} title="Modelos de Relatórios" subtitle="Utilize nossos modelos prontos para começar mais rápido" tileSize={34} />
            <div className="mt-3 space-y-1">
              {TEMPLATES.map((t, i) => {
                const Ico = TYPE_ICONS[t.key] ?? FileText;
                return (
                  <button key={t.key} onClick={() => openCreate(t.key)} className="w-full flex items-center gap-2.5 h-14 rounded-lg hover:bg-muted/40 transition-colors px-2 text-left">
                    <div className={cn('w-[34px] h-[34px] rounded-[8px] flex items-center justify-center shrink-0', TYPE_TILES[t.key] ?? 'bg-dash-tile-blue')}>
                      <Ico className="w-4 h-4 text-white/90" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold truncate">{t.label}</div>
                      <div className="text-[11.5px] text-muted-foreground line-clamp-1">{t.desc}</div>
                    </div>
                    <span className="text-muted-foreground shrink-0">›</span>
                  </button>
                );
              })}
            </div>
          </DashboardCard>
          <DashboardCard testid="reports-freq-card">
            <SectionHeader icon={Calendar} title="Frequências Comuns" subtitle="Escolha a periodicidade ideal para seu relatório" tileSize={34} />
            <div className="grid grid-cols-4 gap-2 mt-3">
              {FREQ_TILES.map(f => (
                <button key={f.value} onClick={() => { setFormFrequency(f.value); openCreate(); }}
                  className={cn('h-16 rounded-lg border border-border/70 flex flex-col items-center justify-center gap-1 hover:bg-muted/40 transition-colors',
                    formFrequency === f.value && showCreate ? 'bg-primary/15 border-primary/60' : '')}>
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[12px] font-semibold leading-none">{f.label}</span>
                  <span className="text-[10px] text-muted-foreground">{f.sub}</span>
                </button>
              ))}
            </div>
          </DashboardCard>
          {!tipDismissed && (
            <DashboardCard testid="reports-tip-card">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-dash-tile-amber flex items-center justify-center shrink-0">
                  <Lightbulb className="w-4 h-4 text-white/90" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold">Dica</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Comece com o relatório semanal de Resumo Executivo para receber os principais indicadores da sua operação.</p>
                </div>
                <button onClick={() => setTipDismissed(true)} className="shrink-0 w-6 h-6 rounded flex items-center justify-center hover:bg-muted/60">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </DashboardCard>
          )}
        </div>
      </div>

      {/* Dialog Criar */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>Novo Relatório Agendado</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><label className="text-[13px] font-medium mb-1 block">Nome do relatório</label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Relatório semanal de performance" className="bg-input border-border" /></div>
            <div><label className="text-[13px] font-medium mb-1 block">Tipo</label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(REPORT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-[13px] font-medium mb-1 block">Frequência</label>
              <Select value={formFrequency} onValueChange={setFormFrequency}>
                <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(FREQUENCY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-[13px] font-medium mb-1 block">Destinatários</label><Input value={formRecipients} onChange={e => setFormRecipients(e.target.value)} placeholder="email1@empresa.com, email2@empresa.com" className="bg-input border-border" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={() => createConfig.mutate()} disabled={!formName || !formRecipients || createConfig.isPending} className="bg-primary">
              {createConfig.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}Criar relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
