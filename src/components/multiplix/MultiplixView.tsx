import React, { useMemo, useState } from 'react';
import { Send, Search, Loader2, ListChecks } from 'lucide-react';
import { ModuleHeader, StatusPill, fmtInt, fmtDateTime } from '@/components/talkx/talkxShared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import {
  useMultiplixRamos, useMultiplixUfs, useMultiplixSearch, useMultiplixCount,
  type MultiplixSearchFilters,
} from '@/hooks/integrations/useMultiplixAudience';
import { useMultiplixDispatchesList } from '@/hooks/integrations/useMultiplixDispatches';
import { MultiplixComposerDialog } from './MultiplixComposerDialog';
import { MultiplixMonitor } from './MultiplixMonitor';

const DISPATCH_STATUS: Record<string, { label: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'violet' | 'muted' }> = {
  draft: { label: 'Rascunho', tone: 'muted' },
  scheduled: { label: 'Agendado', tone: 'violet' },
  sending: { label: 'Enviando', tone: 'info' },
  paused: { label: 'Pausado', tone: 'warning' },
  completed: { label: 'Concluído', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

const ROLE_LABELS: Record<'cliente' | 'fornecedor' | 'transportadora', string> = {
  cliente: 'Cliente', fornecedor: 'Fornecedor', transportadora: 'Transportadora',
};

const DESTINO_LABELS: Record<string, string> = {
  contato_pessoa: 'Contato', telefone_empresa: 'Empresa · sem pessoa cadastrada', sem_destino: 'Sem destino',
};

export default function MultiplixView() {
  const { data: ramos, isLoading: loadingRamos } = useMultiplixRamos();
  const { data: ufs, isLoading: loadingUfs } = useMultiplixUfs();
  const search = useMultiplixSearch();
  const count = useMultiplixCount();

  const [role, setRole] = useState<'cliente' | 'fornecedor' | 'transportadora' | ''>('');
  const [ramo, setRamo] = useState('');
  const [uf, setUf] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const dispatches = useMultiplixDispatchesList();

  const filters: MultiplixSearchFilters = useMemo(() => ({
    roles: role ? [role] : undefined,
    ramo: ramo || undefined,
    uf: uf || undefined,
    search: term || undefined,
  }), [role, ramo, uf, term]);

  const runSearch = () => {
    setSelected(new Set());
    count.mutate(filters);
    search.mutate({ ...filters, page: 0, page_size: 50 });
  };

  const toggleRow = (companyId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId); else next.add(companyId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const rows = search.data ?? [];
    const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.company_id));
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.company_id)));
  };

  if (monitorId) {
    return (
      <div className="p-6">
        <MultiplixMonitor dispatchId={monitorId} onBack={() => setMonitorId(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <ModuleHeader
        icon={Send}
        color="blue"
        title="Multiplix"
        subtitle="Envio em massa para fornecedores, transportadoras e clientes"
      />

      {(dispatches.data?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-[--zapp-border] bg-[--zapp-surface-1] p-4">
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5"><ListChecks className="w-4 h-4" />Disparos recentes</p>
          <div className="divide-y divide-border/40">
            {dispatches.data!.slice(0, 8).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setMonitorId(d.id)}
                className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-muted/20 rounded-lg px-2 -mx-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{d.name}</p>
                  <p className="text-2xs text-muted-foreground">{fmtDateTime(d.created_at)} · {fmtInt(d.sent_count)}/{fmtInt(d.total_recipients)} enviadas</p>
                </div>
                <StatusPill status={d.status} map={DISPATCH_STATUS} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[--zapp-border] bg-[--zapp-surface-1] p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Público</span>
          <Select value={role || 'all'} onValueChange={(v) => setRole(v === 'all' ? '' : (v as typeof role))}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Ramo</span>
          <Select value={ramo || 'all'} onValueChange={(v) => setRamo(v === 'all' ? '' : v)} disabled={loadingRamos}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(ramos ?? []).map((r) => (
                <SelectItem key={r.ramo_atividade} value={r.ramo_atividade}>
                  {r.ramo_atividade} ({r.total})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">UF</span>
          <Select value={uf || 'all'} onValueChange={(v) => setUf(v === 'all' ? '' : v)} disabled={loadingUfs}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(ufs ?? []).map((u) => (
                <SelectItem key={u.uf} value={u.uf}>{u.uf} ({u.total})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">Buscar por nome</span>
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nome da empresa..." />
        </div>

        <Button onClick={runSearch} disabled={search.isPending || count.isPending}>
          {search.isPending || count.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </Button>
      </div>

      {count.data !== undefined && (
        <p className="text-sm text-muted-foreground">
          <strong>{count.data}</strong> empresa(s) no filtro atual.
          {search.data && search.data.length < count.data && ` Mostrando as primeiras ${search.data.length}.`}
        </p>
      )}

      {search.data && (
        <div className="overflow-hidden rounded-2xl border border-[--zapp-border]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={search.data.length > 0 && search.data.every((r) => selected.has(r.company_id))}
                    onCheckedChange={toggleAllVisible}
                    aria-label="Selecionar todas as empresas visíveis"
                  />
                </TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Ramo</TableHead>
                <TableHead>UF</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Escopo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {search.data.map((row) => (
                <TableRow key={row.company_id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.company_id)}
                      onCheckedChange={() => toggleRow(row.company_id)}
                      aria-label={`Selecionar ${row.company_name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{row.company_name}</TableCell>
                  <TableCell>{row.ramo_atividade}</TableCell>
                  <TableCell>{row.uf ?? '—'}</TableCell>
                  <TableCell>
                    {row.destino_e164 ? (
                      <Badge variant="outline">{DESTINO_LABELS[row.destino_origem] ?? row.destino_origem}</Badge>
                    ) : (
                      <Badge variant="destructive">Sem WhatsApp</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.motivo_inclusao}</TableCell>
                </TableRow>
              ))}
              {search.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhuma empresa encontrada para este filtro.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {search.error && (
        <p className="text-sm text-destructive">{search.error.message}</p>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between gap-4 self-center rounded-2xl border border-[--zapp-border] bg-[--zapp-surface-1] px-4 py-3 shadow-lg">
          <span className="text-sm">
            <strong>{selected.size}</strong> empresa(s) selecionada(s)
          </span>
          <Button onClick={() => setComposerOpen(true)}>Criar disparo</Button>
        </div>
      )}

      <MultiplixComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        selectedCompanyIds={Array.from(selected)}
        onCreated={(dispatchId) => {
          setSelected(new Set());
          dispatches.refetch();
          setMonitorId(dispatchId);
        }}
      />
    </div>
  );
}
