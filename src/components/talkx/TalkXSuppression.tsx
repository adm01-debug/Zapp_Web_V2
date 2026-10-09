import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import { useDebounce } from '@/hooks/performance/useTimingHooks';
import { useAuth } from '@/hooks/auth/useAuth';
// X181: "Ver contato" usa o mesmo mecanismo de produto que as Tarefas e o
// Catálogo já usam (evento `open-contact-chat` + view do inbox). O TalkXView
// pode sobrescrever passando `onOpenContact`.
import { openContactChat } from '@/components/catalog/useSendProduct';
import { toast } from 'sonner';
import { ShieldBan, Plus, Trash2, Search, UserX, ShieldCheck, Settings, X, AlertTriangle, Pencil, Eye, Megaphone, RotateCcw, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DashboardKpiCard } from '@/components/dashboard/overview/DashboardKpiCard';
import { PrimaryButton, GhostButton, InitialsAvatar, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { IconTile, RailCard, MetaRow, StatusPill, TalkXEmptyState, TalkXSkeletonRows, FilterBarV2, TalkXPagination, TalkXBulkBar, RowActionsMenu, TalkXConfirmDialog, SUPPRESSION_ORIGIN, Th, Td, fmtInt, fmtDateTime, barsByDay, type RowAction } from './talkxShared';
import { TalkXQueryBoundary } from './kit/states';
import { useTalkXFilterState } from './kit/useFilterState';

type ReasonCode = 'opt_out' | 'invalid_number' | 'manual' | 'lgpd' | 'no_commercial_permission' | 'bounce';
type SuppressionStatus = 'suprimido' | 'expirado' | 'removido';
type ExpiryChoice = 'never' | '30' | '90' | 'date';

interface BlacklistEntry {
  id: string;
  contact_id: string | null;
  /** Telefone da própria supressão: preenchido quando o bloqueio é feito sem contato (eixo do telefone). */
  phone: string | null;
  reason: string | null;
  reason_code: ReasonCode | null;
  blocked_by: string | null;
  created_at: string;
  origin: string;
  campaign_id: string | null;
  expires_at: string | null;
  removed_by: string | null;
  removed_at: string | null;
  contacts: { name: string; phone: string; company: string | null; avatar_url: string | null } | null;
}

const REASONS = ['Opt-out solicitado', 'Número inválido / bounce', 'Reclamação de spam', 'Sem permissão comercial', 'LGPD / revogação de consentimento', 'Bloqueio manual', 'Outro'];

// Motivos do enum do banco (`talkx_blacklist_reason`, M:20260910090000) com os
// rótulos que esta tela já usa. A edição grava os dois: `reason_code` (enum, o
// que o motor lê) e `reason` (texto, o que a coluna Motivo mostra).
const REASON_CODES: { code: ReasonCode; label: string }[] = [
  { code: 'opt_out', label: 'Opt-out solicitado' },
  { code: 'invalid_number', label: 'Número inválido / bounce' },
  { code: 'bounce', label: 'Bounce do provedor' },
  { code: 'no_commercial_permission', label: 'Sem permissão comercial' },
  { code: 'lgpd', label: 'LGPD / revogação de consentimento' },
  { code: 'manual', label: 'Bloqueio manual' },
];

// Suprimido/Expirado/Removido — só as cores que o sistema já tem (tokens do Pill).
const SUPPRESSION_STATUS: Record<SuppressionStatus, { label: string; tone: 'danger' | 'warning' | 'muted' }> = {
  suprimido: { label: 'Suprimido', tone: 'danger' },
  expirado: { label: 'Expirado', tone: 'warning' },
  removido: { label: 'Removido', tone: 'muted' },
};

/**
 * Situação da linha: removida (soft delete `removed_at`) vence a expiração;
 * `expires_at` no passado é Expirado (não conta como supressão ativa).
 */
function suppressionStatus(entry: Pick<BlacklistEntry, 'removed_at' | 'expires_at'>, now: number = Date.now()): SuppressionStatus {
  if (entry.removed_at) return 'removido';
  if (entry.expires_at && new Date(entry.expires_at).getTime() <= now) return 'expirado';
  return 'suprimido';
}

/** Opt-out/LGPD exige confirmação explícita na remoção (decisão N13). */
function requiresRemovalConfirmation(entry: Pick<BlacklistEntry, 'origin' | 'reason_code'>): boolean {
  return entry.origin === 'optout' || entry.origin === 'lgpd'
    || entry.reason_code === 'opt_out' || entry.reason_code === 'lgpd';
}

/** Telefone do contato vinculado; cai no telefone gravado quando a linha é avulsa. */
function displayPhone(entry: Pick<BlacklistEntry, 'phone' | 'contacts'>): string {
  const digits = (entry.contacts?.phone ?? entry.phone ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : '—';
}

function displayName(entry: Pick<BlacklistEntry, 'phone' | 'contacts'>): string {
  return entry.contacts?.name ?? displayPhone(entry);
}

/** Expiração escolhida no modal → valor de `expires_at` (null = nunca expira). */
function expiryToIso(choice: ExpiryChoice, date: string, now: number = Date.now()): string | null {
  if (choice === 'never') return null;
  if (choice === 'date') {
    if (!date) return null;
    const parsed = new Date(`${date}T23:59:59.999`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return new Date(now + Number(choice) * 24 * 60 * 60 * 1000).toISOString();
}

// Teto de contatos devolvidos na busca do modal (mesmo padrão do SLARuleFormDialog)
// e espera antes de ir ao servidor, para não disparar uma consulta por tecla.
const ADD_CONTACT_LIST_LIMIT = 50;
const CONTACT_SEARCH_DEBOUNCE_MS = 300;

const EMPTY_SELECTION: ReadonlySet<string> = new Set<string>();

export function TalkXSuppression({ onOpenContact, onOpenCampaign }: {
  /** Abre a conversa do contato; vem do TalkXView (padrão: mecanismo do produto). */
  onOpenContact?: (contactId: string) => void;
  /** Abre a campanha de origem; vem do TalkXView. Sem ele a ação fica desabilitada. */
  onOpenCampaign?: (campaignId: string) => void;
} = {}) {
  const qc = useQueryClient();
  const { values: filterValues, setValue: setFilterValue, query: search, setQuery: setSearch, hasActive, clear: clearFilters } = useTalkXFilterState('talkx.suppression.filters', { origin: 'all', motivo: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showAdd, setShowAdd] = useState(false);
  const [removing, setRemoving] = useState<{ ids: string[]; entries: BlacklistEntry[] } | null>(null);
  const [editing, setEditing] = useState<{ ids: string[]; bulk: boolean } | null>(null);
  const [addContactId, setAddContactId] = useState('');
  const [addReason, setAddReason] = useState(REASONS[0]);
  const [addCustomReason, setAddCustomReason] = useState('');
  const [addOrigin, setAddOrigin] = useState<'manual'|'lgpd'>('manual');
  const [contactSearch, setContactSearch] = useState('');
  const [editReason, setEditReason] = useState<ReasonCode>('manual');
  const [editExpiry, setEditExpiry] = useState<ExpiryChoice>('never');
  const [editDate, setEditDate] = useState('');
  const debouncedContactSearch = useDebounce(contactSearch.trim(), CONTACT_SEARCH_DEBOUNCE_MS);

  // A seleção em massa vale para a página visitada: guardar a chave (página,
  // tamanho, busca e filtros) junto dos ids faz a marcação sumir sozinha quando
  // qualquer um muda — sem efeito de sincronização.
  const selectionKey = `${page}|${pageSize}|${search}|${filterValues.origin}|${filterValues.motivo}`;
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: selectionKey, ids: new Set<string>() });
  const selected: ReadonlySet<string> = selection.key === selectionKey ? selection.ids : EMPTY_SELECTION;
  const setSelectedIds = (ids: Set<string>) => setSelection({ key: selectionKey, ids });

  const { data: blacklist = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['talkx-blacklist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_blacklist')
        .select('*, contacts:contact_id(name, phone, company, avatar_url)')
        .is('removed_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BlacklistEntry[];
    },
  });

  const { data: availableContacts = [] } = useQuery({
    queryKey: ['contacts-for-blacklist', debouncedContactSearch],
    queryFn: async () => {
      let query = supabase.from('contacts').select('id, name, phone, company').not('phone', 'is', null);
      if (debouncedContactSearch) {
        const term = escapeOrFilterValue(`%${debouncedContactSearch}%`);
        query = query.or(`name.ilike.${term},phone.ilike.${term}`);
      }
      const { data } = await query.order('name').limit(ADD_CONTACT_LIST_LIMIT);
      return data || [];
    },
    enabled: showAdd,
  });

  const blacklistedIds = useMemo(() => new Set(blacklist.map((b) => b.contact_id)), [blacklist]);
  const nonBlocked = useMemo(() => availableContacts.filter((c) => !blacklistedIds.has(c.id)), [availableContacts, blacklistedIds]);

  const filtered = useMemo(() => {
    let r = blacklist;
    if (filterValues.origin !== 'all') r = r.filter((b) => b.origin === filterValues.origin);
    if (filterValues.motivo !== 'all') r = r.filter((b) => (b.reason ?? '').toLowerCase().includes(filterValues.motivo.toLowerCase()));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      // Busca de telefone (só dígitos e pontuação): o número da supressão fica gravado em
      // dígitos, então é preciso normalizar o termo para encontrar um bloqueio feito só
      // por telefone — sem isso, qualquer busca com dígito casaria por acidente.
      const qDigits = q.replace(/\D/g, '');
      const phoneQuery = qDigits.length > 0 && /^[\d\s()+.-]+$/.test(q);
      r = r.filter((b) =>
        b.contacts?.name?.toLowerCase().includes(q)
        || b.contacts?.phone?.includes(q)
        || (phoneQuery && (b.phone ?? '').includes(qDigits))
        || (b.reason ?? '').toLowerCase().includes(q));
    }
    return r;
  }, [blacklist, filterValues.origin, filterValues.motivo, search]);

  const filterDefs = useMemo(() => [
    { key: 'origin', label: 'Todas as origens', allLabel: 'Todas as origens', options: Object.entries(SUPPRESSION_ORIGIN).map(([v, m]) => ({ value: v, label: m.label })) },
  ], []);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totals = useMemo(() => ({
    total: blacklist.length,
    optouts: blacklist.filter((b) => b.origin === 'optout').length,
    manual: blacklist.filter((b) => b.origin === 'manual').length,
    bars: barsByDay(blacklist.map((b) => b.created_at)),
  }), [blacklist]);

  // Autoria sai do perfil ativo (profiles.id), como em useTalkXSegments: as
  // colunas blocked_by/removed_by referenciam profiles(id) e o id do
  // auth.users nao e o mesmo id — 0 dos 6 perfis tem id = user_id (conferido
  // no banco canonico), entao gravar auth.uid() violava a FK e o "Adicionar
  // contato" da supressao falhava em producao (P1-4 da auditoria).
  const { profile } = useAuth();

  const invalidateList = () => qc.invalidateQueries({ queryKey: ['talkx-blacklist'] });

  const addMutation = useMutation({
    mutationFn: async () => {
      const finalReason = addReason === 'Outro' ? addCustomReason || 'Outro' : addReason;
      const { error } = await fromTable('talkx_blacklist').insert({ contact_id: addContactId, reason: finalReason, blocked_by: profile?.id ?? null, origin: addOrigin });
      if (error) throw error;
    },
    onSuccess: () => { invalidateList(); toast.success('Contato adicionado à lista de supressão'); setShowAdd(false); setAddContactId(''); setAddReason(REASONS[0]); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  /** Toda alteração da lista é uma única atualização por ids (1 ou N linhas). */
  const updateEntries = async (ids: string[], payload: Record<string, unknown>) => {
    const { error } = await fromTable('talkx_blacklist').update(payload).in('id', ids);
    if (error) throw error;
  };

  // "Desfazer" do aviso de remoção (10 s): devolve a linha ao estado ativo.
  const restoreMutation = useMutation({
    mutationFn: async (ids: string[]) => updateEntries(ids, { removed_by: null, removed_at: null }),
    onSuccess: () => { invalidateList(); toast.success('Contato de volta à lista de supressão'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const removeMutation = useMutation({
    mutationFn: async (ids: string[]) => updateEntries(ids, { removed_by: profile?.id ?? null, removed_at: new Date().toISOString() }),
    onSuccess: (_data, ids) => {
      invalidateList();
      setRemoving(null);
      setSelectedIds(new Set<string>());
      toast.success(ids.length > 1 ? `${ids.length} contatos removidos da lista de supressão` : 'Contato removido da lista de supressão', {
        duration: 10000,
        action: { label: 'Desfazer', onClick: () => restoreMutation.mutate(ids) },
      });
    },
    onError: (e: Error) => { setRemoving(null); toast.error(`Erro: ${e.message}`); },
  });

  // Reativar vale para Removido (volta ao ativo) e Expirado (ganha prazo novo).
  const reactivateMutation = useMutation({
    mutationFn: async (entry: BlacklistEntry) => updateEntries([entry.id], { removed_by: null, removed_at: null, expires_at: null }),
    onSuccess: () => { invalidateList(); toast.success('Supressão reativada'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const editMutation = useMutation({
    mutationFn: async (input: { ids: string[]; reason: string; reason_code: ReasonCode; expires_at: string | null }) =>
      updateEntries(input.ids, { reason: input.reason, reason_code: input.reason_code, expires_at: input.expires_at }),
    onSuccess: () => { invalidateList(); setEditing(null); toast.success('Supressão atualizada'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const openEdit = (entry: BlacklistEntry) => {
    setEditReason(entry.reason_code ?? 'manual');
    if (entry.expires_at) {
      setEditExpiry('date');
      setEditDate(entry.expires_at.slice(0, 10));
    } else {
      setEditExpiry('never');
      setEditDate('');
    }
    setEditing({ ids: [entry.id], bulk: false });
  };

  const openBulkEdit = () => {
    setEditReason('manual');
    setEditExpiry('never');
    setEditDate('');
    setEditing({ ids: [...selected], bulk: true });
  };

  const saveEdit = () => {
    if (!editing) return;
    const label = REASON_CODES.find((r) => r.code === editReason)?.label ?? editReason;
    editMutation.mutate({ ids: editing.ids, reason: label, reason_code: editReason, expires_at: expiryToIso(editExpiry, editDate) });
  };

  const openRemove = (entries: BlacklistEntry[]) => setRemoving({ ids: entries.map((e) => e.id), entries });

  const rowActions = (b: BlacklistEntry): RowAction[] => {
    const status = suppressionStatus(b);
    const actions: RowAction[] = [
      { label: 'Editar motivo e expiração', icon: Pencil, onSelect: () => openEdit(b) },
      // Telefone avulso não tem contato para abrir.
      { label: 'Ver contato', icon: Eye, onSelect: () => (onOpenContact ?? openContactChat)(b.contact_id as string), disabled: !b.contact_id },
    ];
    if (b.campaign_id) actions.push({ label: 'Ver campanha', icon: Megaphone, onSelect: () => onOpenCampaign?.(b.campaign_id as string), disabled: !onOpenCampaign });
    if (status !== 'suprimido') actions.push({ label: 'Reativar', icon: RotateCcw, onSelect: () => reactivateMutation.mutate(b) });
    actions.push({ label: 'Remover da lista', icon: Trash2, danger: true, onSelect: () => openRemove([b]) });
    return actions;
  };

  const pageIds = paged.map((b) => b.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAllOnPage = () => {
    const next = new Set(selected);
    if (allOnPageSelected) pageIds.forEach((id) => next.delete(id)); else pageIds.forEach((id) => next.add(id));
    setSelectedIds(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const selectedEntries = blacklist.filter((b) => selected.has(b.id));
  const removingEntries = removing?.entries ?? [];
  const removingIsBulk = removingEntries.length > 1;
  const removingNeedsCheck = removingEntries.some(requiresRemovalConfirmation);
  const removingDetails = removing && !removingIsBulk
    ? [{ label: 'Telefone', value: displayPhone(removingEntries[0]) }, { label: 'Motivo', value: removingEntries[0].reason ?? '—' }]
    : [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashboardKpiCard size="hero" index={0} label="Contatos suprimidos" value={fmtInt(totals.total)} delta={null} tile="red" icon={UserX} bars={totals.bars} barsColor="red" />
          <DashboardKpiCard size="hero" index={1} label="Opt-outs 30 dias" value={fmtInt(totals.optouts)} delta={null} tile="red" icon={ShieldBan} bars={null} barsColor="red" chart="none" />
          <DashboardKpiCard size="hero" index={2} label="Bloqueios manuais" value={fmtInt(totals.manual)} delta={null} tile="amber" icon={UserX} bars={null} barsColor="amber" chart="none" />
          <DashboardKpiCard size="hero" index={3} label="Campanhas protegidas" value="—" delta={{ text: 'aplicação automática', tone: 'success' }} tile="green" icon={ShieldCheck} bars={null} barsColor="green" chart="none" />
        </div>

        <FilterBarV2
          search={search} onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar por contato, telefone ou e-mail…"
          filters={filterDefs} values={filterValues} onFilter={(k, v) => { setFilterValue(k as 'origin' | 'motivo', v); setPage(1); }}
          hasActive={hasActive} onClear={() => { clearFilters(); setPage(1); }}
          rightSlot={<PrimaryButton icon={Plus} onClick={() => setShowAdd(true)}>Adicionar contato</PrimaryButton>}
        />

        <TalkXBulkBar
          count={selected.size}
          onClear={() => setSelectedIds(new Set<string>())}
          actions={
            <>
              <GhostButton size="sm" icon={Pencil} onClick={openBulkEdit}>Alterar motivo</GhostButton>
              <GhostButton size="sm" icon={Trash2} onClick={() => openRemove(selectedEntries)}>Remover</GhostButton>
            </>
          }
        />

        <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
          <TalkXQueryBoundary
            query={{ isLoading, isError, error }}
            entity="os contatos suprimidos"
            onRetry={() => refetch()}
            skeleton={<div className="p-4"><TalkXSkeletonRows rows={5} /></div>}
            isEmpty={blacklist.length === 0}
            empty={<div className="p-4"><TalkXEmptyState icon={ShieldCheck} title="Nenhum contato na lista de supressão" description="Contatos suprimidos são automaticamente excluídos de todos os envios de campanhas, segmentos e automações." /></div>}
          >
           {filtered.length === 0 ? (<div className="p-4"><TalkXEmptyState icon={Search} title="Nenhum resultado" /></div>)
           : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead className="bg-muted/20 border-b border-border/60"><tr>
                  <Th className="w-10"><input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} aria-label="Selecionar todos os contatos da página" className="w-3.5 h-3.5 accent-primary cursor-pointer" /></Th>
                  <Th>Contato</Th><Th>Telefone</Th><Th>Origem</Th><Th>Motivo</Th><Th>Campanha</Th><Th>Data</Th><Th>Status</Th><Th className="text-right">Ações</Th>
                </tr></thead>
                <tbody>
                  {paged.map((b) => {
                    const om = SUPPRESSION_ORIGIN[b.origin] ?? { label: b.origin, tone: 'muted' as const };
                    const status = SUPPRESSION_STATUS[suppressionStatus(b)];
                    const name = displayName(b);
                    return (
                      <tr key={b.id} className={cn('border-b border-border/40 transition-colors', selected.has(b.id) ? 'bg-primary/5' : 'hover:bg-muted/20')}>
                        <Td><input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleOne(b.id)} aria-label={`Selecionar ${name}`} className="w-3.5 h-3.5 accent-primary cursor-pointer" /></Td>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-dash-red/10 flex items-center justify-center text-xs font-bold text-dash-red shrink-0">{b.contacts?.avatar_url ? <img src={b.contacts.avatar_url} alt="" className="w-full h-full rounded-full object-cover" loading="lazy" decoding="async" /> : (b.contacts?.name || '?')[0].toUpperCase()}</div>
                            <div className="min-w-0"><p className="text-[13px] font-medium text-foreground truncate">{b.contacts?.name ?? 'Sem contato vinculado'}</p><p className="text-2xs text-foreground-secondary truncate">{b.contacts?.company}</p></div>
                          </div>
                        </Td>
                        <Td><span className="text-xs text-foreground-secondary">{displayPhone(b)}</span></Td>
                        <Td><Pill label={om.label} tone={om.tone} /></Td>
                        <Td><span className="text-xs text-foreground-secondary max-w-[180px] block truncate">{b.reason || '—'}</span></Td>
                        <Td><span className="text-2xs text-foreground-secondary">{b.campaign_id ? '📢 Campanha' : '—'}</span></Td>
                        <Td><span className="text-xs text-foreground-secondary">{fmtDateTime(b.created_at)}</span></Td>
                        <Td><Pill label={status.label} tone={status.tone} dot /></Td>
                        <Td className="text-right">
                          <div className="flex justify-end"><RowActionsMenu actions={rowActions(b)} label={`Ações de ${name}`} /></div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </TalkXQueryBoundary>
          {filtered.length > 0 && <div className="px-4 pb-4 pt-2 border-t border-border/50"><TalkXPagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="contatos suprimidos" /></div>}
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
            {[[fmtInt(totals.total), 'Suprimidos'], [fmtInt(totals.optouts), 'Opt-outs'], [fmtInt(totals.manual), 'Manuais'], ['0', 'LGPD']].map(([v, l]) => (
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
            <PrimaryButton icon={ShieldBan} onClick={() => addMutation.mutate()} className={cn((!addContactId || addMutation.isPending) && 'opacity-50 pointer-events-none')}>Bloquear</PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal editar motivo e expiração (1 linha ou a seleção) */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-2xl border-border/70 max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editing?.bulk ? `Editar ${editing.ids.length} contatos suprimidos` : 'Editar supressão'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-foreground-secondary">Motivo</Label>
              <Select value={editReason} onValueChange={(v) => setEditReason(v as ReasonCode)}>
                <SelectTrigger className="mt-1.5 bg-input/40 border-border/70" aria-label="Motivo"><SelectValue /></SelectTrigger>
                <SelectContent>{REASON_CODES.map((r) => <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-foreground-secondary">Expiração</Label>
              <Select value={editExpiry} onValueChange={(v) => setEditExpiry(v as ExpiryChoice)}>
                <SelectTrigger className="mt-1.5 bg-input/40 border-border/70" aria-label="Expiração"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Nunca expira</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                  <SelectItem value="date">Em uma data</SelectItem>
                </SelectContent>
              </Select>
              {editExpiry === 'date' && <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} aria-label="Data de expiração" className="mt-2 bg-input/40 border-border/70" />}
            </div>
          </div>
          <DialogFooter>
            <GhostButton onClick={() => setEditing(null)}>Cancelar</GhostButton>
            <PrimaryButton icon={Save} onClick={saveEdit} disabled={editExpiry === 'date' && !editDate} className={cn(editMutation.isPending && 'opacity-50 pointer-events-none')}>Salvar</PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal remover (kit) — opt-out/LGPD exige a confirmação marcada */}
      <TalkXConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && removeMutation.mutate(removing.ids)}
        icon={Trash2}
        iconColor="red"
        tone="danger"
        title={removingIsBulk ? `Remover ${removingEntries.length} contatos da lista?` : 'Remover da lista de supressão?'}
        entityName={removing && !removingIsBulk ? displayName(removingEntries[0]) : undefined}
        description="Volta a poder receber mensagens do Talk X nas próximas campanhas."
        details={removingDetails}
        checks={removingNeedsCheck ? [{ id: 'confirmacao', label: 'Confirmo que este contato pediu para sair ou revogou o consentimento (LGPD).' }] : []}
        confirmLabel="Remover"
        loading={removeMutation.isPending}
      />
    </div>
  );
}
