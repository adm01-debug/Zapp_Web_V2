import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ShieldBan, Plus, Trash2, Search, UserX, ShieldCheck, AlertTriangle, Pencil } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DashboardKpiCard } from '@/components/dashboard/overview/DashboardKpiCard';
import { PrimaryButton, GhostButton, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/performance/useTimingHooks';
import {
  useTalkXSuppression,
  useSuppressionContactSearch,
  SUPPRESSION_PAGE_SIZES,
  type SuppressionRow,
  type SuppressionStatus,
} from '@/hooks/integrations/useTalkXSuppression';
import { RailCard, TalkXEmptyState, TalkXSkeletonRows, FilterBarV2, TalkXPagination, SUPPRESSION_ORIGIN, Th, Td, fmtInt, fmtDateTime } from './talkxShared';
import { TalkXQueryBoundary, TalkXNoPermissionState } from './kit/states';
import { useTalkXFilterState } from './kit/useFilterState';

const REASONS = ['Opt-out solicitado', 'Número inválido / bounce', 'Reclamação de spam', 'Sem permissão comercial', 'LGPD / revogação de consentimento', 'Bloqueio manual', 'Outro'];

/** Teto de contatos devolvidos na busca do modal (mesmo padrão do SLARuleFormDialog). */
const ADD_CONTACT_LIST_LIMIT = 50;
const CONTACT_SEARCH_DEBOUNCE_MS = 300;

/** Situação da linha na tela — o servidor guarda datas, a tela mostra o rótulo. */
const STATUS_META: Record<SuppressionStatus, { label: string; tone: 'danger' | 'warning' | 'muted' }> = {
  suprimido: { label: 'Suprimido', tone: 'danger' },
  expirado: { label: 'Expirado', tone: 'warning' },
  removido: { label: 'Removido', tone: 'muted' },
};

/** `+55 11 98765-4321` a partir do que estiver gravado (contato ou telefone avulso). */
function formatSuppressionPhone(raw: string | null): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const local = digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  if (local.length === 11) return `+55 ${local.slice(0, 2)} ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `+55 ${local.slice(0, 2)} ${local.slice(2, 6)}-${local.slice(6)}`;
  return `+${digits}`;
}

/** Iniciais do contato (no máximo 2) para o avatar de texto. */
function contactInitials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TalkXSuppression() {
  const { values: filterValues, setValue: setFilterValue, query: search, setQuery: setSearch, hasActive, clear: clearFilters } = useTalkXFilterState('talkx.suppression.filters', { origin: 'all', motivo: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(SUPPRESSION_PAGE_SIZES[0]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<SuppressionRow | null>(null);
  const [removing, setRemoving] = useState<SuppressionRow | null>(null);
  const [addContactId, setAddContactId] = useState('');
  const [addReason, setAddReason] = useState(REASONS[0]);
  const [addCustomReason, setAddCustomReason] = useState('');
  const [addOrigin, setAddOrigin] = useState<'manual' | 'lgpd'>('manual');
  const [contactSearch, setContactSearch] = useState('');
  const debouncedContactSearch = useDebounce(contactSearch.trim(), CONTACT_SEARCH_DEBOUNCE_MS);

  const {
    rows, total, totals, isLoading, isError, error, isPermissionError, refetch,
    addEntry, updateEntry, removeEntry,
  } = useTalkXSuppression({
    page,
    pageSize,
    search,
    origin: filterValues.origin,
    reason: filterValues.motivo,
  });

  const { data: nonBlocked = [] } = useSuppressionContactSearch(debouncedContactSearch, showAdd);

  const filterDefs = useMemo(() => [
    { key: 'origin', label: 'Todas as origens', allLabel: 'Todas as origens', options: Object.entries(SUPPRESSION_ORIGIN).map(([v, m]) => ({ value: v, label: m.label })) },
  ], []);

  const editReasonOptions = useMemo(() => (REASONS.includes(editing?.reason ?? '') ? REASONS : [...REASONS, editing?.reason ?? '']), [editing]);
  const [editReason, setEditReason] = useState('');
  const [editOrigin, setEditOrigin] = useState<'manual' | 'lgpd'>('manual');

  const openEdit = (row: SuppressionRow) => {
    setEditing(row);
    setEditReason(row.reason ?? REASONS[0]);
    setEditOrigin(row.origin === 'lgpd' ? 'lgpd' : 'manual');
  };

  const submitEdit = () => {
    if (!editing) return;
    updateEntry.mutate(
      { id: editing.id, reason: editReason, origin: editOrigin },
      { onSuccess: () => setEditing(null) },
    );
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashboardKpiCard size="hero" index={0} label="Contatos suprimidos" value={fmtInt(totals.total)} delta={null} tile="red" icon={UserX} bars={null} barsColor="red" chart="none" />
          <DashboardKpiCard size="hero" index={1} label="Opt-outs 30 dias" value={fmtInt(totals.optouts30d)} delta={null} tile="red" icon={ShieldBan} bars={null} barsColor="red" chart="none" />
          <DashboardKpiCard size="hero" index={2} label="Bloqueios manuais" value={fmtInt(totals.manual)} delta={null} tile="amber" icon={UserX} bars={null} barsColor="amber" chart="none" />
          <DashboardKpiCard size="hero" index={3} label="Campanhas protegidas" value="—" delta={{ text: 'aplicação automática', tone: 'success' }} tile="green" icon={ShieldCheck} bars={null} barsColor="green" chart="none" />
        </div>

        <FilterBarV2
          search={search} onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar por contato, telefone ou e-mail…"
          filters={filterDefs} values={filterValues} onFilter={(k, v) => { setFilterValue(k as 'origin' | 'motivo', v); setPage(1); }}
          hasActive={hasActive} onClear={() => { clearFilters(); setPage(1); }}
          rightSlot={<PrimaryButton icon={Plus} onClick={() => setShowAdd(true)}>Adicionar contato</PrimaryButton>}
        />

        <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
          {isPermissionError ? (
            <div className="p-4">
              <TalkXNoPermissionState
                title="Você não tem permissão para ver a lista de supressão"
                description="A lista de supressão é restrita a administradores e supervisores. Solicite acesso ao seu administrador."
              />
            </div>
          ) : (
            <TalkXQueryBoundary
              query={{ isLoading, isError, error }}
              entity="os contatos suprimidos"
              onRetry={() => refetch()}
              skeleton={<div className="p-4"><TalkXSkeletonRows rows={5} /></div>}
              isEmpty={total === 0 && !hasActive && !search.trim()}
              empty={<div className="p-4"><TalkXEmptyState icon={ShieldCheck} title="Nenhum contato na lista de supressão" description="Contatos suprimidos são automaticamente excluídos de todos os envios de campanhas, segmentos e automações." /></div>}
            >
              {rows.length === 0 ? (<div className="p-4"><TalkXEmptyState icon={Search} title="Nenhum resultado" /></div>)
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse">
                      <thead className="bg-muted/20 border-b border-border/60"><tr>
                        <Th>Contato</Th><Th>Telefone</Th><Th>Origem</Th><Th>Motivo</Th><Th>Campanha</Th><Th>Data</Th><Th>Status</Th><Th className="text-right">Ações</Th>
                      </tr></thead>
                      <tbody>
                        {rows.map((b) => {
                          const om = SUPPRESSION_ORIGIN[b.origin] ?? { label: b.origin, tone: 'muted' as const };
                          const phone = formatSuppressionPhone(b.contact_phone ?? b.phone);
                          const status = STATUS_META[b.status];
                          return (
                            <tr key={b.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                              <Td>
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-dash-red/10 flex items-center justify-center text-xs font-bold text-dash-red shrink-0">
                                    {b.contact_avatar_url
                                      ? <img src={b.contact_avatar_url} alt="" className="w-full h-full rounded-full object-cover" loading="lazy" decoding="async" />
                                      : contactInitials(b.contact_name)}
                                  </div>
                                  <div className="min-w-0">
                                    {b.contact_name
                                      ? (<>
                                        <p className="text-[13px] font-medium text-foreground truncate">{b.contact_name}</p>
                                        <p className="text-2xs text-foreground-secondary truncate">{b.contact_email ?? '—'}</p>
                                      </>)
                                      : (<>
                                        <p className="text-[13px] font-medium text-foreground-secondary">Sem contato vinculado</p>
                                        <p className="text-2xs text-foreground-secondary truncate">{phone ?? '—'}</p>
                                      </>)}
                                  </div>
                                </div>
                              </Td>
                              <Td><span className="text-xs text-foreground-secondary">{phone ?? '—'}</span></Td>
                              <Td><Pill label={om.label} tone={om.tone} /></Td>
                              <Td><Pill label={b.reason || '—'} tone={om.tone} /></Td>
                              <Td><span className="text-xs text-foreground-secondary max-w-[180px] block truncate">{b.campaign_name ?? '—'}</span></Td>
                              <Td><span className="text-xs text-foreground-secondary">{fmtDateTime(b.created_at)}</span></Td>
                              <Td><Pill label={status.label} tone={status.tone} dot /></Td>
                              <Td className="text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button type="button" onClick={() => openEdit(b)} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium text-foreground-secondary hover:bg-muted/50 flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" />Editar</button>
                                  <button type="button" onClick={() => setRemoving(b)} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium text-foreground-secondary hover:bg-dash-red/10 hover:text-dash-red flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Remover</button>
                                </div>
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
            </TalkXQueryBoundary>
          )}
          {!isPermissionError && total > 0 && (
            <div className="px-4 pb-4 pt-2 border-t border-border/50">
              <TalkXPagination
                page={page} pageSize={pageSize} total={total}
                onPage={setPage}
                onPageSize={(n) => { setPageSize(n); setPage(1); }}
                noun="contatos suprimidos"
              />
            </div>
          )}
        </section>
      </div>

      {/* Centro de proteção */}
      <div className="space-y-4 min-w-0">
        <RailCard icon={ShieldCheck} color="green" title="Centro de proteção" subtitle="Mais segurança para suas campanhas" glow>
          <div className="rounded-xl bg-dash-green/10 border border-dash-green/30 p-3 text-center mb-3">
            <p className="text-4xl font-bold text-foreground tabular-nums">{fmtInt(totals.total)}</p>
            <p className="text-xs text-foreground-secondary">campanhas protegidas automaticamente</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            {[[fmtInt(totals.total), 'Suprimidos'], [fmtInt(totals.optouts30d), 'Opt-outs'], [fmtInt(totals.manual), 'Manuais'], ['0', 'LGPD']].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-muted/30 border border-border/50 py-2"><p className="text-sm font-bold text-foreground">{v}</p><p className="text-3xs text-foreground-secondary">{l}</p></div>
            ))}
          </div>
        </RailCard>
        <div className="rounded-xl border border-dash-amber/30 bg-dash-amber/10 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-dash-amber shrink-0 mt-0.5" />
          <p className="text-xs text-foreground-secondary">Contatos suprimidos são automaticamente excluídos de <b className="text-foreground">todos</b> os envios de campanhas, segmentos e automações. <a href="#" className="text-primary-glow hover:underline">Saiba mais →</a></p>
        </div>
      </div>

      {/* Modal adicionar */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="rounded-2xl border-border/70 max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Adicionar à Lista de Supressão</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-foreground-secondary">Buscar contato</Label>
              <Input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Nome ou telefone…" className="mt-1.5 bg-input/40 border-border/70" />
              <div className="max-h-40 overflow-auto mt-2 rounded-lg border border-border/60 divide-y divide-border/50">
                {nonBlocked.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum contato encontrado</p>
                  : nonBlocked.map((c) => (
                    <button key={c.id} onClick={() => setAddContactId(c.id)} className={cn('w-full text-left px-3 py-2 text-sm transition-colors', addContactId === c.id ? 'bg-primary/10' : 'hover:bg-muted/50')}>
                      <span className="font-medium">{c.name}</span><span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>
                    </button>
                  ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-foreground-secondary">Origem</Label>
              <div className="flex gap-2 mt-1.5">
                {(['manual', 'lgpd'] as const).map((o) => <button key={o} type="button" onClick={() => setAddOrigin(o)} className={cn('h-8 px-3 rounded-lg border text-xs font-medium', addOrigin === o ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 text-muted-foreground hover:bg-muted/50')}>{o === 'manual' ? 'Manual' : 'LGPD'}</button>)}
              </div>
            </div>
            <div>
              <Label className="text-xs text-foreground-secondary">Motivo</Label>
              <Select value={addReason} onValueChange={setAddReason}>
                <SelectTrigger className="mt-1.5 bg-input/40 border-border/70"><SelectValue /></SelectTrigger>
                <SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
              {addReason === 'Outro' && <Textarea value={addCustomReason} onChange={(e) => setAddCustomReason(e.target.value)} placeholder="Descreva o motivo…" className="mt-2 bg-input/40 border-border/70" rows={2} />}
            </div>
          </div>
          <DialogFooter>
            <GhostButton onClick={() => setShowAdd(false)}>Cancelar</GhostButton>
            <PrimaryButton icon={ShieldBan} onClick={() => addEntry.mutate({ contact_id: addContactId, reason: addReason === 'Outro' ? addCustomReason || 'Outro' : addReason, origin: addOrigin }, { onSuccess: () => { setShowAdd(false); setAddContactId(''); setAddReason(REASONS[0]); } })} className={cn((!addContactId || addEntry.isPending) && 'opacity-50 pointer-events-none')}>Bloquear</PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal editar */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-2xl border-border/70 max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Editar supressão</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-foreground-secondary">Contato</Label>
              <p className="text-sm text-foreground mt-1">{editing?.contact_name ?? 'Sem contato vinculado'}</p>
            </div>
            <div>
              <Label className="text-xs text-foreground-secondary">Origem</Label>
              <div className="flex gap-2 mt-1.5">
                {(['manual', 'lgpd'] as const).map((o) => <button key={o} type="button" onClick={() => setEditOrigin(o)} className={cn('h-8 px-3 rounded-lg border text-xs font-medium', editOrigin === o ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 text-muted-foreground hover:bg-muted/50')}>{o === 'manual' ? 'Manual' : 'LGPD'}</button>)}
              </div>
            </div>
            <div>
              <Label className="text-xs text-foreground-secondary">Motivo</Label>
              <Select value={editReason} onValueChange={setEditReason}>
                <SelectTrigger className="mt-1.5 bg-input/40 border-border/70"><SelectValue /></SelectTrigger>
                <SelectContent>{editReasonOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <GhostButton onClick={() => setEditing(null)}>Cancelar</GhostButton>
            <PrimaryButton icon={Pencil} onClick={submitEdit} className={cn(updateEntry.isPending && 'opacity-50 pointer-events-none')}>Salvar</PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent className="rounded-2xl border-border/70">
          <AlertDialogHeader><AlertDialogTitle>Remover da lista de supressão?</AlertDialogTitle><AlertDialogDescription><b className="text-foreground">{removing?.contact_name ?? 'Este contato'}</b> poderá receber mensagens do Talk X nas próximas campanhas.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => removing && removeEntry.mutate(removing.id, { onSuccess: () => setRemoving(null) })}>Remover</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
