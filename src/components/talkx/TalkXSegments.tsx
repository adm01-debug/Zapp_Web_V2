import { useState, useMemo } from 'react';
import {
  Plus, Bookmark, Star, StarOff, Pencil, Trash2, Zap, BarChart3, X, Users, Copy, Shield,
  Check, Database, Search, Sliders, Power, type LucideIcon,
} from 'lucide-react';

import { PrimaryButton, GhostButton, Pill, InitialsAvatar } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { useTalkXSegments, emptyRules, describeRules, type TalkXSegment, useAudienceEstimate, countAudience } from '@/hooks/integrations/useTalkXSegments';
import { RailCard, MetaRow, TalkXEmptyState, TalkXSkeletonRows, FilterBarV2, TalkXPagination, Th, Td, KpiCard, KpiCardSkeleton, TalkXConfirmDialog, EntityCell, RowActionsMenu, fmtInt, fmtDateTime, barsByDay, type PillTone, type TileColor } from './talkxShared';
import { TalkXQueryBoundary } from './kit/states';
import { TalkXSegmentBuilder } from './segments/TalkXSegmentBuilder';
import type { SegmentBuilderContent } from './segments/segmentBuilderReducer';
import { validateSegmentRules } from './segments/segmentValidation';
import { toast } from 'sonner';

interface Props {
  onUseCampaign: (segmentId: string) => void;
}

type ViewMode = 'list' | 'edit';

/** Rascunho aberto no construtor (X099): o id é o do segmento em edição, ou null no novo. */
interface EditingSeed extends SegmentBuilderContent { id: string | null }

/**
 * X115 — a linha da biblioteca mostra, por segmento, o ícone e a cor do tile e o
 * selo de origem COM ícone. `talkx_segments` não guarda `icon`/`color` (T02-027),
 * então os dois saem da origem — que é dado real da linha — em vez de serem
 * inventados por índice; `custom` é o "Segmentado" do mock (T02-031).
 */
const ORIGIN_CELL: Record<TalkXSegment['origin'], { label: string; tone: PillTone; icon: LucideIcon; color: TileColor }> = {
  crm360: { label: 'CRM 360°', tone: 'violet', icon: Database, color: 'violet' },
  zapp: { label: 'ZAPP', tone: 'info', icon: Zap, color: 'blue' },
  custom: { label: 'Segmentado', tone: 'violet', icon: Sliders, color: 'amber' },
};
const originOf = (origin: TalkXSegment['origin']) => ORIGIN_CELL[origin] ?? ORIGIN_CELL.custom;

