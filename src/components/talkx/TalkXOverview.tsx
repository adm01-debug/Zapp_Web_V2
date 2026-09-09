import React, { useMemo, useState } from 'react';
import {
  Users, Play, CheckCircle2, Target, Send, MoreVertical, Eye, Pencil, Copy, Pause, Square, Trash2, Zap, Plus,
  FileText, Bookmark, Upload, Lightbulb, LayoutList, LayoutGrid, MessageSquare, BarChart3, Filter,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ProgressBar, VerTodasButton, InitialsAvatar } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';
import {
  CAMPAIGN_STATUS, FilterBar, FilterBarV2, TalkXPagination, Th, Td, StatusPill, RailCard, RailAction, IconTile,
  TalkXEmptyState, TalkXSkeletonRows, KpiCard, KpiCardSkeleton, HeroCard, RecentList, TipCard, TalkXConfirmDialog, RowActionsMenu,
  fmtInt, fmtPct, pct, fmtDateTime, fmtAgo, barsByDay, OBJECTIVES,
} from './talkxShared';

interface Props {
  campaigns: TalkXCampaign[];
  segments: TalkXSegment[];
  creators: Record<string, string>;
  isLoading: boolean;
  onNew: () => void;
  onEdit: (c: TalkXCampaign) => void;
  onView: (c: TalkXCampaign) => void;
  onDuplicate: (c: TalkXCampaign) => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onGoTab: (tab: string) => void;
}

const OBJ_COLOR: Record<string, 'blue' | 'green' | 'red' | 'violet' | 'amber'> = { vendas: 'green', engajamento: 'blue', reativacao: 'amber', relacionamento: 'violet', pesquisa: 'blue', institucional: 'red' };

