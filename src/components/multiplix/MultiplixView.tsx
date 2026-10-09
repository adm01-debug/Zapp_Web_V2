import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Send, Search, Loader2, ListChecks } from 'lucide-react';
import { ModuleHeader, StatusPill, fmtInt, fmtDateTime } from '@/components/talkx/talkxShared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import {
  useMultiplixRamos, useMultiplixUfs, useMultiplixSearch, useMultiplixCount, useMultiplixResolve,
  type MultiplixSearchFilters, type MultiplixAudienceRow,
} from '@/hooks/integrations/useMultiplixAudience';
import {
  useMultiplixDispatchesList,
  useMultiplixAudienceSelect,
  useMultiplixAudienceSave,
  useMultiplixAudienceApply,
  type MultiplixAudienceSaveResult,
} from '@/hooks/integrations/useMultiplixDispatches';
import { ELIGIBILITY_LABELS_PT, type MultiplixEligibility } from '@/lib/multiplix-eligibility';
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

// F75: os dois tipos de publico salvo do contrato da edge (`kind` de
// `audience.save` — migration F35: CHECK ('rule','static_list')).
type AudienciaKind = 'rule' | 'static_list';

const AUDIENCE_KIND_LABELS: Record<AudienciaKind, string> = {
  rule: 'Regra (filtros do painel)',
  static_list: 'Lista fixa (selecionadas agora)',
};

const PAGE_SIZE = 50;
// Limite duro do backend: ResolveParamsSchema.company_ids em
// supabase/functions/multiplix-audience/index.ts rejeita arrays > 500.
const MAX_SELECTABLE = 500;

/** Texto do filtro para o aviso da regra ("o que este publico guarda"). */
function resumoFiltros(filters: MultiplixSearchFilters): string {
  const partes: string[] = [];
  if (filters.roles?.length) partes.push(`Público: ${filters.roles.map((r) => ROLE_LABELS[r]).join(', ')}`);
  if (filters.ramo) partes.push(`Ramo: ${filters.ramo}`);
  if (filters.uf) partes.push(`UF: ${filters.uf}`);
  if (filters.search) partes.push(`Nome: ${filters.search}`);
  return partes.length > 0 ? partes.join(' · ') : 'nenhum filtro';
}

// F75: `kind=rule` exige definition com ao menos um filtro (AudienceSaveSchema
// da edge). A tela nao manda regra vazia — o botao fica desabilitado.
function temAlgumFiltro(filters: MultiplixSearchFilters): boolean {
  return Boolean(filters.roles?.length || filters.ramo || filters.uf || filters.search);
}

function papeisDaEmpresa(row: MultiplixAudienceRow): string {
  const papeis = [
    row.is_customer ? ROLE_LABELS.cliente : null,
    row.is_supplier ? ROLE_LABELS.fornecedor : null,
    row.is_carrier ? ROLE_LABELS.transportadora : null,
  ].filter((papel): papel is string => papel !== null);
  return papeis.length > 0 ? papeis.join(' · ') : 'Sem papel informado';
}

/**
 * F75: popover do contato com os SEIS campos do painel — empresa, papéis,
 * origem, destino, elegibilidade e motivo.
 *
 * A elegibilidade NAO esta na linha da busca (`MultiplixAudienceRow`): ela vem
 * do resolvedor canônico (`resolve`, a mesma ponte do disparo) e o rótulo em
 * português sai do mapa único `ELIGIBILITY_LABELS_PT` — nenhuma regra paralela
 * é criada aqui. O estado fica no próprio popover (uma instância por linha),
 * então o dado de uma empresa nunca aparece no detalhe de outra.
 */
