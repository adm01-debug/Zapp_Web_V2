import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  Plus, Bookmark, Star, StarOff, Pencil, Trash2, Zap, BarChart3, X, MoreVertical, Users, Shield, Check, Database, Search, RefreshCw,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { PrimaryButton, GhostButton, Pill, ProgressBar, InitialsAvatar } from '@/components/dashboard/overview/DashboardCard';
import { DashboardKpiCard, type KpiDelta } from '@/components/dashboard/overview/DashboardKpiCard';
import { cn } from '@/lib/utils';
import { useTalkXSegments, emptyRules, RULE_FIELDS, RULE_OPS, useAudienceEstimate, countAudience, type TalkXSegment, type TalkXSegmentLibraryStats, type TalkXSegmentLibraryMonth, type SegmentRule } from '@/hooks/integrations/useTalkXSegments';
import { RailCard, MetaRow, TalkXEmptyState, TalkXSkeletonRows, FilterBarV2, TalkXPagination, Th, Td, KpiCard, KpiCardSkeleton, TalkXConfirmDialog, fmtInt, fmtDateTime, fmtAgo, barsByDay } from './talkxShared';
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

export function TalkXSegments({ onUseCampaign }: Props) {
  const {
    segments, isLoading, isError, error, refetch, createSegment, updateSegment, deleteSegment,
    libraryStats = null, libraryStatsLoading = false, libraryStatsError = null, refetchLibraryStats = () => {},
  } = useTalkXSegments();
  const [search, setSearch] = useState('');
  const [filterOrigin, setFilterOrigin] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [selected, setSelected] = useState<TalkXSegment | null>(null);
  const [mode, setMode] = useState<ViewMode>('list');
  const [deleting, setDeleting] = useState<TalkXSegment | null>(null);
  const [editing, setEditing] = useState<EditingSeed | null>(null);
  const [saving, setSaving] = useState(false);
  /** Linhas da tabela, para devolver o foco à linha quando o painel fecha. */
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // O painel lê o segmento pela id no cache: favoritar (ou editar) na tabela
  // reflete aqui sem novo clique. A cópia guardada em `selected` só vence
  // quando é mais nova que a da lista — é o que o Salvar devolve.
  const current = useMemo(() => {
    if (!selected) return null;
    const fromList = segments.find((x) => x.id === selected.id) ?? null;
    if (!fromList || fromList === selected) return selected;
    return Date.parse(fromList.updated_at) >= Date.parse(selected.updated_at) ? fromList : selected;
  }, [segments, selected]);

  const closeDetail = useCallback(() => {
    const id = selected?.id;
    setSelected(null);
    if (id) rowRefs.current[id]?.focus();
  }, [selected?.id]);

  const filtered = useMemo(() => {
    let r = segments;
    if (filterOrigin !== 'all') r = r.filter((s) => s.origin === filterOrigin);
    if (filterStatus !== 'all') r = r.filter((s) => s.status === filterStatus);
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)); }
    return r;
  }, [segments, filterOrigin, filterStatus, search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

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
        {/* X103/TL-135b — KPIs da biblioteca vem da RPC talkx_segment_library_stats
            (uso real no mês e conversão com base mínima); nada é somado aqui. */}
        <TalkXQueryBoundary
          query={{ isLoading: libraryStatsLoading, isError: !!libraryStatsError, error: libraryStatsError }}
          entity="as estatísticas da biblioteca"
          onRetry={() => refetchLibraryStats()}
          skeleton={<LibraryKpiSkeleton />}
          isEmpty={false}
          empty={null}
        >
          {libraryStats ? <LibraryKpis stats={libraryStats} /> : <LibraryKpiSkeleton />}
        </TalkXQueryBoundary>

        <FilterBarV2
          search={search} onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar segmentos…"
          filters={[
            { key: 'origin', label: 'Todas as origens', options: [{ value: 'zapp', label: 'ZAPP' }, { value: 'crm360', label: 'CRM 360°' }, { value: 'custom', label: 'Personalizado' }] },
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
                  <Th className="w-8">⭐</Th><Th>Segmento</Th><Th>Origem</Th><Th>Critérios</Th><Th>Público estimado</Th><Th>Último uso</Th><Th>Público relativo</Th><Th className="text-right">Ações</Th>
                </tr></thead>
                <tbody>
                  {paged.map((s) => (
                    <tr key={s.id} ref={(el) => { rowRefs.current[s.id] = el; }} tabIndex={-1} className={cn('border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors focus:outline-none focus-visible:bg-primary/5', selected?.id === s.id && 'bg-primary/5')} onClick={() => setSelected(s)}>
                      <Td><button type="button" onClick={(e) => { e.stopPropagation(); void toggleFav(s); }} aria-label={s.is_favorite ? 'Remover favorito' : 'Favoritar'} className="text-muted-foreground hover:text-dash-amber">{s.is_favorite ? <Star className="w-4 h-4 text-dash-amber fill-dash-amber" /> : <StarOff className="w-4 h-4" />}</button></Td>
                      <Td>
                        <p className="text-sm font-semibold text-foreground">{s.name}</p>
                        <p className="text-2xs text-foreground-secondary truncate max-w-[220px]">{s.description || 'Sem descrição'}</p>
                      </Td>
                      <Td><Pill label={s.origin === 'crm360' ? 'CRM 360°' : s.origin === 'zapp' ? 'ZAPP' : 'Personalizado'} tone={s.origin === 'crm360' ? 'violet' : 'info'} /></Td>
                      <Td>
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {(s.rules?.groups ?? []).flatMap((g) => g.rules).slice(0, 3).map((r, i) => {
                            const field = RULE_FIELDS.find((f) => f.value === r.field)?.label ?? r.field;
                            return <span key={i} className="text-3xs px-1.5 py-0.5 rounded bg-primary/10 text-primary-glow border border-primary/20">{field}</span>;
                          })}
                          {(s.rules?.groups ?? []).flatMap((g) => g.rules).length > 3 && <span className="text-3xs text-muted-foreground">+{(s.rules?.groups ?? []).flatMap((g) => g.rules).length - 3}</span>}
                          {(s.rules?.groups ?? []).flatMap((g) => g.rules).length === 0 && <span className="text-2xs text-muted-foreground italic">Toda a base</span>}
                        </div>
                      </Td>
                      <Td><span className="text-sm font-bold text-foreground">{fmtInt(s.estimated_count)}</span><span className="text-2xs text-foreground-secondary ml-1">contatos</span></Td>
                      <Td><span className="text-xs text-foreground-secondary">{s.last_used_at ? fmtAgo(s.last_used_at) : 'Nunca'}</span></Td>
                      <Td><ProgressBar value={Math.min(100, (s.estimated_count / Math.max(...segments.map((x) => x.estimated_count), 1)) * 100)} tone="info" height={6} className="w-[80px]" /></Td>
                      <Td className="text-right">
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 inline-flex items-center justify-center hover:bg-muted/50" aria-label="Ações"><MoreVertical className="w-4 h-4" /></button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => { setSelected(s); }}><Users className="w-4 h-4 mr-2" />Ver detalhes</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onUseCampaign(s.id)}><Zap className="w-4 h-4 mr-2" />Usar em campanha</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(s)}><Pencil className="w-4 h-4 mr-2" />Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleFav(s)}>{s.is_favorite ? <StarOff className="w-4 h-4 mr-2" /> : <Star className="w-4 h-4 mr-2" />}{s.is_favorite ? 'Remover favorito' : 'Favoritar'}</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-dash-red" onClick={() => setDeleting(s)}><Trash2 className="w-4 h-4 mr-2" />Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </Td>
                    </tr>
                  ))}
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
        {current ? (
          <SegmentDetailPanel s={current} onEdit={() => openEdit(current)} onCampaign={() => onUseCampaign(current.id)} onClose={closeDetail} />
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

/* ------------------------------------------------------------------ */
/* KPIs da biblioteca (X103)                                          */
/* ------------------------------------------------------------------ */

function LibraryKpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)}
    </div>
  );
}

const fmtDec = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Mini-barras de 8 meses: cada coluna é um mês da série da RPC. Mês sem retrato
 * gravado (`has_data` falso) fica FORA das barras em vez de virar zero — um zero
 * desenhado seria lido como "nenhum segmento naquele mês".
 */
function barsFromSeries(series: TalkXSegmentLibraryMonth[], key: 'total_segments' | 'active_segments'): number[] {
  return series.filter((m) => m.has_data).map((m) => m[key] ?? 0);
}

/** Variação relativa contra o mês anterior. Sem mês anterior (base zero) não há %. */
function variacaoMesAnterior(atual: number, anterior: number): KpiDelta {
  if (!Number.isFinite(anterior) || anterior <= 0) return null;
  return { pct: Math.round(((atual - anterior) / anterior) * 100), label: 'vs. mês anterior' };
}

function LibraryKpis({ stats }: { stats: TalkXSegmentLibraryStats }) {
  const conv = stats.conversion;
  // Abaixo da base mínima a RPC devolve has_data falso e value_pct nulo: a tela
  // mantém o card "Conversão média" e mostra o estado sem dados dentro dele,
  // nunca um percentual inventado.
  const conversaoDisponivel = conv.has_data && conv.value_pct !== null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      <DashboardKpiCard
        size="compact" index={0} label="Total de segmentos" tile="blue" icon={Database} barsColor="blue"
        value={fmtInt(stats.total_segments)} delta={null} bars={barsFromSeries(stats.series, 'total_segments')}
      />
      <DashboardKpiCard
        size="compact" index={1} label="Ativos este mês" tile="green" icon={Check} barsColor="green"
        value={fmtInt(stats.active_this_month)}
        delta={variacaoMesAnterior(stats.active_this_month, stats.active_previous_month)}
        bars={barsFromSeries(stats.series, 'active_segments')}
      />
      <DashboardKpiCard
        size="compact" index={2} label="CRM 360° conectados" tile="violet" icon={Shield} barsColor="violet" chart="none"
        value={fmtInt(stats.crm360_connected)}
        delta={variacaoMesAnterior(stats.crm360_connected, stats.crm360_previous_month)}
        bars={null}
      />
      {conversaoDisponivel ? (
        <DashboardKpiCard
          size="compact" index={3} label="Conversão média" tile="amber" icon={BarChart3} barsColor="amber" chart="none"
          value={`${fmtDec(conv.value_pct as number)}%`}
          delta={conv.delta_pp === null ? null : {
            text: `${conv.delta_pp >= 0 ? '+' : '-'}${fmtDec(Math.abs(conv.delta_pp))} p.p. vs. mês anterior`,
            tone: conv.delta_pp >= 0 ? 'success' : 'muted',
          }}
          bars={null}
        />
      ) : (
        <DashboardKpiCard
          size="compact" index={3} label="Conversão média" tile="amber" icon={BarChart3} barsColor="amber" chart="none"
          value="—"
          delta={null}
          bars={null}
          footer={(
            <p className="text-2xs leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground-secondary">Sem dados ainda</span>{' '}
              A conversão média aparece com {fmtInt(conv.min_deliveries)} entregues ou mais no mês (neste mês: {fmtInt(conv.deliveries)}).
            </p>
          )}
        />
      )}
    </div>
  );
}

