import React, { useState, useMemo } from 'react';
import {
  Plus, Bookmark, Star, StarOff, Pencil, Trash2, Zap, BarChart3, X,
  Check, RefreshCw, ChevronDown, ChevronUp, Info, Database, Search, Sliders,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DashboardKpiCard } from '@/components/dashboard/overview/DashboardKpiCard';
import { PrimaryButton, GhostButton, Pill, ProgressBar, VerTodasButton, InitialsAvatar } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { useTalkXSegments, emptyRules, newRule, RULE_FIELDS, RULE_OPS, type TalkXSegment, type SegmentRules, type SegmentRule, type SegmentRuleGroup, useAudienceEstimate, countAudience } from '@/hooks/integrations/useTalkXSegments';
import { IconTile, RailCard, MetaRow, StatusPill, TalkXEmptyState, TalkXSkeletonRows, FilterBar, TalkXPagination, Th, Td, fmtInt, fmtDateTime, fmtAgo } from './talkxShared';
import { toast } from 'sonner';

interface Props {
  onUseCampaign: (segmentId: string) => void;
}

type ViewMode = 'list' | 'edit';

export function TalkXSegments({ onUseCampaign }: Props) {
  const { segments, isLoading, isError, error, refetch, createSegment, updateSegment, deleteSegment, refreshEstimates } = useTalkXSegments();
  const [search, setSearch] = useState('');
  const [filterOrigin, setFilterOrigin] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
  const [selected, setSelected] = useState<TalkXSegment | null>(null);
  const [mode, setMode] = useState<ViewMode>('list');
  const [deleting, setDeleting] = useState<TalkXSegment | null>(null);
  const [editingRules, setEditingRules] = useState<SegmentRules>(emptyRules());
  const [editingName, setEditingName] = useState('');
  const [editingDesc, setEditingDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    let r = segments;
    if (filterOrigin !== 'all') r = r.filter((s) => s.origin === filterOrigin);
    if (filterStatus !== 'all') r = r.filter((s) => s.status === filterStatus);
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)); }
    return r;
  }, [segments, filterOrigin, filterStatus, search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totals = useMemo(() => ({
    total: segments.length,
    active: segments.filter((s) => s.status === 'active').length,
    totalContacts: segments.reduce((a, s) => a + s.estimated_count, 0),
  }), [segments]);

  const openNew = () => { setEditingName(''); setEditingDesc(''); setEditingRules(emptyRules()); setSelected(null); setMode('edit'); };
  const openEdit = (s: TalkXSegment) => { setEditingName(s.name); setEditingDesc(s.description ?? ''); setEditingRules(s.rules); setSelected(s); setMode('edit'); };

  const save = async () => {
    if (!editingName.trim()) return;
    setSaving(true);
    try {
      const count = await countAudience(editingRules);
      if (selected) await updateSegment.mutateAsync({ id: selected.id, name: editingName, description: editingDesc || null, rules: editingRules, estimated_count: count });
      else await createSegment.mutateAsync({ name: editingName, description: editingDesc || null, rules: editingRules, estimated_count: count });
      setMode('list');
    } finally { setSaving(false); }
  };

  const toggleFav = async (s: TalkXSegment) => { await updateSegment.mutateAsync({ id: s.id, is_favorite: !s.is_favorite }); };

  if (mode === 'edit') {
    return <SegmentBuilder name={editingName} setName={setEditingName} desc={editingDesc} setDesc={setEditingDesc} rules={editingRules} setRules={setEditingRules} onSave={save} onCancel={() => setMode('list')} saving={saving} isNew={!selected} />;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashboardKpiCard size="hero" index={0} label="Total de segmentos" value={String(totals.total)} delta={null} tile="blue" icon={Database} bars={null} barsColor="blue" chart="none" />
          <DashboardKpiCard size="hero" index={1} label="Ativos este mês" value={String(totals.active)} delta={null} tile="green" icon={Check} bars={null} barsColor="green" chart="none" />
          <DashboardKpiCard size="hero" index={2} label="CRM 360° conectados" value="0" delta={{ text: 'integração não configurada', tone: 'muted' }} tile="violet" icon={Database} bars={null} barsColor="violet" chart="none" />
          <DashboardKpiCard size="hero" index={3} label="Contatos cobertos" value={fmtInt(totals.totalContacts)} delta={null} tile="amber" icon={BarChart3} bars={null} barsColor="amber" chart="none" />
        </div>

        <FilterBar search={search} onSearch={setSearch} placeholder="Buscar segmentos…" selects={[
          { key: 'origin', value: filterOrigin, onChange: setFilterOrigin, label: 'Todas as origens', options: [{ value: 'zapp', label: 'ZAPP' }, { value: 'crm360', label: 'CRM 360°' }, { value: 'custom', label: 'Personalizado' }] },
          { key: 'status', value: filterStatus, onChange: setFilterStatus, label: 'Todos os status', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] },
        ]} right={<PrimaryButton icon={Plus} onClick={openNew}>Novo segmento</PrimaryButton>} />

        <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
          {isLoading ? (<div className="p-4"><TalkXSkeletonRows rows={5} /></div>)
           : segments.length === 0 ? (<div className="p-4"><TalkXEmptyState icon={Bookmark} title="Nenhum segmento salvo" description="Crie segmentos inteligentes para campanhas mais assertivas." actionLabel="Criar segmento" onAction={openNew} /></div>)
           : filtered.length === 0 ? (<div className="p-4"><TalkXEmptyState icon={Search} title="Nenhum segmento encontrado" description="Ajuste os filtros ou tente outro termo." /></div>)
           : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead className="bg-muted/20 border-b border-border/60"><tr>
                  <Th className="w-8">⭐</Th><Th>Segmento</Th><Th>Origem</Th><Th>Critérios</Th><Th>Público estimado</Th><Th>Último uso</Th><Th>Desempenho</Th><Th className="text-right">Ações</Th>
                </tr></thead>
                <tbody>
                  {paged.map((s) => (
                    <tr key={s.id} className={cn('border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors', selected?.id === s.id && 'bg-primary/5')} onClick={() => setSelected(s === selected ? null : s)}>
                      <Td><button type="button" onClick={(e) => { e.stopPropagation(); toggleFav(s); }} className="text-muted-foreground hover:text-dash-amber">{s.is_favorite ? <Star className="w-4 h-4 text-dash-amber fill-dash-amber" /> : <StarOff className="w-4 h-4" />}</button></Td>
                      <Td>
                        <p className="text-[13.5px] font-semibold text-foreground">{s.name}</p>
                        <p className="text-[11.5px] text-foreground-secondary truncate max-w-[220px]">{s.description || 'Sem descrição'}</p>
                      </Td>
                      <Td><Pill label={s.origin === 'crm360' ? 'CRM 360°' : s.origin === 'zapp' ? 'ZAPP' : 'Personalizado'} tone={s.origin === 'crm360' ? 'violet' : 'info'} /></Td>
                      <Td>
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {(s.rules?.groups ?? []).flatMap((g) => g.rules).slice(0, 3).map((r, i) => {
                            const field = RULE_FIELDS.find((f) => f.value === r.field)?.label ?? r.field;
                            return <span key={i} className="text-[10.5px] px-1.5 py-0.5 rounded bg-primary/10 text-primary-glow border border-primary/20">{field}</span>;
                          })}
                          {(s.rules?.groups ?? []).flatMap((g) => g.rules).length > 3 && <span className="text-[10.5px] text-muted-foreground">+{(s.rules?.groups ?? []).flatMap((g) => g.rules).length - 3}</span>}
                          {(s.rules?.groups ?? []).flatMap((g) => g.rules).length === 0 && <span className="text-[11px] text-muted-foreground italic">Toda a base</span>}
                        </div>
                      </Td>
                      <Td><span className="text-[14px] font-bold text-foreground">{fmtInt(s.estimated_count)}</span><span className="text-[11px] text-foreground-secondary ml-1">contatos</span></Td>
                      <Td><span className="text-[12px] text-foreground-secondary">{s.last_used_at ? fmtAgo(s.last_used_at) : 'Nunca'}</span></Td>
                      <Td><ProgressBar value={Math.min(100, (s.estimated_count / Math.max(...segments.map((x) => x.estimated_count), 1)) * 100)} tone="info" height={6} className="w-[80px]" /></Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <GhostButton size="sm" onClick={() => onUseCampaign(s.id)}>Usar em campanha</GhostButton>
                          <button type="button" onClick={() => openEdit(s)} className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50" aria-label="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                          <button type="button" onClick={() => setDeleting(s)} className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-dash-red/10 text-muted-foreground hover:text-dash-red" aria-label="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 && <div className="px-4 pb-4 pt-2 border-t border-border/50"><TalkXPagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={() => {}} noun="segmentos" /></div>}
        </section>
      </div>

      {/* Detail rail */}
      <div className="space-y-4 min-w-0">
        {selected ? (
          <SegmentDetailRail s={selected} onEdit={() => openEdit(selected)} onCampaign={() => onUseCampaign(selected.id)} onClose={() => setSelected(null)} />
        ) : (
          <RailCard icon={Bookmark} title="Selecione um segmento" subtitle="Clique em um segmento para ver os detalhes e ações disponíveis.">
            <p className="text-[12.5px] text-foreground-secondary">Os segmentos permitem direcionar suas campanhas para grupos específicos de contatos com base em regras de comportamento e dados do CRM.</p>
          </RailCard>
        )}
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 flex items-start gap-3">
          <IconTile icon={Info} size={36} color="blue" />
          <div><p className="text-[13px] font-bold text-foreground">Sugestão de IA</p><p className="text-[12px] text-foreground-secondary leading-snug">Segmentos com mais de 1.000 contatos têm 2,3× mais conversões que envios genéricos. Segmente mais sua base.</p></div>
        </div>
      </div>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl border-border/70">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir segmento?</AlertDialogTitle>
            <AlertDialogDescription>O segmento <b className="text-foreground">"{deleting?.name}"</b> será excluído permanentemente. Campanhas já criadas não serão afetadas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-dash-red hover:bg-dash-red/90 text-white" onClick={() => { if (deleting) deleteSegment.mutate(deleting.id); setDeleting(null); setSelected(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SegmentDetailRail({ s, onEdit, onCampaign, onClose }: { s: TalkXSegment; onEdit: () => void; onCampaign: () => void; onClose: () => void }) {
  const { data: est } = useAudienceEstimate(s.rules, true);
  return (
    <RailCard icon={Bookmark} color="violet" title={s.name} subtitle={s.description || 'Altíssimo valor e recorrência'}
      right={<button type="button" onClick={onClose} className="h-7 w-7 rounded-md border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50"><X className="w-4 h-4" /></button>}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Pill label={s.status === 'active' ? 'Ativo' : 'Inativo'} tone={s.status === 'active' ? 'success' : 'muted'} dot />
        <Pill label={s.is_favorite ? '⭐ Favorito' : 'Padrão'} tone={s.is_favorite ? 'warning' : 'muted'} />
      </div>
      <MetaRow label="Público estimado" value={<span className="font-bold text-[14px]">{fmtInt(est?.count ?? s.estimated_count)} contatos</span>} />
      <MetaRow label="Origem" value={s.origin === 'crm360' ? 'CRM 360°' : s.origin === 'zapp' ? 'ZAPP' : 'Personalizado'} />
      <MetaRow label="Último uso" value={s.last_used_at ? fmtDateTime(s.last_used_at) : 'Nunca'} />
      <MetaRow label="Criado em" value={fmtDateTime(s.created_at)} />
      {est?.sample && est.sample.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] text-foreground-secondary mb-1.5">Amostra de contatos</p>
          {est.sample.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-1.5">
              <InitialsAvatar name={c.name || '?'} size={28} />
              <div className="min-w-0"><p className="text-[12.5px] font-medium text-foreground truncate">{c.name}</p><p className="text-[11px] text-foreground-secondary truncate">{c.company || c.phone}</p></div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 mt-3">
        <PrimaryButton icon={Zap} onClick={onCampaign} className="w-full justify-center">Usar em campanha</PrimaryButton>
        <GhostButton icon={Pencil} onClick={onEdit} className="w-full justify-center">Editar segmento</GhostButton>
      </div>
    </RailCard>
  );
}

/* ------------------------------------------------------------------ */
/* Builder de segmento                                                */
/* ------------------------------------------------------------------ */

function SegmentBuilder({ name, setName, desc, setDesc, rules, setRules, onSave, onCancel, saving, isNew }: {
  name: string; setName: (v: string) => void; desc: string; setDesc: (v: string) => void;
  rules: SegmentRules; setRules: (r: SegmentRules) => void;
  onSave: () => void; onCancel: () => void; saving: boolean; isNew: boolean;
}) {
  const { data: est, isFetching: estFetching } = useAudienceEstimate(rules, true);
  const riskLevel = est?.count === 0 ? 'high' : (est?.count ?? 0) > 10000 ? 'low' : 'moderate';

  const addGroup = (match: 'and' | 'or') => setRules({ groups: [...rules.groups, { id: crypto.randomUUID(), match, rules: [] }] });
  const removeGroup = (gid: string) => setRules({ groups: rules.groups.filter((g) => g.id !== gid) });
  const addRule = (gid: string) => setRules({ groups: rules.groups.map((g) => g.id !== gid ? g : { ...g, rules: [...g.rules, newRule()] }) });
  const removeRule = (gid: string, rid: string) => setRules({ groups: rules.groups.map((g) => g.id !== gid ? g : { ...g, rules: g.rules.filter((r) => r.id !== rid) }) });
  const updateRule = (gid: string, rid: string, patch: Partial<SegmentRule>) => setRules({ groups: rules.groups.map((g) => g.id !== gid ? g : { ...g, rules: g.rules.map((r) => r.id !== rid ? r : { ...r, ...patch }) }) });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        {/* Header */}
        <div className="rounded-2xl bg-card border border-border/70 p-4 flex items-center gap-3">
          <button type="button" onClick={onCancel} className="h-9 w-9 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50 shrink-0"><X className="w-4 h-4" /></button>
          <IconTile icon={Bookmark} color="violet" size={48} />
          <div className="min-w-0 flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do segmento…" className="text-[18px] font-bold border-0 bg-transparent p-0 h-auto focus-visible:ring-0 text-foreground placeholder:text-muted-foreground/50" />
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Adicione uma descrição para este segmento…" className="text-[13px] border-0 bg-transparent p-0 h-auto mt-0.5 focus-visible:ring-0 text-foreground-secondary placeholder:text-muted-foreground/40" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <GhostButton onClick={onCancel}>Cancelar</GhostButton>
            <PrimaryButton icon={saving ? RefreshCw : Check} onClick={onSave} className={cn(saving && 'opacity-60 pointer-events-none', !name.trim() && 'opacity-50 pointer-events-none')}>{isNew ? 'Publicar segmento' : 'Salvar'}</PrimaryButton>
          </div>
        </div>

        {/* Construtor de regras */}
        <section className="rounded-2xl bg-card border border-border/70 p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div><p className="text-[15px] font-bold text-foreground">Regras do segmento</p><p className="text-[12.5px] text-foreground-secondary">Defina os filtros e condições para o seu segmento</p></div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setRules(emptyRules())} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-[12px] font-medium text-foreground-secondary hover:bg-muted/50 flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Limpar tudo</button>
            </div>
          </div>
          <div className="space-y-4">
            {rules.groups.map((g, gi) => (
              <div key={g.id} className="rounded-xl border border-border/60 bg-input/20 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-muted/20">
                  <span className="w-7 h-7 rounded-lg bg-primary/20 text-primary-glow text-[12px] font-bold flex items-center justify-center">{['E','O','G'][Math.min(gi,2)]}</span>
                  <p className="text-[13px] font-semibold text-foreground flex-1">Grupo {gi + 1}  <span className="text-[11px] font-normal text-foreground-secondary ml-1">— {g.match === 'and' ? 'Todas as condições devem ser atendidas (AND)' : 'Pelo menos uma condição deve ser atendida (OR)'}</span></p>
                  <Select value={g.match} onValueChange={(v) => setRules({ groups: rules.groups.map((x) => x.id !== g.id ? x : { ...x, match: v as 'and' | 'or' }) })}>
                    <SelectTrigger className="h-7 w-[60px] bg-input/40 border-border/60 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="and">AND</SelectItem><SelectItem value="or">OR</SelectItem></SelectContent>
                  </Select>
                  {rules.groups.length > 1 && <button type="button" onClick={() => removeGroup(g.id)} className="h-7 w-7 rounded-md border border-border/70 bg-input/40 flex items-center justify-center hover:text-dash-red"><X className="w-3.5 h-3.5" /></button>}
                </div>
                <div className="p-4 space-y-2.5">
                  {g.rules.map((r) => <RuleRow key={r.id} rule={r} onChange={(p) => updateRule(g.id, r.id, p)} onRemove={() => removeRule(g.id, r.id)} />)}
                  {g.rules.length === 0 && <p className="text-[12.5px] text-muted-foreground italic py-2 text-center">Nenhuma condição adicionada. Clique em + Adicionar condição.</p>}
                  <button type="button" onClick={() => addRule(g.id)} className="h-8 px-3 rounded-lg border border-dashed border-primary/40 text-primary-glow text-[12.5px] font-medium hover:bg-primary/10 flex items-center gap-1.5 w-full justify-center">+ Adicionar condição</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button type="button" onClick={() => addGroup('and')} className="h-9 px-4 rounded-xl border border-primary/30 bg-primary/10 text-primary-glow text-[12.5px] font-semibold hover:bg-primary/15 flex items-center gap-1.5">+ Adicionar grupo (AND)</button>
            <button type="button" onClick={() => addGroup('or')} className="h-9 px-4 rounded-xl border border-border/70 bg-input/30 text-foreground-secondary text-[12.5px] font-medium hover:bg-muted/50 flex items-center gap-1.5">◎ Adicionar grupo (OR)</button>
          </div>
        </section>

        {/* Filtros disponíveis */}
        <section className="rounded-2xl bg-card border border-border/70 p-4 md:p-5">
          <p className="text-[15px] font-bold text-foreground mb-1">Filtros disponíveis</p>
          <p className="text-[12.5px] text-foreground-secondary mb-3">Clique ou arraste os filtros para o construtor</p>
          <div className="flex flex-wrap gap-2">
            {(['basico','comportamento','comercial','lgpd'] as const).map((cat) => (
              <div key={cat} className="w-full">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 capitalize">{cat === 'basico' ? 'Básicos' : cat === 'comportamento' ? 'Comportamento' : cat === 'comercial' ? 'Comercial' : 'LGPD'}</p>
                <div className="flex flex-wrap gap-1.5">
                  {RULE_FIELDS.filter((f) => f.category === cat).map((f) => (
                    <button key={f.value} type="button" onClick={() => { if (rules.groups.length > 0) addRule(rules.groups[0].id); }} className="h-8 px-2.5 rounded-lg text-[12px] font-medium border border-border/60 bg-muted/30 text-foreground-secondary hover:border-primary/40 hover:bg-primary/10 hover:text-primary-glow flex items-center gap-1.5">
                      <Sliders className="w-3 h-3" />{f.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Resumo do segmento */}
      <div className="space-y-4 min-w-0">
        <RailCard icon={BarChart3} title="Resumo do segmento" right={<Pill label={estFetching ? 'Calculando…' : '● Tempo real'} tone={estFetching ? 'muted' : 'success'} />}>
          <p className="text-[11px] text-foreground-secondary">Audiência estimada</p>
          <p className="text-[32px] font-bold text-foreground tabular-nums tracking-[-0.02em]">{fmtInt(est?.count ?? 0)}</p>
          <p className="text-[12px] text-foreground-secondary">contatos</p>
          <div className="mt-3 rounded-xl border border-border/50 bg-input/20 p-3">
            <p className="text-[12.5px] font-semibold text-foreground mb-1">Risco de entrega</p>
            <Pill label={riskLevel === 'low' ? 'Baixo' : riskLevel === 'moderate' ? 'Moderado' : 'Alto'} tone={riskLevel === 'low' ? 'success' : riskLevel === 'moderate' ? 'warning' : 'danger'} dot />
            <p className="text-[11.5px] text-foreground-secondary mt-1.5">{riskLevel === 'low' ? 'Excelente potencial de entrega para campanhas no WhatsApp.' : riskLevel === 'moderate' ? 'Valide os contatos antes de lançar.' : 'Público muito pequeno — revise as regras.'}</p>
          </div>
          {est?.sample && est.sample.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] text-foreground-secondary mb-1.5">Amostra de contatos (5)</p>
              {est.sample.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1">
                  <InitialsAvatar name={c.name || '?'} size={28} />
                  <div className="min-w-0"><p className="text-[12px] font-medium text-foreground truncate">{c.name}</p><p className="text-[11px] text-foreground-secondary truncate">{c.phone}</p></div>
                </div>
              ))}
            </div>
          )}
        </RailCard>
      </div>
    </div>
  );
}

function RuleRow({ rule, onChange, onRemove }: { rule: SegmentRule; onChange: (p: Partial<SegmentRule>) => void; onRemove: () => void }) {
  const fieldDef = RULE_FIELDS.find((f) => f.value === rule.field);
  const ops = RULE_OPS[fieldDef?.kind ?? 'text'] ?? RULE_OPS.text;
  const needsValue = !['is_set', 'is_empty'].includes(rule.op);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={rule.field} onValueChange={(v) => onChange({ field: v as never, op: (RULE_OPS[RULE_FIELDS.find((f) => f.value === v)?.kind ?? 'text']?.[0]?.value ?? 'eq') as never, value: '' })}>
        <SelectTrigger className="h-9 bg-input/40 border-border/70 text-[12.5px] min-w-[160px] w-auto"><SelectValue /></SelectTrigger>
        <SelectContent>{RULE_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={rule.op} onValueChange={(v) => onChange({ op: v as never })}>
        <SelectTrigger className="h-9 bg-input/40 border-border/70 text-[12.5px] w-auto min-w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>{ops.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      {needsValue && (
        fieldDef?.options ? (
          <Select value={rule.value} onValueChange={(v) => onChange({ value: v })}>
            <SelectTrigger className="h-9 bg-input/40 border-border/70 text-[12.5px] w-auto min-w-[130px]"><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>{fieldDef.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input value={rule.value} onChange={(e) => onChange({ value: e.target.value })} placeholder={fieldDef?.kind === 'number' ? '0' : fieldDef?.kind === 'date' ? '30 (dias)' : 'Valor…'} className="h-9 bg-input/40 border-border/70 text-[12.5px] w-[130px]" />
        )
      )}
      <button type="button" onClick={onRemove} className="h-9 w-9 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:text-dash-red shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}
