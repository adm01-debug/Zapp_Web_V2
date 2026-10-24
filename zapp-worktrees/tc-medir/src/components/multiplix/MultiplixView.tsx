import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
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
  type MultiplixSearchFilters, type MultiplixAudienceRow,
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
  completed_with_failures: { label: 'Concluído com falhas', tone: 'warning' },
  failed: { label: 'Falhou', tone: 'danger' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

const ROLE_LABELS: Record<'cliente' | 'fornecedor' | 'transportadora', string> = {
  cliente: 'Cliente', fornecedor: 'Fornecedor', transportadora: 'Transportadora',
};

const DESTINO_LABELS: Record<string, string> = {
  contato_pessoa: 'Contato', telefone_empresa: 'Empresa · sem pessoa cadastrada', sem_destino: 'Sem destino',
};

const PAGE_SIZE = 50;
// Limite duro do backend: ResolveParamsSchema.company_ids em
// supabase/functions/multiplix-audience/index.ts rejeita arrays > 500.
const MAX_SELECTABLE = 500;

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
  const [rows, setRows] = useState<MultiplixAudienceRow[]>([]);
  const [page, setPage] = useState(0);
  const [submittedFilters, setSubmittedFilters] = useState<MultiplixSearchFilters>({});
  // P2 fix (Codex, review da PR #958): 'search' e uma mutation COMPARTILHADA
  // entre a busca inicial e o loadMore -- isSuccess vira false a cada
  // 'loadMore' em andamento, escondendo a tabela (e as linhas ja carregadas)
  // ate a proxima resposta. 'hasSearched' so liga na primeira busca e nunca
  // desliga, entao a tabela nao pisca/some durante paginacao nem fica
  // escondida se uma pagina seguinte falhar.
  const [hasSearched, setHasSearched] = useState(false);
  // P2 fix (Codex, review da PR #958): quando 'count' falha (RPC
  // independente), count.data fica undefined para sempre e o botao
  // "Carregar mais" nunca aparecia de novo, mesmo com mais paginas
  // disponiveis. Uma pagina cheia (== PAGE_SIZE) e evidencia de que pode
  // haver mais -- usada como fallback so quando count.data e desconhecido.
  // P2 fix v2 (Codex, 3a review da PR #958): tambem serve como guarda
  // primario -- pagina curta (empresa removida apos snapshot do count) deve
  // esconder o botao mesmo quando count.data > rows.length. Condicao:
  // lastPageFull && (count.data === undefined || rows.length < count.data).
  const [lastPageFull, setLastPageFull] = useState(false);
  const dispatches = useMultiplixDispatchesList();
  const selectableRows = rows.slice(0, MAX_SELECTABLE);

  const filters: MultiplixSearchFilters = useMemo(() => ({
    roles: role ? [role] : undefined,
    ramo: ramo || undefined,
    uf: uf || undefined,
    search: term || undefined,
  }), [role, ramo, uf, term]);

  const runSearch = () => {
    setSelected(new Set());
    setPage(0);
    setSubmittedFilters(filters);
    // P1 fix (Codex, review da PR #958): 'rows' antigo (de outro filtro)
    // ficava na tela e continuava clicavel enquanto a nova busca (page 0)
    // ainda estava em voo -- selecionar uma linha nesse intervalo mantinha
    // o company_id em 'selected' mesmo depois de 'rows' trocar para o novo
    // resultado, e esse id fantasma podia ir parar num disparo real via
    // MultiplixComposerDialog. Limpa 'rows' de imediato, antes do mutate.
    setRows([]);
    // P2 fix (Codex, 2a review da PR #958): sem este reset, lastPageFull=true
    // de uma busca anterior persiste durante o voo da nova page 0 -- se a
    // nova busca falhar, o botao Carregar mais aparece com rows=[] e o
    // clique pede page 1 pulando page 0 para sempre.
    setLastPageFull(false);
    count.mutate(filters);
    search.mutate({ ...filters, page: 0, page_size: PAGE_SIZE }, { onSuccess: (data) => { setRows(data); setHasSearched(true); setLastPageFull(data.length === PAGE_SIZE); } });
  };

  // P1+P2 fix (Codex, review da PR #958):
  // - 'loadMore' usava os filtros AO VIVO, nao o snapshot do ultimo Buscar --
  //   se o usuario mudasse um filtro sem clicar Buscar e depois clicasse
  //   Carregar mais, a resposta (de outro filtro) era anexada em cima da
  //   audiencia antiga, misturando duas buscas na mesma selecao.
  // - 'page' avancava antes da resposta: numa falha de rede/timeout a pagina
  //   fica pulada para sempre (nunca mais pedida) sem nenhuma linha extra.
  // Fix: usa 'submittedFilters' (travado no Buscar) e so avanca 'page' dentro
  // do onSuccess.
  const loadMore = () => {
    const nextPage = page + 1;
    search.mutate(
      { ...submittedFilters, page: nextPage, page_size: PAGE_SIZE },
      { onSuccess: (data) => { setPage(nextPage); setRows((prev) => [...prev, ...data]); setLastPageFull(data.length === PAGE_SIZE); } },
    );
  };

  const toggleRow = (companyId: string) => {
    setSelected((prev) => {
      if (prev.has(companyId)) {
        const next = new Set(prev);
        next.delete(companyId);
        return next;
      }
      if (prev.size >= MAX_SELECTABLE) {
        toast.error(`Limite de ${MAX_SELECTABLE} empresas por disparo. Desmarque alguma antes de adicionar outra.`);
        return prev;
      }
      return new Set(prev).add(companyId);
    });
  };

  // P1 fix (Codex, review da PR #958): com paginacao, "Selecionar todas"
  // pode juntar mais de 500 empresas -- o resolver do backend
  // (ResolveParamsSchema.company_ids) rejeita arrays maiores que isso, e o
  // disparo falharia com "Invalid request" sem nenhuma explicacao na UI.
  // P2 fix (Codex, 2a review): 'allSelected' comparava contra TODAS as rows,
  // nao so as selecionaveis -- acima de 500 carregadas, nunca ficava true e
  // o clique repetido so reselecionava as mesmas 500 (sem bulk-deselect).
  // Compara e seleciona contra 'selectableRows' (rows ate MAX_SELECTABLE).
  const toggleAllVisible = () => {
    const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.company_id));
    if (allSelected) { setSelected(new Set()); return; }
    if (rows.length > MAX_SELECTABLE) {
      toast.error(`"Selecionar todas" limitado a ${MAX_SELECTABLE} empresas (limite do backend) — foram selecionadas as primeiras ${MAX_SELECTABLE}. Refine o filtro para pegar o restante.`);
    }
    setSelected(new Set(selectableRows.map((r) => r.company_id)));
  };

  if (monitorId) {
    return (
      <div className="min-h-full w-full min-w-0">
        <MultiplixMonitor dispatchId={monitorId} onBack={() => setMonitorId(null)} />
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-6">
      <ModuleHeader
        icon={Send}
        color="blue"
        title="Multiplix"
        subtitle="Envio em massa para fornecedores, transportadoras e clientes"
      />

      {(dispatches.data?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-[--zapp-border] bg-[--zapp-surface-1] p-4">
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5"><ListChecks className="w-4 h-4" />Disparos recentes</p>
          {/* Lista TODOS os disparos que a edge devolveu (ate o limite do fetch),
              com rolagem. Antes o `slice(0, 8)` escondia do 9o em diante: o dado
              vinha do servidor e nao tinha nenhum caminho de clique para o
              monitor. */}
          <div className="divide-y divide-border/40 max-h-[360px] overflow-auto">
            {dispatches.data!.map((d) => (
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
            <SelectTrigger aria-label="Público" className="w-44"><SelectValue placeholder="Todos" /></SelectTrigger>
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
            <SelectTrigger aria-label="Ramo" className="w-56"><SelectValue placeholder="Todos" /></SelectTrigger>
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
            <SelectTrigger aria-label="UF" className="w-32"><SelectValue placeholder="Todas" /></SelectTrigger>
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
          {rows.length > 0 && rows.length < count.data && ` Mostrando ${rows.length}.`}
        </p>
      )}

      {/* P2 fix (Codex, review da PR #958, 2 rounds): gate em 'hasSearched'
          (liga na 1a busca, nunca desliga) -- 'search.isSuccess' reflete a
          mutation COMPARTILHADA com loadMore, entao virava false a cada
          pagina seguinte em andamento e escondia as linhas ja carregadas;
          tambem nao dependia de count.data (RPC independente que pode falhar
          sem que a busca em si tenha falhado). */}
      {hasSearched && (
        <div className="overflow-hidden rounded-2xl border border-[--zapp-border]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.company_id))}
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
              {rows.map((row) => (
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
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhuma empresa encontrada para este filtro.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {/* P2 fix v2 (Codex, 3a review da PR #958): lastPageFull agora e
              guarda primario -- pagina curta (empresa removida apos snapshot
              do count) definia lastPageFull=false mas count.data > rows.length
              ainda mantinha o botao vísivel para sempre. Fix: lastPageFull &&
              (count.data === undefined || rows.length < count.data). */}
          {(rows.length > 0 || !search.isError) && lastPageFull && (count.data === undefined || rows.length < count.data) && (
            <div className="flex justify-center border-t border-[--zapp-border] p-3">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={search.isPending}>
                {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {count.data !== undefined
                  ? `Carregar mais (${count.data - rows.length} restante${count.data - rows.length === 1 ? '' : 's'})`
                  : 'Carregar mais'}
              </Button>
            </div>
          )}
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