/**
 * Texto legível de uma condição, para o painel de detalhes: campo + operador +
 * valor, com os rótulos canônicos de RULE_FIELDS/RULE_OPS. Operadores de período
 * viram "nos últimos N dias" / "há mais de N dias"; `is_set`/`is_empty` não têm
 * valor.
 */
function ruleChipLabel(rule: SegmentRule): string {
  const def = RULE_FIELDS.find((f) => f.value === rule.field);
  const field = def?.label ?? rule.field;
  const op = ((RULE_OPS[def?.kind ?? 'text'] ?? RULE_OPS.text).find((o) => o.value === rule.op)?.label) ?? rule.op;
  const value = rule.value.trim();
  if (rule.op === 'is_set') return `${field}: preenchido`;
  if (rule.op === 'is_empty') return `${field}: vazio`;
  if (!value) return `${field}: ${op} (incompleta)`;
  if (rule.op === 'in_last_days') return `${field} nos últimos ${value} dias`;
  if (rule.op === 'not_in_last_days') return `${field} há mais de ${value} dias`;
  return `${field} ${op} ${value}`;
}

/** De onde vem o dado do segmento. */
const ORIGIN_TEXT: Record<TalkXSegment['origin'], string> = {
  zapp: 'Dados do ZAPP, em tempo real',
  crm360: 'Dados do CRM 360°',
  custom: 'Segmento personalizado',
};