function ContatoDetalhe({ row }: { row: MultiplixAudienceRow }) {
  const resolve = useMultiplixResolve();
  const [aberto, setAberto] = useState(false);
  const [resolvido, setResolvido] = useState<{ companyId: string; elegibilidade: MultiplixEligibility } | null>(null);

  const aoMudarAberto = (proximo: boolean) => {
    setAberto(proximo);
    if (!proximo) return;
    resolve.mutate([row.company_id], {
      onSuccess: (linhas) => {
        const alvo = linhas.find((linha) => linha.company_id === row.company_id);
        if (alvo) setResolvido({ companyId: row.company_id, elegibilidade: alvo.elegibilidade });
      },
    });
  };

  const elegibilidade = resolvido?.companyId === row.company_id ? ELIGIBILITY_LABELS_PT[resolvido.elegibilidade] : null;

  return (
    <Popover open={aberto} onOpenChange={aoMudarAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Detalhes de ${row.company_name}`}
          className="text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
        >
          {row.company_name}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={`Detalhe de ${row.company_name}`} className="w-80 space-y-2 text-sm">
        <div>
          <p className="font-medium text-foreground">{row.company_name}</p>
          <p className="text-xs text-muted-foreground">{row.ramo_atividade} · {row.uf ?? 'UF não informada'}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Papéis</dt>
          <dd>{papeisDaEmpresa(row)}</dd>
          <dt className="text-muted-foreground">Origem</dt>
          <dd>{DESTINO_LABELS[row.destino_origem] ?? row.destino_origem}</dd>
          <dt className="text-muted-foreground">Destino</dt>
          <dd>{row.destino_e164 ?? 'Sem destino'}</dd>
          <dt className="text-muted-foreground">Elegibilidade</dt>
          <dd>
            {elegibilidade
              ?? (resolve.isPending ? 'Verificando…' : resolve.isError ? 'Falha ao verificar' : 'Não informada')}
          </dd>
          <dt className="text-muted-foreground">Motivo</dt>
          <dd>{row.motivo_inclusao}</dd>
        </dl>
      </PopoverContent>
    </Popover>
  );
}

export default function MultiplixView() {
  const { data: ramos, isLoading: loadingRamos } = useMultiplixRamos();
  const { data: ufs, isLoading: loadingUfs } = useMultiplixUfs();
  const search = useMultiplixSearch();
  const count = useMultiplixCount();
  const audienciaSelect = useMultiplixAudienceSelect();
  const audienciaSave = useMultiplixAudienceSave();
  const audienciaApply = useMultiplixAudienceApply();

  const [role, setRole] = useState<'cliente' | 'fornecedor' | 'transportadora' | ''>('');
  const [ramo, setRamo] = useState('');
  const [uf, setUf] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // F75: exclusoes EXPLICITAS do painel. Elas vencem a inclusao — a empresa
  // marcada como excluida fica fora do disparo mesmo que tambem esteja marcada
  // como selecionada (regra do prototipo: "uma exclusao manual continua valida
  // mesmo quando o contato tambem pertence a um segmento selecionado").
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  // F75/E134: quem responde "quantos selecionados estao FORA do filtro atual" e
  // o SERVIDOR — a lista da tela e paginada, entao a pagina carregada nao prova
  // nada. `null` = ainda nao comparado com o filtro submetido.
  const [confirmadosNoFiltro, setConfirmadosNoFiltro] = useState<Set<string> | null>(null);
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
  // F75: publico salvo (regra ou lista) gravado na camada de hooks.
  const [audienciaNome, setAudienciaNome] = useState('');
  const [audienciaKind, setAudienciaKind] = useState<AudienciaKind>('rule');
  const [confirmandoSalvar, setConfirmandoSalvar] = useState(false);
  const [audienciaSalva, setAudienciaSalva] = useState<MultiplixAudienceSaveResult | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [erroAplicar, setErroAplicar] = useState<string | null>(null);
  const [aplicarResultado, setAplicarResultado] = useState<{ texto: string; divergente: boolean } | null>(null);
  const dispatches = useMultiplixDispatchesList();
  const selectableRows = rows.slice(0, MAX_SELECTABLE);

  const filters: MultiplixSearchFilters = useMemo(() => ({
    roles: role ? [role] : undefined,
    ramo: ramo || undefined,
    uf: uf || undefined,
    search: term || undefined,
  }), [role, ramo, uf, term]);

  const selecionados = useMemo(() => Array.from(selected), [selected]);
  // O disparo leva a selecao MENOS as exclusoes (exclusao vence inclusao).
  const efetivos = useMemo(() => selecionados.filter((id) => !excluded.has(id)), [selecionados, excluded]);
  const foraDoFiltro = useMemo(
    () => selecionados.filter((id) => confirmadosNoFiltro !== null && !confirmadosNoFiltro.has(id)),
    [selecionados, confirmadosNoFiltro],
  );
  const podeSalvarPublico = audienciaNome.trim() !== ''
    && (audienciaKind === 'rule' ? temAlgumFiltro(filters) : efetivos.length > 0);

  const runSearch = () => {
    // F75/E131: a selecao SOBREVIVE a troca de filtro (era `setSelected(new
    // Set())` aqui) — o publico e o que o operador marcou; o filtro e so a
    // lente. Sem isto, cada troca de papel/ramo/UF apagava ate 500 marcas.
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
    // F75/E134: a confirmacao anterior era do filtro ANTIGO — apaga antes de
    // comparar, senao o numero na tela seria de outra lente.
    setConfirmadosNoFiltro(null);
    // F75/E134: o servidor diz, para os selecionados, quais continuam DENTRO do
    // filtro submetido; o que sobra e o "N fora do filtro atual". Sem selecao
    // nao ha o que preservar e a chamada nem acontece.
    if (selecionados.length > 0) {
      audienciaSelect.mutate(
        { manual: { companyIds: selecionados }, filters },
        { onSuccess: (resultado) => setConfirmadosNoFiltro(new Set(resultado.recipients.map((r) => r.company_id))) },
      );
    }
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
    // F75/E134: a linha veio do resultado do filtro SUBMETIDO — ela esta dentro
    // dele. Sem isto as marcadas depois da comparacao entrariam na conta de
    // "fora do filtro atual" so por nao estarem no conjunto confirmado.
    if (!selected.has(companyId)) {
      setConfirmadosNoFiltro((prev) => (prev ? new Set(prev).add(companyId) : prev));
    }
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
    const ids = selectableRows.map((r) => r.company_id);
    setSelected(new Set(ids));
    // F75/E134: todas vieram do resultado do filtro submetido.
    setConfirmadosNoFiltro((prev) => (prev ? new Set([...prev, ...ids]) : prev));
  };

  const toggleExcluido = (companyId: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  /**
   * F75: grava o publico. O aviso vem ANTES da escrita e muda com o tipo —
   * regra acompanha os filtros (o tamanho muda sozinho), lista fixa congela as
   * empresas escolhidas agora.
   */
  const confirmarSalvarPublico = () => {
    const nome = audienciaNome.trim();
    const entrada = audienciaKind === 'rule'
      ? { name: nome, kind: 'rule' as const, definition: filters }
      : { name: nome, kind: 'static_list' as const, members: { companyIds: efetivos } };
    setErroSalvar(null);
    audienciaSave.mutate(entrada, {
      onSuccess: (salvo) => {
        // O sucesso so aparece depois da resposta da edge.
        setAudienciaSalva(salvo);
        setConfirmandoSalvar(false);
        toast.success(`Público "${salvo.name}" salvo.`);
      },
      // Falha de escrita nao pode ficar em silencio: o aviso continua aberto
      // com o motivo, para o operador tentar de novo.
      onError: (erro) => setErroSalvar(erro instanceof Error ? erro.message : 'Falha ao salvar o público.'),
    });
  };

  /**
   * F75: aplica um publico SALVO por referencia. A tela mostra os numeros do
   * SERVIDOR: `count` e o tamanho da regra e `eligible_count` os aptos de
   * agora — quando divergem, a diferenca nao entra no disparo.
   *
   * A criacao do disparo por referencia (`audience_id` no payload) e da camada
   * de hooks/edge, nao desta tela: aqui o publico aplicado e lido, nao
   * expandido em company_ids no navegador.
   */
  const aplicarPublicoSalvo = () => {
    if (!audienciaSalva) return;
    setErroAplicar(null);
    setAplicarResultado(null);
    audienciaApply.mutate({ audienceId: audienciaSalva.id }, {
      onSuccess: (resultado) => {
        const tamanhoDaRegra = resultado.count;
        const aptos = resultado.eligible_count;
        const divergente = tamanhoDaRegra !== null && aptos !== null && tamanhoDaRegra !== aptos;
        setAplicarResultado({
          divergente,
          texto: `Público "${audienciaSalva.name}" lido do servidor: `
            + `${tamanhoDaRegra ?? 'tamanho não informado'} empresa(s) · `
            + `${aptos ?? 'aptos não informados'} apta(s) agora.`
            + (divergente ? ' A diferença não entra no disparo.' : ''),
        });
      },
      onError: (erro) => setErroAplicar(erro instanceof Error ? erro.message : 'Falha ao aplicar o público.'),
    });
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

      {/* F75: exclusao vence inclusao — dito na tela, sem depender do rodape. */}
      {excluded.size > 0 && (
        <p role="status" className="text-sm text-destructive">
          <strong>{excluded.size}</strong> empresa(s) excluída(s) — exclusão vence a seleção: ficam fora do disparo mesmo se estiverem marcadas como selecionadas.
        </p>
      )}

      <section aria-label="Público salvo" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Nome do público</span>
          <Input
            aria-label="Nome do público"
            value={audienciaNome}
            onChange={(e) => setAudienciaNome(e.target.value)}
            placeholder="Ex.: Fornecedores de SP"
            className="w-56"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Tipo</span>
          <div role="group" aria-label="Tipo de público" className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant={audienciaKind === 'rule' ? 'default' : 'outline'}
              aria-pressed={audienciaKind === 'rule'}
              onClick={() => setAudienciaKind('rule')}
            >
              Regra (filtros do painel)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={audienciaKind === 'static_list' ? 'default' : 'outline'}
              aria-pressed={audienciaKind === 'static_list'}
              onClick={() => setAudienciaKind('static_list')}
            >
              Lista fixa (selecionadas)
            </Button>
          </div>
        </div>

        <Button type="button" onClick={() => setConfirmandoSalvar(true)} disabled={!podeSalvarPublico || audienciaSave.isPending}>
          Salvar público
        </Button>

        <Button type="button" variant="outline" onClick={aplicarPublicoSalvo} disabled={!audienciaSalva || audienciaApply.isPending}>
          {audienciaApply.isPending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : null}
          Aplicar público salvo
        </Button>

        <p className="text-xs text-muted-foreground" aria-live="polite">
          {audienciaSalva
            ? `Público salvo: ${audienciaSalva.name} · ${AUDIENCE_KIND_LABELS[audienciaSalva.kind]}`
            : 'Nenhum público salvo nesta sessão.'}
        </p>
      </section>

      {confirmandoSalvar && (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
          <p>
            {audienciaKind === 'rule'
              ? `Regra: guarda os filtros do painel (${resumoFiltros(filters)}). O tamanho é recalculado a cada uso, então pode divergir dos aptos na hora do disparo.`
              : `Lista fixa: guarda as ${efetivos.length} empresa(s) selecionadas agora — as excluídas ficam de fora — e não acompanha mudanças no cadastro.`}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={confirmarSalvarPublico} disabled={audienciaSave.isPending}>Confirmar e salvar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmandoSalvar(false)}>Cancelar</Button>
          </div>
          {erroSalvar && (
            <p className="text-destructive">Não foi possível salvar o público: {erroSalvar}</p>
          )}
        </div>
      )}

      {aplicarResultado && (
        <p role="status" className={aplicarResultado.divergente ? 'text-sm text-warning' : 'text-sm text-muted-foreground'}>
          {aplicarResultado.texto}
        </p>
      )}

      {erroAplicar && (
        <p role="status" className="text-sm text-destructive">Não foi possível aplicar o público: {erroAplicar}</p>
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
                <TableHead className="w-16">Excluir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.company_id} className={excluded.has(row.company_id) ? 'text-muted-foreground' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.company_id)}
                      onCheckedChange={() => toggleRow(row.company_id)}
                      aria-label={`Selecionar ${row.company_name}`}
                    />
                  </TableCell>
                  <TableCell>
                    {/* F75: o nome abre o detalhe do contato (empresa, papéis,
                        origem, destino, elegibilidade e motivo). */}
                    <ContatoDetalhe row={row} />
                  </TableCell>
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
                  <TableCell>
                    <Checkbox
                      checked={excluded.has(row.company_id)}
                      onCheckedChange={() => toggleExcluido(row.company_id)}
                      aria-label={`Excluir ${row.company_name}`}
                      className="data-[state=checked]:bg-destructive data-[state=checked]:text-destructive-foreground"
                    />
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
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
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-4 self-center rounded-2xl border border-[--zapp-border] bg-[--zapp-surface-1] px-4 py-3 shadow-lg">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm">
              <strong>{efetivos.length}</strong> empresa(s) no disparo
              {excluded.size > 0 && ` · ${excluded.size} excluída(s)`}
            </span>
            {/* F75/E134: "N fora do filtro atual · seleção preservada" — o N é a
                diferença que o SERVIDOR confirmou depois da troca de filtro. */}
            <span className="text-xs text-muted-foreground" aria-live="polite" data-testid="aviso-selecao">
              {foraDoFiltro.length > 0
                ? `${foraDoFiltro.length} fora do filtro atual · seleção preservada`
                : 'Seleção preservada ao trocar o filtro.'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {excluded.size > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setExcluded(new Set())}>Limpar exclusões</Button>
            )}
            <Button onClick={() => setComposerOpen(true)} disabled={efetivos.length === 0}>Criar disparo</Button>
          </div>
        </div>
      )}

      <MultiplixComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        selectedCompanyIds={efetivos}
        onCreated={(dispatchId) => {
          setSelected(new Set());
          setExcluded(new Set());
          setConfirmadosNoFiltro(null);
          dispatches.refetch();
          setMonitorId(dispatchId);
        }}
      />
    </div>
  );
}