export function TalkXSegments({ onUseCampaign }: Props) {
  const { segments, isLoading, isError, error, refetch, createSegment, updateSegment, duplicateSegment, deleteSegment, refreshEstimates } = useTalkXSegments();
  const [search, setSearch] = useState('');
  const [filterOrigin, setFilterOrigin] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [selected, setSelected] = useState<TalkXSegment | null>(null);
  const [mode, setMode] = useState<ViewMode>('list');
  const [deleting, setDeleting] = useState<TalkXSegment | null>(null);
  const [editing, setEditing] = useState<EditingSeed | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
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
    crm360: segments.filter((s) => s.origin === 'crm360').length,
    totalContacts: segments.reduce((a, s) => a + s.estimated_count, 0),
    bars: barsByDay(segments.map((s) => s.created_at)),
  }), [segments]);

  /** Nomes da biblioteca sem o próprio segmento em edição: base do aviso de nome repetido. */
  const existingNames = useMemo(
    () => segments.filter((s) => s.id !== editing?.id).map((s) => s.name),
    [segments, editing?.id],
  );

  const openNew = () => { setSelected(null); setEditing({ id: null, name: '', description: '', rules: emptyRules() }); setMode('edit'); };
  const openEdit = (s: TalkXSegment) => { setEditing({ id: s.id, name: s.name, description: s.description ?? '', rules: s.rules }); setSelected(s); setMode('edit'); };
  const closeBuilder = () => { setMode('list'); setEditing(null); };

  const save = async (draft: SegmentBuilderContent) => {
    if (saving) return;
    if (!draft.name.trim()) return;
    // Uma condição em branco não pode ir para o banco: recusa com o número exato
    // do que falta em vez de deixar o botão sem efeito e sem aviso.
    const rulesError = validateSegmentRules(draft.rules);
    if (rulesError) {
      toast.error(rulesError);
      return;
    }
    setSaving(true);
    try {
      const count = await countAudience(draft.rules);
      if (editing?.id) {
        // O rail de detalhe lê `selected`: guardar a linha devolvida pelo banco
        // evita mostrar — e reabrir no construtor — a cópia que estava em tela
        // antes de salvar.
        const saved = await updateSegment.mutateAsync({ id: editing.id, name: draft.name, description: draft.description || null, rules: draft.rules, estimated_count: count });
        setSelected(saved);
      } else {
        await createSegment.mutateAsync({ name: draft.name, description: draft.description || null, rules: draft.rules, estimated_count: count });
      }
      closeBuilder();
    } catch (e) {
      // Erro real do banco (RLS, rede) precisa chegar ao usuário.
      toast.error(`Erro ao salvar segmento: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSaving(false); }
  };

  const toggleFav = async (s: TalkXSegment) => { await updateSegment.mutateAsync({ id: s.id, is_favorite: !s.is_favorite }); };

  /** X115 — "Duplicar" cria a cópia como rascunho e abre ELA no construtor (nunca o original). */
  const duplicar = async (s: TalkXSegment) => {
    if (duplicating) return;
    setDuplicating(s.id);
    try {
      const copia = await duplicateSegment.mutateAsync(s);
      openEdit(copia);
    } catch {
      // O hook já avisa o erro no toast; a lista continua como está.
    } finally { setDuplicating(null); }
  };

  /** X115 — "Ativar/Inativar" da linha grava o status oposto ao que está em tela. */
  const toggleStatus = async (s: TalkXSegment) => {
    try {
      await updateSegment.mutateAsync({ id: s.id, status: s.status === 'active' ? 'inactive' : 'active' });
    } catch {
      // O hook já avisa o erro no toast.
    }
  };

  if (mode === 'edit' && editing) {
    return <TalkXSegmentBuilder
      initial={editing}
      isNew={!editing.id}
      saving={saving}
      existingNames={existingNames}
      onSave={(draft) => void save(draft)}
      onCancel={closeBuilder}
    />;
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">{Array.from({length:4}).map((_,i)=><KpiCardSkeleton key={i}/>)}</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            <KpiCard icon={Database} color="blue"   index={0} label="Total de segmentos"  value={fmtInt(totals.total)}        bars={totals.bars} />
            <KpiCard icon={Check}    color="green"  index={1} label="Segmentos ativos"    value={fmtInt(totals.active)} />
            <KpiCard icon={Shield}   color="violet" index={2} label="CRM 360° conectados" value={fmtInt(totals.crm360)} />
            <KpiCard icon={BarChart3} color="amber" index={3} label="Contatos cobertos"    value={fmtInt(totals.totalContacts)} />
          </div>
        )}

        <FilterBarV2
          search={search} onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar segmentos…"
          filters={[
            { key: 'origin', label: 'Todas as origens', options: [{ value: 'zapp', label: ORIGIN_CELL.zapp.label }, { value: 'crm360', label: ORIGIN_CELL.crm360.label }, { value: 'custom', label: ORIGIN_CELL.custom.label }] },
            { key: 'status', label: 'Todos os status', options: [{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }] },
          ]}
          values={{ origin: filterOrigin, status: filterStatus }}
          onFilter={(k, v) => { if (k === 'origin') setFilterOrigin(v); else setFilterStatus(v); setPage(1); }}
          hasActive={filterOrigin !== 'all' || filterStatus !== 'all' || search.trim() !== ''}
          onClear={() => { setSearch(''); setFilterOrigin('all'); setFilterStatus('all'); setPage(1); }}
          rightSlot={<PrimaryButton icon={Plus} onClick={openNew}>Novo segmento</PrimaryButton>}
        />

        <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
          <TalkXQueryBoundary
            query={{ isLoading, isError, error }}
            entity="os segmentos"
            onRetry={() => refetch()}
            skeleton={<div className="p-4"><TalkXSkeletonRows rows={5} /></div>}
            isEmpty={segments.length === 0}
            empty={<div className="p-4"><TalkXEmptyState icon={Bookmark} title="Nenhum segmento salvo" description="Crie segmentos inteligentes para campanhas mais assertivas." actionLabel="Criar segmento" onAction={openNew} /></div>}
          >
           {filtered.length === 0 ? (<div className="p-4"><TalkXEmptyState icon={Search} title="Nenhum segmento encontrado" description="Ajuste os filtros ou tente outro termo." /></div>)
           : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead className="bg-muted/20 border-b border-border/60"><tr>
                  <Th className="w-8">⭐</Th><Th>Segmento</Th><Th>Origem</Th><Th>Principais critérios (regras)</Th><Th>Público estimado</Th><Th>Último uso</Th><Th>Desempenho (última campanha)</Th><Th className="text-right">Ações</Th>
                </tr></thead>
                <tbody>
                  {paged.map((s) => {
                    const origin = originOf(s.origin);
                    const { chips, extra } = describeRules(s.rules);
                    return (
                    <tr key={s.id} tabIndex={0} aria-selected={selected?.id === s.id} onClick={() => setSelected(s)}
                      // X115 — a linha responde ao teclado: Enter abre o mesmo detalhe do clique.
                      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); setSelected(s); } }}
                      className={cn('border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40', selected?.id === s.id && 'bg-primary/5')}>
                      <Td><button type="button" onClick={(e) => { e.stopPropagation(); void toggleFav(s); }} aria-label={s.is_favorite ? 'Remover favorito' : 'Favoritar'} className="text-muted-foreground hover:text-dash-amber">{s.is_favorite ? <Star className="w-4 h-4 text-dash-amber fill-dash-amber" /> : <StarOff className="w-4 h-4" />}</button></Td>
                      <Td>
                        <EntityCell name={s.name} description={s.description || 'Sem descrição'} icon={origin.icon} color={origin.color} />
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5">
                          <origin.icon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                          <Pill label={origin.label} tone={origin.tone} />
                        </span>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1 max-w-[320px]">
                          {chips.map((chip, i) => <span key={i} className="text-3xs px-1.5 py-0.5 rounded bg-primary/10 text-primary-glow border border-primary/20">{chip}</span>)}
                          {extra.length > 0 && <span className="text-3xs px-1.5 py-0.5 rounded bg-muted/40 text-foreground-secondary border border-border/60 cursor-help" title={extra.join(' · ')}>+{extra.length}</span>}
                          {chips.length === 0 && <span className="text-2xs text-muted-foreground italic">Toda a base</span>}
                        </div>
                      </Td>
                      <Td>
                        <span className="text-sm font-bold text-foreground cursor-help" title={`Contagem gravada com o segmento · registro atualizado em ${fmtDateTime(s.updated_at)}`}>
                          {fmtInt(s.estimated_count)}<span className="text-2xs text-foreground-secondary ml-1 font-normal">contatos</span>
                        </span>
                      </Td>
                      <Td><span className="text-xs text-foreground-secondary">{s.last_used_at ? fmtDateTime(s.last_used_at) : 'Nunca usado'}</span></Td>
                      <Td><span className="text-2xs text-muted-foreground italic" title="A taxa de resposta da última campanha chega com a RPC da biblioteca (X103)">Sem dados ainda</span></Td>
                      <Td className="text-right">
                        <SegmentRowActions
                          segment={s}
                          busy={duplicating === s.id}
                          onDetails={() => setSelected(s)}
                          onEdit={() => openEdit(s)}
                          onDuplicate={() => void duplicar(s)}
                          onUseCampaign={() => onUseCampaign(s.id)}
                          onToggleFavorite={() => void toggleFav(s)}
                          onToggleStatus={() => void toggleStatus(s)}
                          onDelete={() => setDeleting(s)}
                        />
                      </Td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </TalkXQueryBoundary>
          {filtered.length > 0 && <div className="px-4 pb-4 pt-2 border-t border-border/50"><TalkXPagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="segmentos" /></div>}
        </section>
      </div>

      {/* Detail rail */}
      <div className="space-y-4 min-w-0">
        {selected ? (
          <SegmentDetailRail s={selected} onEdit={() => openEdit(selected)} onCampaign={() => onUseCampaign(selected.id)} onClose={() => setSelected(null)} />
        ) : (
          <RailCard icon={Bookmark} title="Selecione um segmento" subtitle="Clique em um segmento para ver os detalhes e ações disponíveis.">
            <p className="text-xs text-foreground-secondary">Os segmentos permitem direcionar suas campanhas para grupos específicos de contatos com base em regras de comportamento e dados do CRM.</p>
          </RailCard>
        )}
      </div>

      <TalkXConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { deleteSegment.mutate(deleting.id); setDeleting(null); setSelected(null); } }}
        icon={Trash2} iconColor="red" tone="danger"
        title="Excluir segmento?"
        description="Será excluído permanentemente. Campanhas já criadas não serão afetadas."
        entityName={deleting?.name}
        confirmLabel="Excluir segmento" cancelLabel="Cancelar"
      />
    </div>
  );
}

/**
 * X114/X115 — ações da linha da biblioteca, no menu ⋮ do kit (`RowActionsMenu`).
 * O gatilho é nomeado pela linha (leitor de tela) e o conteúdo do menu é o do
 * mock: Ver detalhes, Editar, Duplicar, Usar em campanha, Favoritar,
 * Ativar/Inativar e Excluir.
 */
function SegmentRowActions({ segment, busy, onDetails, onEdit, onDuplicate, onUseCampaign, onToggleFavorite, onToggleStatus, onDelete }: {
  segment: TalkXSegment; busy: boolean;
  onDetails: () => void; onEdit: () => void; onDuplicate: () => void; onUseCampaign: () => void;
  onToggleFavorite: () => void; onToggleStatus: () => void; onDelete: () => void;
}) {
  const ativo = segment.status === 'active';
  return (
    // O clique na linha abre o detalhe; o menu não pode disparar isso junto.
    <div onClick={(e) => e.stopPropagation()}>
      <RowActionsMenu
        label={`Ações de ${segment.name}`}
        busy={busy}
        actions={[
          { label: 'Ver detalhes', icon: Users, onSelect: onDetails },
          { label: 'Editar', icon: Pencil, onSelect: onEdit },
          { label: 'Duplicar', icon: Copy, onSelect: onDuplicate, disabled: busy },
          { label: 'Usar em campanha', icon: Zap, onSelect: onUseCampaign },
          { label: segment.is_favorite ? 'Remover favorito' : 'Favoritar', icon: segment.is_favorite ? StarOff : Star, onSelect: onToggleFavorite },
          { label: ativo ? 'Inativar' : 'Ativar', icon: Power, onSelect: onToggleStatus },
          { label: 'Excluir', icon: Trash2, danger: true, onSelect: onDelete },
        ]}
      />
    </div>
  );
}

function SegmentDetailRail({ s, onEdit, onCampaign, onClose }: { s: TalkXSegment; onEdit: () => void; onCampaign: () => void; onClose: () => void }) {
  const { data: est } = useAudienceEstimate(s.rules, true);
  return (
    <RailCard icon={Bookmark} color="violet" title={s.name} subtitle={s.description || undefined}
      right={<button type="button" onClick={onClose} aria-label="Fechar" className="h-7 w-7 rounded-md border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50"><X className="w-4 h-4" /></button>}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Pill label={s.status === 'active' ? 'Ativo' : 'Inativo'} tone={s.status === 'active' ? 'success' : 'muted'} dot />
        <Pill label={s.is_favorite ? '⭐ Favorito' : 'Padrão'} tone={s.is_favorite ? 'warning' : 'muted'} />
      </div>
      <MetaRow label="Público estimado" value={<span className="font-bold text-sm">{fmtInt(est?.count ?? s.estimated_count)} contatos</span>} />
      <MetaRow label="Origem" value={originOf(s.origin).label} />
      <MetaRow label="Último uso" value={s.last_used_at ? fmtDateTime(s.last_used_at) : 'Nunca'} />
      <MetaRow label="Criado em" value={fmtDateTime(s.created_at)} />
      {est?.sample && est.sample.length > 0 && (
        <div className="mt-2">
          <p className="text-2xs text-foreground-secondary mb-1.5">Amostra de contatos</p>
          {est.sample.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-1.5">
              <InitialsAvatar name={c.name || '?'} size={28} />
              <div className="min-w-0"><p className="text-xs font-medium text-foreground truncate">{c.name}</p><p className="text-2xs text-foreground-secondary truncate">{c.company || c.phone}</p></div>
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
