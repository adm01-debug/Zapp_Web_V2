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
import { FileText, Plus, Trash2, RefreshCw, Calendar, LayoutTemplate, Lightbulb, BarChart3, Users, Heart, MessageSquare, X, Search, ArrowUpDown, ChevronRight, Clock, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DashboardCard, SectionHeader, PrimaryButton, Pill, VerTodasButton } from './overview/DashboardCard';
import { useScheduledReportConfigs } from '@/hooks/dashboard/useScheduledReportConfigs';

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
  const { configs, isLoading, createConfig, toggleActive, deleteConfig } = useScheduledReportConfigs();
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('performance');
  const [formFrequency, setFormFrequency] = useState('weekly');
  const [formRecipients, setFormRecipients] = useState('');
  const [tipDismissed, setTipDismissed] = useState(false);
  const [freqFilter, setFreqFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent');
  const [search, setSearch] = useState('');

  const openCreate = (presetType?: string) => {
    if (presetType) setFormType(presetType);
    setShowCreate(true);
  };

  const handleCreate = () => {
    const recipients = formRecipients.split(',').map(r => r.trim()).filter(Boolean);
    createConfig.mutate({ name: formName, report_type: formType, frequency: formFrequency, recipients }, {
      onSuccess: () => {
        setShowCreate(false);
        setFormName(''); setFormType('performance'); setFormFrequency('weekly'); setFormRecipients('');
      },
    });
  };

  const filtered = configs
    .filter(c => {
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      const matchFreq = freqFilter === 'all' || c.frequency === freqFilter;
      const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? c.is_active : !c.is_active);
      return matchSearch && matchFreq && matchStatus;
    })
    .sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
        {/* Principal */}
        <DashboardCard testid="reports-main-card" variant="comfortable">
          <SectionHeader icon={FileText} title="Relatórios Agendados" subtitle="Configure e gerencie relatórios automáticos enviados por email." tileSize={44} size="lg"
            right={<PrimaryButton icon={Plus} onClick={() => openCreate()}>Novo Relatório</PrimaryButton>}
          />
          {/* Filtros */}
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar relatórios..." className="h-10 pl-9 rounded-lg bg-input/40 border-border/70 text-[13px]" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-10 w-[170px] text-[13px] rounded-lg bg-input/40 border-border/70"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="paused">Pausados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={freqFilter} onValueChange={setFreqFilter}>
              <SelectTrigger className="h-10 w-[190px] text-[13px] rounded-lg bg-input/40 border-border/70"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as frequências</SelectItem>
                {Object.entries(FREQUENCY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-10 w-[160px] text-[13px] rounded-lg bg-input/40 border-border/70 ml-auto gap-2"><ArrowUpDown className="w-4 h-4 text-muted-foreground" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Mais recentes</SelectItem>
                <SelectItem value="name">Nome (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isLoading ? (
            <div className="mt-4 py-16 text-center text-[13px] text-muted-foreground">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="mt-4 border border-dashed border-border/60 rounded-2xl py-16 flex flex-col items-center text-muted-foreground gap-3">
              <div className="relative">
                <FileText className="w-16 h-16 text-primary-glow" strokeWidth={1.4} />
                <Sparkles className="w-5 h-5 text-primary-glow absolute -top-1 -right-2" />
              </div>
              <p className="text-[22px] font-bold text-foreground mt-2">{configs.length === 0 ? 'Nenhum relatório agendado ainda' : 'Nenhum relatório encontrado'}</p>
              <p className="text-[14px] text-center max-w-[460px] leading-relaxed">
                {configs.length === 0
                  ? 'Crie relatórios automáticos para receber insights do seu atendimento diretamente no seu email. Acompanhe métricas, produtividade da equipe, SLA e muito mais, de forma automática.'
                  : 'Ajuste a busca ou os filtros para encontrar o relatório desejado.'}
              </p>
              {configs.length === 0 && <PrimaryButton size="lg" icon={Plus} className="mt-2" onClick={() => openCreate()}>Criar meu primeiro relatório</PrimaryButton>}
            </div>
          ) : (
            <div className="mt-4 divide-y divide-border/50">
              {filtered.map(cfg => {
                const Ico = TYPE_ICONS[cfg.report_type] ?? FileText;
                return (
                  <div key={cfg.id} className="flex items-center gap-4 py-3.5">
                    <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', TYPE_TILES[cfg.report_type] ?? 'bg-dash-tile-blue')}>
                      <Ico className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-foreground truncate">{cfg.name}</span>
                        <Pill label={cfg.is_active ? 'Ativo' : 'Pausado'} tone={cfg.is_active ? 'success' : 'muted'} dot />
                      </div>
                      <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground mt-0.5">
                        <span>{REPORT_TYPE_LABELS[cfg.report_type] ?? cfg.report_type}</span>
                        <span>·</span><span className="flex items-center gap-1"><Clock className="w-3 h-3" />{FREQUENCY_LABELS[cfg.frequency] ?? cfg.frequency}</span>
                        <span>·</span><span>{cfg.recipients?.length ?? 0} destinatário(s)</span>
                      </div>
                    </div>
                    <Switch checked={cfg.is_active} onCheckedChange={() => toggleActive.mutate({ id: cfg.id, isActive: cfg.is_active })} />
                    <button onClick={() => deleteConfig.mutate(cfg.id)} title="Excluir" className="w-9 h-9 rounded-lg border border-border/60 hover:bg-destructive/10 hover:border-destructive/40 flex items-center justify-center shrink-0">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </DashboardCard>

        {/* Rail */}
        <div className="space-y-4">
          <DashboardCard testid="reports-templates-card" variant="comfortable">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[18px] font-bold text-foreground tracking-[-0.01em]">Modelos de Relatórios</p>
                <p className="text-[13px] text-muted-foreground mt-0.5">Utilize nossos modelos prontos para começar mais rápido.</p>
              </div>
              <VerTodasButton onClick={() => openCreate()} />
            </div>
            <div className="space-y-2">
              {TEMPLATES.map((t) => {
                const Ico = TYPE_ICONS[t.key] ?? FileText;
                return (
                  <button key={t.key} onClick={() => openCreate(t.key)} className="w-full flex items-center gap-3 h-16 rounded-xl border border-border/60 bg-input/20 hover:bg-muted/40 hover:border-primary/40 transition-colors px-3 text-left">
                    <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', TYPE_TILES[t.key] ?? 'bg-dash-tile-blue')}>
                      <Ico className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-bold text-foreground truncate">{t.label}</div>
                      <div className="text-[12px] text-muted-foreground line-clamp-2 leading-snug">{t.desc}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          </DashboardCard>

          <DashboardCard testid="reports-freq-card" variant="comfortable">
            <p className="text-[18px] font-bold text-foreground tracking-[-0.01em]">Frequências Comuns</p>
            <p className="text-[13px] text-muted-foreground mt-0.5 mb-3">Escolha a periodicidade ideal para seu relatório.</p>
            <div className="grid grid-cols-4 gap-2.5">
              {FREQ_TILES.map(f => {
                const active = formFrequency === f.value;
                return (
                  <button key={f.value} onClick={() => { setFormFrequency(f.value); openCreate(); }}
                    className={cn('h-[84px] rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-colors',
                      active ? 'bg-primary/15 border-primary/60 text-primary-glow' : 'border-border/60 bg-input/20 text-foreground hover:bg-muted/40')}>
                    {f.value === 'monthly' ? <Calendar className="w-5 h-5" /> : f.value === 'biweekly' ? <Clock className="w-5 h-5" /> : f.value === 'daily' ? <Calendar className="w-5 h-5" /> : <BarChart3 className="w-5 h-5" />}
                    <span className="text-[13px] font-semibold leading-none">{f.label}</span>
                    <span className={cn('text-[11px]', active ? 'text-primary-glow/80' : 'text-muted-foreground')}>{f.sub}</span>
                  </button>
                );
              })}
            </div>
          </DashboardCard>

          {!tipDismissed && (
            <DashboardCard testid="reports-tip-card" variant="comfortable" className="border-dash-amber/30">
              <div className="flex items-start gap-3">
                <Lightbulb className="w-6 h-6 text-dash-amber shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-foreground">Dica</p>
                  <p className="text-[13px] text-muted-foreground mt-0.5 leading-snug">Comece com o relatório semanal de Resumo Executivo para receber os principais indicadores da sua operação.</p>
                </div>
                <button onClick={() => setTipDismissed(true)} className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center hover:bg-muted/60">
                  <X className="w-4 h-4 text-muted-foreground" />
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
            <Button onClick={handleCreate} disabled={!formName || !formRecipients || createConfig.isPending} className="bg-primary">
              {createConfig.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}Criar relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
