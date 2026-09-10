import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { toast } from 'sonner';
import { ShieldBan, Plus, Trash2, Search, UserX, ShieldCheck, Download, Upload, Settings, X, AlertTriangle, Loader2 } from 'lucide-react';
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
import { IconTile, RailCard, MetaRow, StatusPill, TalkXEmptyState, TalkXSkeletonRows, FilterBar, TalkXPagination, SUPPRESSION_ORIGIN, Th, Td, fmtInt, fmtDateTime, barsByDay } from './talkxShared';

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
  removed_by_profile?: { full_name: string | null } | null;
  contacts: { name: string; phone: string; company: string | null; avatar_url: string | null } | null;
}

const REASONS = ['Opt-out solicitado', 'Número inválido / bounce', 'Reclamação de spam', 'Sem permissão comercial', 'LGPD / revogação de consentimento', 'Bloqueio manual', 'Outro'];

export function TalkXSuppression() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterOrigin, setFilterOrigin] = useState('all');
  const [filterMotivo, setFilterMotivo] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [removing, setRemoving] = useState<BlacklistEntry | null>(null);
  const [addContactId, setAddContactId] = useState('');
  const [addReason, setAddReason] = useState(REASONS[0]);
  const [addCustomReason, setAddCustomReason] = useState('');
  const [addOrigin, setAddOrigin] = useState<'manual'|'lgpd'>('manual');
  const [contactSearch, setContactSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ added: number; notFound: number; alreadyBlocked: number } | null>(null);

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['talkx-blacklist-history'],
    enabled: tab === 'history',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_blacklist')
        .select('*, contacts:contact_id(name, phone, company, avatar_url), removed_by_profile:removed_by(full_name)')
        .not('removed_at', 'is', null)
        .order('removed_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as BlacklistEntry[];
    },
  });

    const { data: blacklist = [], isLoading } = useQuery({
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
    queryKey: ['contacts-for-blacklist'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, name, phone, company').not('phone', 'is', null).order('name');
      return data || [];
    },
    enabled: showAdd,
  });

  const blacklistedIds = useMemo(() => new Set(blacklist.map((b) => b.contact_id)), [blacklist]);
  const nonBlocked = useMemo(() => availableContacts.filter((c) => !blacklistedIds.has(c.id)), [availableContacts, blacklistedIds]);
  const filteredAddContacts = useMemo(() => {
    if (!contactSearch.trim()) return nonBlocked.slice(0, 50);
    const q = contactSearch.toLowerCase();
    return nonBlocked.filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q)).slice(0, 50);
  }, [nonBlocked, contactSearch]);

  const filtered = useMemo(() => {
    let r = blacklist;
    if (filterOrigin !== 'all') r = r.filter((b) => b.origin === filterOrigin);
    if (filterMotivo !== 'all') r = r.filter((b) => (b.reason ?? '').toLowerCase().includes(filterMotivo.toLowerCase()));
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((b) => b.contacts?.name?.toLowerCase().includes(q) || b.contacts?.phone?.includes(q) || (b.reason ?? '').toLowerCase().includes(q)); }
    return r;
  }, [blacklist, filterOrigin, filterMotivo, search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totals = useMemo(() => ({
    total: blacklist.length,
    optouts: blacklist.filter((b) => b.origin === 'optout').length,
    manual: blacklist.filter((b) => b.origin === 'manual').length,
    bars: barsByDay(blacklist.map((b) => b.created_at)),
  }), [blacklist]);

  const addMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const finalReason = addReason === 'Outro' ? addCustomReason || 'Outro' : addReason;
      const { error } = await fromTable('talkx_blacklist').insert({ contact_id: addContactId, reason: finalReason, blocked_by: user?.id ?? null, origin: addOrigin });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['talkx-blacklist'] }); toast.success('Contato adicionado à lista de supressão'); setShowAdd(false); setAddContactId(''); setAddReason(REASONS[0]); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('talkx_blacklist').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['talkx-blacklist'] }); toast.success('Contato removido da lista de supressão'); setRemoving(null); },
  });

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResults(null);
    try {
      const text = await file.text();
      const phones = [...new Set(text.split(/[\n,;\t]/).map((l) => l.replace(/[^0-9]/g, '').trim()).filter((v) => v.length >= 8))];
      if (phones.length === 0) { toast.error('Nenhum telefone encontrado no arquivo.'); return; }
      const { data: contacts, error: lookupErr } = await supabase.from('contacts').select('id, phone').in('phone', phones);
      if (lookupErr) throw lookupErr;
      const found = contacts ?? [];
      const alreadyBlockedSet = new Set(blacklistedIds);
      const toInsert = found.filter((c) => c.phone && !alreadyBlockedSet.has(c.id));
      if (toInsert.length === 0) {
        setImportResults({ added: 0, notFound: phones.length - found.length, alreadyBlocked: found.length - toInsert.length });
        toast.info('Nenhum contato novo para adicionar.');
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profileRow } = await supabase.from('profiles').select('id').eq('user_id', user?.id ?? '').maybeSingle();
      const rows = toInsert.map((c) => ({ contact_id: c.id, reason: 'Importação em lote', blocked_by: profileRow?.id ?? null, origin: 'manual' as const }));
      const { error } = await supabase.from('talkx_blacklist').upsert(rows, { onConflict: 'contact_id', ignoreDuplicates: true });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['talkx-blacklist'] });
      const result = { added: toInsert.length, notFound: phones.length - found.length, alreadyBlocked: found.length - toInsert.length };
      setImportResults(result);
      const pl = result.added !== 1;
      toast.success(result.added + ' contato' + (pl?'s':'') + ' adicionado' + (pl?'s':'') + ' à supressao');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro na importacao');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const exportCSV = () => {
    const rows = blacklist.map((b) => ({ Nome: b.contacts?.name, Telefone: b.contacts?.phone, Origem: b.origin, Motivo: b.reason, Data: fmtDateTime(b.created_at) }));
    const headers = Object.keys(rows[0] ?? {});
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String((r as Record<string, string>)[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `supressao-talkx-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashboardKpiCard size="hero" index={0} label="Contatos suprimidos" value={fmtInt(totals.total)} delta={null} tile="red" icon={UserX} bars={totals.bars} barsColor="red" />
          <DashboardKpiCard size="hero" index={1} label="Opt-outs 30 dias" value={fmtInt(totals.optouts)} delta={null} tile="red" icon={ShieldBan} bars={null} barsColor="red" chart="none" />
          <DashboardKpiCard size="hero" index={2} label="Bloqueios manuais" value={fmtInt(totals.manual)} delta={null} tile="amber" icon={UserX} bars={null} barsColor="amber" chart="none" />
          <DashboardKpiCard size="hero" index={3} label="Campanhas protegidas" value="—" delta={{ text: 'aplicação automática', tone: 'success' }} tile="green" icon={ShieldCheck} bars={null} barsColor="green" chart="none" />
        </div>

        <FilterBar search={search} onSearch={setSearch} placeholder="Buscar por contato, telefone ou e-mail…" selects={[
          { key: 'origin', value: filterOrigin, onChange: setFilterOrigin, label: 'Todas as origens', options: Object.entries(SUPPRESSION_ORIGIN).map(([v, m]) => ({ value: v, label: m.label })) },
        ]}
          right={(
            <div className="flex items-center gap-2">
              <GhostButton icon={Download} onClick={exportCSV} size="sm">Exportar lista</GhostButton>
              <PrimaryButton icon={Plus} onClick={() => setShowAdd(true)}>Adicionar contato</PrimaryButton>
            </div>
          )}
        />

        {/* E58: tab toggle */}
        <div className="flex gap-1 bg-card border border-border/70 rounded-xl p-1 w-fit">
          {(['active', 'history'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`h-7 px-3 rounded-lg text-[12px] font-medium transition-colors ${tab === t ? 'bg-primary text-white' : 'text-foreground-secondary hover:bg-muted/40'}`}>
              {t === 'active' ? `Ativas (${fmtInt(blacklist.length)})` : `Histórico (${fmtInt(history.length)})`}
            </button>
          ))}
        </div>

{tab === 'active' && (<section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
          {isLoading ? (<div className="p-4"><TalkXSkeletonRows rows={5} /></div>)
           : blacklist.length === 0 ? (<div className="p-4"><TalkXEmptyState icon={ShieldCheck} title="Nenhum contato na lista de supressão" description="Contatos suprimidos são automaticamente excluídos de todos os envios de campanhas, segmentos e automações." /></div>)
           : filtered.length === 0 ? (<div className="p-4"><TalkXEmptyState icon={Search} title="Nenhum resultado" /></div>)
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
                            <div className="min-w-0"><p className="text-[13px] font-medium text-foreground truncate">{b.contacts?.name}</p><p className="text-[11px] text-foreground-secondary truncate">{b.contacts?.company}</p></div>
                          </div>
                        </Td>
                        <Td><span className="text-[12.5px] text-foreground-secondary">+{b.contacts?.phone?.replace(/\D/g,'')}</span></Td>
                        <Td><Pill label={om.label} tone={om.tone} /></Td>
                        <Td><span className="text-[12px] text-foreground-secondary max-w-[180px] block truncate">{b.reason || '—'}</span></Td>
                        <Td><span className="text-[11.5px] text-foreground-secondary">{b.campaign_id ? '📢 Campanha' : '—'}</span></Td>
                        <Td><span className="text-[12px] text-foreground-secondary">{fmtDateTime(b.created_at)}</span></Td>
                        <Td><Pill label="Suprimido" tone="danger" dot /></Td>
                        <Td className="text-right">
                          <AlertDialog>
                            <button type="button" onClick={() => setRemoving(b)} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-[12px] font-medium text-foreground-secondary hover:bg-dash-red/10 hover:text-dash-red flex items-center gap-1.5 ml-auto"><Trash2 className="w-3.5 h-3.5" />Remover</button>
                          </AlertDialog>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 && <div className="px-4 pb-4 pt-2 border-t border-border/50"><TalkXPagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={() => {}} noun="contatos suprimidos" /></div>}
        </section>
      )}
      </div>

      {/* Centro de proteção */}
      <div className="space-y-4 min-w-0">
        <RailCard icon={ShieldCheck} color="green" title="Centro de proteção" subtitle="Mais segurança para suas campanhas" glow>
          <div className="rounded-xl bg-dash-green/10 border border-dash-green/30 p-3 text-center mb-3">
            <p className="text-[32px] font-bold text-foreground tabular-nums">{fmtInt(totals.total)}</p>
            <p className="text-[12px] text-foreground-secondary">campanhas protegidas automaticamente</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            {[[fmtInt(totals.total), 'Suprimidos'], [fmtInt(totals.optouts), 'Opt-outs'], [fmtInt(totals.manual), 'Manuais'], ['0', 'LGPD']].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-muted/30 border border-border/50 py-2"><p className="text-[14px] font-bold text-foreground">{v}</p><p className="text-[10px] text-foreground-secondary">{l}</p></div>
            ))}
          </div>
        </RailCard>
        <RailCard icon={Settings} title="Ações da lista">
          <div className="space-y-2">
            <label className={cn('w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-border/60 bg-input/20 hover:border-primary/40 text-left text-[12.5px] font-medium text-foreground cursor-pointer', importing && 'opacity-60 pointer-events-none')}>
              {importing ? <Loader2 className="w-4 h-4 text-primary-glow animate-spin" /> : <Upload className="w-4 h-4 text-primary-glow" />}
              {importing ? 'Importando...' : 'Importar lista (CSV / TXT de telefones)'}
              <input type="file" className="sr-only" accept=".csv,.txt,.tsv" onChange={handleImportCSV} />
            </label>
            {importResults && (
              <div className="text-[11.5px] text-foreground-secondary flex flex-col gap-0.5 px-1">
                <span className="text-dash-green">✓ {importResults.added} adicionados</span>
                {importResults.notFound > 0 && <span className="text-muted-foreground">{importResults.notFound} não encontrados na base</span>}
                {importResults.alreadyBlocked > 0 && <span className="text-muted-foreground">{importResults.alreadyBlocked} já bloqueados</span>}
              </div>
            )}
            <button type="button" onClick={exportCSV} className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-border/60 bg-input/20 hover:border-primary/40 text-left text-[12.5px] font-medium text-foreground"><Download className="w-4 h-4 text-primary-glow" />Exportar lista (CSV)</button>
          </div>
        </RailCard>
        <div className="rounded-xl border border-dash-amber/30 bg-dash-amber/10 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-dash-amber shrink-0 mt-0.5" />
          <p className="text-[12px] text-foreground-secondary">Contatos suprimidos são automaticamente excluídos de <b className="text-foreground">todos</b> os envios de campanhas, segmentos e automações. <a href="#" className="text-primary-glow hover:underline">Saiba mais →</a></p>
        </div>
      </div>

      {/* Modal adicionar */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="rounded-2xl border-border/70 max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Adicionar à Lista de Supressão</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-[12px] text-foreground-secondary">Buscar contato</Label>
              <Input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Nome ou telefone…" className="mt-1.5 bg-input/40 border-border/70" />
              <div className="max-h-40 overflow-auto mt-2 rounded-lg border border-border/60 divide-y divide-border/50">
                {filteredAddContacts.length === 0 ? <p className="text-[12px] text-muted-foreground text-center py-4">Nenhum contato encontrado</p>
                  : filteredAddContacts.map((c) => (
                    <button key={c.id} onClick={() => setAddContactId(c.id)} className={cn('w-full text-left px-3 py-2 text-sm transition-colors', addContactId === c.id ? 'bg-primary/10' : 'hover:bg-muted/50')}>
                      <span className="font-medium">{c.name}</span><span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>
                    </button>
                  ))}
              </div>
            </div>
            <div>
              <Label className="text-[12px] text-foreground-secondary">Origem</Label>
              <div className="flex gap-2 mt-1.5">
                {(['manual', 'lgpd'] as const).map((o) => <button key={o} type="button" onClick={() => setAddOrigin(o)} className={cn('h-8 px-3 rounded-lg border text-[12.5px] font-medium', addOrigin === o ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 text-muted-foreground hover:bg-muted/50')}>{o === 'manual' ? 'Manual' : 'LGPD'}</button>)}
              </div>
            </div>
            <div>
              <Label className="text-[12px] text-foreground-secondary">Motivo</Label>
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


      {tab === 'history' && (<section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-foreground">Removidos da supressao</p>
          <span className="text-[11px] text-muted-foreground">{fmtInt(history.length)} entradas</span>
        </div>
        {historyLoading ? <TalkXSkeletonRows rows={5} /> : history.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-muted-foreground">Nenhuma entrada removida ainda.</div>
        ) : (<div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-border/50 bg-muted/10"><Th>Contato</Th><Th>Telefone</Th><Th>Motivo</Th><Th>Removido em</Th><Th>Por</Th></tr></thead><tbody>{history.map((b) => (<tr key={b.id} className="border-b border-border/30 hover:bg-muted/10"><Td><span className="text-[13px] font-medium text-foreground">{b.contacts?.name ?? 'Avulso'}</span></Td><Td><span className="text-[12px] text-foreground-secondary">{b.contacts?.phone ?? '—'}</span></Td><Td><span className="text-[12px] text-foreground-secondary">{b.reason ?? '—'}</span></Td><Td><span className="text-[11px] text-foreground-secondary">{b.removed_at ? fmtDateTime(b.removed_at) : '—'}</span></Td><Td><span className="text-[11px] text-foreground-secondary">{b.removed_by_profile?.full_name ?? '—'}</span></Td></tr>))}</tbody></table></div>)}
      </section>)}

            <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent className="rounded-2xl border-border/70">
          <AlertDialogHeader><AlertDialogTitle>Remover da lista de supressão?</AlertDialogTitle><AlertDialogDescription><b className="text-foreground">{removing?.contacts?.name}</b> poderá receber mensagens do Talk X nas próximas campanhas.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => removing && removeMutation.mutate(removing.id)}>Remover</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