function SegmentDetailPanel({ s, onEdit, onCampaign, onClose }: { s: TalkXSegment; onEdit: () => void; onCampaign: () => void; onClose: () => void }) {
  const { data: est, isFetching, refetch } = useAudienceEstimate(s.rules, true);
  const rules = (s.rules?.groups ?? []).flatMap((g) => g.rules);
  const ativo = s.status === 'active';

  // Esc fecha o painel; o foco volta à linha porque o pai devolve no `onClose`.
  // Não fecha quando um diálogo ou menu está aberto (Radix UI marca com data-state="open")
  // nem quando o evento já foi consumido por outro handler.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.defaultPrevented) return;
      if (document.querySelector('[data-state="open"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <RailCard icon={Bookmark} color="violet" title="Detalhes do segmento"
      right={<button type="button" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)" className="h-7 w-7 rounded-md border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50"><X className="w-4 h-4" /></button>}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-foreground leading-tight break-words">{s.name}</p>
        {s.description && <p className="text-xs text-foreground-secondary mt-0.5 leading-snug">{s.description}</p>}
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <Pill label={ativo ? 'Ativo' : 'Inativo'} tone={ativo ? 'success' : 'muted'} dot />
          {s.is_favorite && <Pill label="⭐ Favorito" tone="warning" />}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-xs font-semibold text-foreground">Principais critérios</p>
          <GhostButton size="sm" icon={Pencil} onClick={onEdit}>Editar</GhostButton>
        </div>
        {rules.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Toda a base</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {rules.map((r) => (
              <span key={r.id} className="text-2xs px-2 py-0.5 rounded-full bg-primary/10 text-primary-glow border border-primary/20">{ruleChipLabel(r)}</span>
            ))}
          </div>
        )}
      </div>

      <MetaRow label="Público estimado" value={
        <span className="inline-flex items-center gap-1.5">
          <span className="font-bold text-sm">{fmtInt(est?.count ?? s.estimated_count)} contatos</span>
          <button type="button" onClick={() => void refetch()} disabled={isFetching} aria-label="Recontar público deste segmento" title="Recontar público deste segmento" className="h-6 w-6 rounded-md border border-border/70 bg-input/40 inline-flex items-center justify-center hover:bg-muted/50 disabled:opacity-50">
            <RefreshCw className={cn('w-3 h-3', isFetching && 'motion-safe:animate-spin')} />
          </button>
        </span>
      } />
      <MetaRow label="Origem e sincronização" value={ORIGIN_TEXT[s.origin] ?? ORIGIN_TEXT.custom} />
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
      {!ativo && <p className="text-2xs text-dash-amber">Segmento inativo: não pode ser usado em campanha.</p>}
      <div className="flex flex-col gap-2 mt-3">
        <PrimaryButton icon={Zap} onClick={onCampaign} className="w-full justify-center" disabled={!ativo}>Usar em campanha</PrimaryButton>
        <GhostButton icon={Pencil} onClick={onEdit} className="w-full justify-center">Editar segmento</GhostButton>
      </div>
    </RailCard>
  );
}