export function TalkXOverview({ campaigns, segments, creators, isLoading, onNew, onEdit, onView, onDuplicate, onStart, onPause, onCancel, onDelete, onGoTab }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [objective, setObjective] = useState('all');
  const [segment, setSegment] = useState('all');
  const [creator, setCreator] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'cancel' | 'start'; c: TalkXCampaign } | null>(null);

  const segmentName = (id?: string | null) => segments.find((s) => s.id === id)?.name;

  const filtered = useMemo(() => {
    let r = campaigns;
    if (status !== 'all') r = r.filter((c) => c.status === status);
    if (objective !== 'all') r = r.filter((c) => (c.objective ?? 'engajamento') === objective);
    if (segment !== 'all') r = r.filter((c) => (segment === 'manual' ? !c.segment_id : c.segment_id === segment));
    if (creator !== 'all') r = r.filter((c) => c.created_by === creator);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((c) => c.name.toLowerCase().includes(q) || c.message_template.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q));
    }
    return r;
  }, [campaigns, status, objective, segment, creator, search]);

  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const clear = () => { setSearch(''); setStatus('all'); setObjective('all'); setSegment('all'); setCreator('all'); setPage(1); };

  const totals = useMemo(() => {
    const sent = campaigns.reduce((a, c) => a + c.sent_count, 0);
    const failed = campaigns.reduce((a, c) => a + c.failed_count, 0);
    const reached = sent;
    return {
      total: campaigns.length,
      active: campaigns.filter((c) => c.status === 'sending' || c.status === 'paused').length,
      completed: campaigns.filter((c) => c.status === 'completed').length,
      successRate: sent + failed > 0 ? Math.round((sent / (sent + failed)) * 1000) / 10 : null,
      reached,
      bars: barsByDay(campaigns.map((c) => c.created_at)),
      barsCompleted: barsByDay(campaigns.filter((c) => c.status === 'completed').map((c) => c.completed_at)),
    };
  }, [campaigns]);

  const latest = useMemo(() => [...campaigns].sort((a, b) => (b.started_at ?? b.updated_at).localeCompare(a.started_at ?? a.updated_at)).slice(0, 4), [campaigns]);

  const toggleAll = () => setSelected((prev) => prev.size === pageItems.length ? new Set() : new Set(pageItems.map((c) => c.id)));

  const act = () => {
    if (!confirm) return;
    if (confirm.kind === 'delete') onDelete(confirm.c.id);
    if (confirm.kind === 'cancel') onCancel(confirm.c.id);
    if (confirm.kind === 'start') onStart(confirm.c.id);
    setConfirm(null);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        {/* KPIs */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">{Array.from({length:5}).map((_,i)=><KpiCardSkeleton key={i}/>)}</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
            <KpiCard icon={Users}         color="blue"   index={0} label="Total de campanhas"   value={fmtInt(totals.total)}    bars={totals.bars} />
            <KpiCard icon={Play}          color="blue"   index={1} label="Em andamento"          value={fmtInt(totals.active)}   delta={totals.active>0?{value:totals.active,suffix:'%',tone:'up'}:undefined} />
            <KpiCard icon={CheckCircle2}  color="green"  index={2} label="Concluídas"            value={fmtInt(totals.completed)} bars={totals.barsCompleted} />
            <KpiCard icon={Target}        color="green"  index={3} label="Taxa de sucesso"       value={totals.successRate===null?'—':`${totals.successRate}%`} />
            <KpiCard icon={Send}          color="violet" index={4} label="Contatos alcançados"   value={fmtInt(totals.reached)} />
          </div>
        )}

        {/* Filtros */}
        <FilterBar
          search={search} onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar campanhas…"
          selects={[
            { key: 'status', value: status, onChange: (v) => { setStatus(v); setPage(1); }, label: 'Todos os status', options: Object.entries(CAMPAIGN_STATUS).map(([v, m]) => ({ value: v, label: m.label })) },
            { key: 'obj', value: objective, onChange: (v) => { setObjective(v); setPage(1); }, label: 'Todos os objetivos', options: OBJECTIVES.map((o) => ({ value: o.value, label: o.label })) },
            { key: 'seg', value: segment, onChange: (v) => { setSegment(v); setPage(1); }, label: 'Todos os segmentos', options: [{ value: 'manual', label: 'Seleção manual' }, ...segments.map((s) => ({ value: s.id, label: s.name }))] },
            { key: 'creator', value: creator, onChange: (v) => { setCreator(v); setPage(1); }, label: 'Todos os criadores', options: Object.entries(creators).map(([id, n]) => ({ value: id, label: n })) },
          ]}
          onClear={clear}
          right={(
            <div className="flex items-center rounded-lg border border-border/70 bg-input/40 p-0.5">
              <button type="button" onClick={() => setLayout('list')} className={cn('h-8 w-8 rounded-md flex items-center justify-center', layout === 'list' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground')} aria-label="Lista"><LayoutList className="w-4 h-4" /></button>
              <button type="button" onClick={() => setLayout('grid')} className={cn('h-8 w-8 rounded-md flex items-center justify-center', layout === 'grid' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground')} aria-label="Grade"><LayoutGrid className="w-4 h-4" /></button>
            </div>
          )}
        />

        {/* Tabela */}
        <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
          {isLoading ? (
            <div className="p-4"><TalkXSkeletonRows rows={5} /></div>
          ) : campaigns.length === 0 ? (
            <div className="p-4">
              <TalkXEmptyState icon={Zap} title="Crie sua primeira campanha Talk X" description="Envie mensagens personalizadas para vários contatos simulando digitação humana. Use variáveis como {{nome}}, {{apelido}} e {{empresa}}." actionLabel="Criar campanha" onAction={onNew} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4"><TalkXEmptyState icon={Filter} title="Nenhuma campanha encontrada" description="Nenhuma campanha corresponde aos filtros atuais." /></div>
          ) : layout === 'grid' ? (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
              {pageItems.map((c) => <CampaignGridCard key={c.id} c={c} segmentName={segmentName(c.segment_id)} onView={() => onView(c)} onEdit={() => onEdit(c)} />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse">
                <thead className="bg-muted/20 border-b border-border/60">
                  <tr>
                    <Th className="w-10"><Checkbox checked={pageItems.length > 0 && selected.size === pageItems.length} onCheckedChange={toggleAll} aria-label="Selecionar todas" /></Th>
                    <Th>Campanha</Th><Th>Segmento / Público</Th><Th>Canal</Th><Th>Status</Th><Th className="w-[150px]">Progresso</Th><Th>Resultados</Th><Th>Agendada em</Th><Th className="text-right">Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => {
                    const done = c.sent_count + c.failed_count;
                    const progress = pct(done, c.total_recipients);
                    const tone = c.status === 'completed' ? 'success' : c.status === 'paused' ? 'warning' : c.status === 'cancelled' ? 'danger' : 'info';
                    const when = c.scheduled_at ?? c.started_at ?? null;
                    return (
                      <tr key={c.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <Td><Checkbox checked={selected.has(c.id)} onCheckedChange={() => setSelected((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} aria-label={`Selecionar ${c.name}`} /></Td>
                        <Td>
                          <button type="button" onClick={() => onView(c)} className="flex items-center gap-3 text-left min-w-0 group">
                            <IconTile icon={objectiveIcon(c.objective)} color={OBJ_COLOR[c.objective ?? 'engajamento'] ?? 'blue'} size={40} />
                            <span className="min-w-0">
                              <span className="block text-[13.5px] font-semibold text-foreground truncate group-hover:text-primary-glow">{c.name}</span>
                              <span className="block text-[11.5px] text-foreground-secondary truncate max-w-[260px]">{c.description || c.message_template}</span>
                            </span>
                          </button>
                        </Td>
                        <Td>
                          <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted/50 border border-border/60 text-foreground truncate max-w-[180px]">{segmentName(c.segment_id) ?? (c.audience_source === 'crm360' ? 'CRM 360°' : 'Seleção manual')}</span>
                          <span className="block text-[11.5px] text-foreground-secondary mt-1">{fmtInt(c.total_recipients)} contatos</span>
                        </Td>
                        <Td><span className="w-8 h-8 rounded-full bg-whatsapp/15 border border-whatsapp/30 flex items-center justify-center"><MessageSquare className="w-4 h-4 text-whatsapp" /></span></Td>
                        <Td><StatusPill status={c.status} map={CAMPAIGN_STATUS} /></Td>
                        <Td>
                          {c.total_recipients > 0 && c.status !== 'draft' && c.status !== 'scheduled' ? (
                            <div className="min-w-[110px]"><p className="text-[12.5px] font-semibold text-foreground mb-1">{progress}%</p><ProgressBar value={progress} tone={tone} height={6} /></div>
                          ) : <span className="text-muted-foreground text-[12px]">{c.total_recipients > 0 ? '0%' : '—'}</span>}
                        </Td>
                        <Td>
                          {done > 0 ? (
                            <><span className="block text-[12.5px] font-semibold text-foreground">{fmtInt(c.sent_count)} enviados</span><span className="block text-[11.5px] text-foreground-secondary">{c.failed_count > 0 ? `${fmtInt(c.failed_count)} falhas (${fmtPct(c.failed_count, done)})` : `${fmtPct(c.sent_count, done)} de sucesso`}</span></>
                          ) : <span className="text-muted-foreground text-[12px]">—</span>}
                        </Td>
                        <Td>
                          {when ? (<><span className="block text-[12.5px] text-foreground">{fmtDateTime(when)}</span><span className="block text-[11.5px] text-foreground-secondary">por {creators[c.created_by ?? ''] ?? '—'}</span></>) : <span className="text-muted-foreground text-[12px]">—</span>}
                        </Td>
                        <Td className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><button type="button" className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 inline-flex items-center justify-center hover:bg-muted/50" aria-label="Ações"><MoreVertical className="w-4 h-4" /></button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => onView(c)}><Eye className="w-4 h-4 mr-2" />{c.status === 'completed' ? 'Ver relatório' : 'Monitorar'}</DropdownMenuItem>
                              {(c.status === 'draft' || c.status === 'scheduled') && <DropdownMenuItem onClick={() => onEdit(c)}><Pencil className="w-4 h-4 mr-2" />Editar</DropdownMenuItem>}
                              {(c.status === 'draft' || c.status === 'scheduled') && c.total_recipients > 0 && <DropdownMenuItem onClick={() => setConfirm({ kind: 'start', c })}><Play className="w-4 h-4 mr-2" />Iniciar agora</DropdownMenuItem>}
                              {c.status === 'sending' && <DropdownMenuItem onClick={() => onPause(c.id)}><Pause className="w-4 h-4 mr-2" />Pausar</DropdownMenuItem>}
                              {c.status === 'paused' && <DropdownMenuItem onClick={() => onStart(c.id)}><Play className="w-4 h-4 mr-2" />Retomar</DropdownMenuItem>}
                              <DropdownMenuItem onClick={() => onDuplicate(c)}><Copy className="w-4 h-4 mr-2" />Duplicar</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {(c.status === 'sending' || c.status === 'paused' || c.status === 'scheduled') && <DropdownMenuItem className="text-dash-red" onClick={() => setConfirm({ kind: 'cancel', c })}><Square className="w-4 h-4 mr-2" />Cancelar campanha</DropdownMenuItem>}
                              {c.status === 'draft' && <DropdownMenuItem className="text-dash-red" onClick={() => setConfirm({ kind: 'delete', c })}><Trash2 className="w-4 h-4 mr-2" />Excluir</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 && <div className="px-4 pb-4 pt-2 border-t border-border/50"><TalkXPagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="campanhas" /></div>}
        </section>
      </div>

      {/* Rail */}
      <div className="space-y-4 min-w-0">
        <HeroCard
          icon={Zap} title="Talk X"
          subtitle="Campanhas que geram conversas e resultados."
          metrics={[
            { label: 'Mensagens enviadas', value: fmtInt(totals.reached) },
            { label: 'Taxa de sucesso', value: totals.successRate === null ? '—' : `${totals.successRate}%` },
            { label: 'Segmentos salvos', value: fmtInt(segments.length) },
          ]}
        />

        <RailCard icon={Zap} title="Ações rápidas">
          <div className="space-y-1.5">
            <RailAction icon={Plus}    color="blue"   title="Nova campanha"      subtitle="Criar do zero"          onClick={onNew} />
            <RailAction icon={FileText} color="violet" title="Usar template"      subtitle="Escolher da biblioteca" onClick={() => onGoTab('templates')} />
            <RailAction icon={Bookmark} color="green"  title="Criar segmento"     subtitle="Definir público-alvo"   onClick={() => onGoTab('segments')} />
            <RailAction icon={Upload}   color="amber"  title="Importar contatos"  subtitle="Adicionar novos"        onClick={() => onGoTab('import')} />
          </div>
        </RailCard>

        <RailCard icon={BarChart3} title="Últimas campanhas" right={<VerTodasButton onClick={clear} />}>
          {latest.length === 0 ? <p className="text-[12px] text-muted-foreground">Nenhuma campanha ainda.</p> : (
            <RecentList items={latest.map((c) => {
              const m = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.draft;
              return { id: c.id, name: c.name, statusLabel: m.label, statusTone: m.tone, pct: c.total_recipients > 0 && c.status !== 'draft' ? pct(c.sent_count+c.failed_count, c.total_recipients) : undefined, onOpen: () => onView(c) };
            })} />
          )}
        </RailCard>

        <TipCard tip="Campanhas segmentadas por ramo têm 3× mais chances de conversão." />
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="rounded-2xl border-border/70">
          <AlertDialogHeader>
            <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center mb-1', confirm?.kind === 'start' ? 'bg-primary/15 text-primary-glow' : 'bg-dash-red/15 text-dash-red')}>{confirm?.kind === 'start' ? <Play className="w-6 h-6" /> : confirm?.kind === 'cancel' ? <Square className="w-6 h-6" /> : <Trash2 className="w-6 h-6" />}</div>
            <AlertDialogTitle>{confirm?.kind === 'start' ? 'Iniciar campanha?' : confirm?.kind === 'cancel' ? 'Cancelar campanha' : 'Excluir campanha'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'start' && <>As mensagens serão enviadas agora para <b className="text-foreground">{fmtInt(confirm.c.total_recipients)} contatos</b> de “{confirm.c.name}”. Esta ação não pode ser desfeita.</>}
              {confirm?.kind === 'cancel' && <>Tem certeza que deseja cancelar a campanha <b className="text-foreground">“{confirm.c.name}”</b>? O envio será interrompido imediatamente e os contatos pendentes não receberão as mensagens.</>}
              {confirm?.kind === 'delete' && <>Tem certeza que deseja excluir a campanha <b className="text-foreground">“{confirm.c.name}”</b>? Esta ação não pode ser desfeita.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{confirm?.kind === 'cancel' ? 'Voltar' : 'Cancelar'}</AlertDialogCancel>
            <AlertDialogAction onClick={act} className={cn(confirm?.kind !== 'start' && 'bg-dash-red hover:bg-dash-red/90 text-white')}>{confirm?.kind === 'start' ? 'Iniciar envio' : confirm?.kind === 'cancel' ? 'Cancelar campanha' : 'Excluir'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function objectiveIcon(obj?: string) {
  switch (obj) {
    case 'vendas': return Target;
    case 'reativacao': return Send;
    case 'relacionamento': return Users;
    case 'pesquisa': return BarChart3;
    case 'institucional': return FileText;
    default: return Zap;
  }
}

function CampaignGridCard({ c, segmentName, onView, onEdit }: { c: TalkXCampaign; segmentName?: string; onView: () => void; onEdit: () => void }) {
  const done = c.sent_count + c.failed_count;
  const progress = pct(done, c.total_recipients);
  return (
    <div className="rounded-2xl border border-border/70 bg-input/20 p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <IconTile icon={objectiveIcon(c.objective)} color={OBJ_COLOR[c.objective ?? 'engajamento'] ?? 'blue'} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-foreground truncate">{c.name}</p>
          <p className="text-[11.5px] text-foreground-secondary line-clamp-2">{c.description || c.message_template}</p>
        </div>
        <StatusPill status={c.status} map={CAMPAIGN_STATUS} />
      </div>
      <div className="mt-3 flex items-center justify-between text-[11.5px] text-foreground-secondary">
        <span>{segmentName ?? 'Seleção manual'} · {fmtInt(c.total_recipients)} contatos</span>
        <span>{done > 0 ? `${fmtInt(c.sent_count)} enviados` : '—'}</span>
      </div>
      {done > 0 && <div className="mt-2"><ProgressBar value={progress} tone={c.status === 'completed' ? 'success' : 'info'} height={6} /></div>}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={onView} className="h-8 px-3 rounded-lg bg-primary text-white text-[12px] font-semibold flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />{c.status === 'completed' ? 'Relatório' : 'Monitorar'}</button>
        {(c.status === 'draft' || c.status === 'scheduled') && <button type="button" onClick={onEdit} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-[12px] font-medium flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" />Editar</button>}
        <span className="ml-auto text-[10.5px] text-muted-foreground">{fmtAgo(c.updated_at)}</span>
      </div>
    </div>
  );
}
