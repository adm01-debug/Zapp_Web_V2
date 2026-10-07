import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import { useDebounce } from '@/hooks/performance/useTimingHooks';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';
import { ShieldBan, Plus, Trash2, Search, UserX, ShieldCheck, Settings, X, AlertTriangle } from 'lucide-react';
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
import { PrimaryButton, GhostButton, InitialsAvatar, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { IconTile, RailCard, MetaRow, StatusPill, TalkXEmptyState, TalkXSkeletonRows, FilterBarV2, TalkXPagination, SUPPRESSION_ORIGIN, Th, Td, fmtInt, fmtDateTime, barsByDay } from './talkxShared';
import { TalkXQueryBoundary } from './kit/states';
import { useTalkXFilterState } from './kit/useFilterState';

interface BlacklistEntry {
  id: string;
  contact_id: string;
  reason: string | null;
  blocked_by: string | null;
  created_at: string;
  origin: string;
  campaign_id: string | null;
  removed_by: string | null;
  removed_at: string | null;
  contacts: { name: string; phone: string; company: string | null; avatar_url: string | null } | null;
}

const REASONS = ['Opt-out solicitado', 'Número inválido / bounce', 'Reclamação de spam', 'Sem permissão comercial', 'LGPD / revogação de consentimento', 'Bloqueio manual', 'Outro'];

// Teto de contatos devolvidos na busca do modal (mesmo padrão do SLARuleFormDialog)
// e espera antes de ir ao servidor, para não disparar uma consulta por tecla.
const ADD_CONTACT_LIST_LIMIT = 50;
const CONTACT_SEARCH_DEBOUNCE_MS = 300;

export function TalkXSuppression() {
  const qc = useQueryClient();
  const { values: filterValues, setValue: setFilterValue, query: search, setQuery: setSearch, hasActive, clear: clearFilters } = useTalkXFilterState('talkx.suppression.filters', { origin: 'all', motivo: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [showAdd, setShowAdd] = useState(false);
  const [removing, setRemoving] = useState<BlacklistEntry | null>(null);
  const [addContactId, setAddContactId] = useState('');
  const [addReason, setAddReason] = useState(REASONS[0]);
  const [addCustomReason, setAddCustomReason] = useState('');
  const [addOrigin, setAddOrigin] = useState<'manual'|'lgpd'>('manual');
  const [contactSearch, setContactSearch] = useState('');
  const debouncedContactSearch = useDebounce(contactSearch.trim(), CONTACT_SEARCH_DEBOUNCE_MS);

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
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((b) => b.contacts?.name?.toLowerCase().includes(q) || b.contacts?.phone?.includes(q) || (b.reason ?? '').toLowerCase().includes(q)); }
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

  const addMutation = useMutation({
    mutationFn: async () => {
      const finalReason = addReason === 'Outro' ? addCustomReason || 'Outro' : addReason;
      const { error } = await fromTable('talkx_blacklist').insert({ contact_id: addContactId, reason: finalReason, blocked_by: profile?.id ?? null, origin: addOrigin });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['talkx-blacklist'] }); toast.success('Contato adicionado à lista de supressão'); setShowAdd(false); setAddContactId(''); setAddReason(REASONS[0]); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('talkx_blacklist')
        .update({ removed_by: profile?.id ?? null, removed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['talkx-blacklist'] }); toast.success('Contato removido da lista de supressão'); setRemoving(null); },
  });



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
                  <Th>Contato</Th><Th>Telefone</Th><Th>Origem</Th><Th>Motivo</Th><Th>Campanha</Th><Th>Data</Th><Th>Status</Th><Th className="text-right">Ações</Th>
                </tr></thead>
                <tbody>
                  {paged.map((b) => {
                    const om = SUPPRESSION_ORIGIN[b.origin] ?? { label: b.origin, tone: 'muted' as const };
                    return (
                      <tr key={b.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-dash-red/10 flex items-center justify-center text-xs font-bold text-dash-red shrink-0">{b.contacts?.avatar_url ? <img src={b.contacts.avatar_url} alt="" className="w-full h-full rounded-full object-cover" loading="lazy" decoding="async" /> : (b.contacts?.name || '?')[0].toUpperCase()}</div>
                            <div className="min-w-0"><p className="text-[13px] font-medium text-foreground truncate">{b.contacts?.name}</p><p className="text-2xs text-foreground-secondary truncate">{b.contacts?.company}</p></div>
                          </div>
                        </Td>
                        <Td><span className="text-xs text-foreground-secondary">+{b.contacts?.phone?.replace(/\D/g,'')}</span></Td>
                        <Td><Pill label={om.label} tone={om.tone} /></Td>
                        <Td><span className="text-xs text-foreground-secondary max-w-[180px] block truncate">{b.reason || '—'}</span></Td>
                        <Td><span className="text-2xs text-foreground-secondary">{b.campaign_id ? '📢 Campanha' : '—'}</span></Td>
                        <Td><span className="text-xs text-foreground-secondary">{fmtDateTime(b.created_at)}</span></Td>
                        <Td><Pill label="Suprimido" tone="danger" dot /></Td>
                        <Td className="text-right">
                          <AlertDialog>
                            <button type="button" onClick={() => setRemoving(b)} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium text-foreground-secondary hover:bg-dash-red/10 hover:text-dash-red flex items-center gap-1.5 ml-auto"><Trash2 className="w-3.5 h-3.5" />Remover</button>
                          </AlertDialog>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </TalkXQueryBoundary>
          {filtered.length > 0 && <div className="px-4 pb-4 pt-2 border-t border-border/50"><TalkXPagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={() => {}} noun="contatos suprimidos" /></div>}
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

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent className="rounded-2xl border-border/70">
          <AlertDialogHeader><AlertDialogTitle>Remover da lista de supressão?</AlertDialogTitle><AlertDialogDescription><b className="text-foreground">{removing?.contacts?.name}</b> poderá receber mensagens do Talk X nas próximas campanhas.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => removing && removeMutation.mutate(removing.id)}>Remover</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
