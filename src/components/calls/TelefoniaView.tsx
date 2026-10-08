import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, FileAudio,
  Loader2, Search, X, Save,
} from 'lucide-react';
import { format, formatDuration, intervalToDuration } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { NewCallPanel } from './NewCallPanel';
import { ActiveCallPanel } from './ActiveCallPanel';
import { SelectedCallPanel } from './SelectedCallPanel';
import { useCallSession } from '@/providers/CallSessionProvider';
import { useAuth } from '@/hooks/auth/useAuth';
import { useCalls } from '@/hooks/communication/useCalls';
import { claimLeadership } from '@/lib/calls/tabLeaderStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { TelefoniaTopActions } from './TelefoniaTopActions';
import { CallHistoryCard } from './CallHistoryCard';
import { CallHistoryTabs } from './CallHistoryTabs';
import { CallHistoryToolbar } from './CallHistoryToolbar';
import { CallHistoryTable } from './CallHistoryTable';
import { CallHistoryEmpty, CallHistoryError, CallHistorySkeleton } from './CallHistoryStates';
import { CallsPagination } from './CallsPagination';
import { useMyCalls, type SearchMyCallsRow } from '@/hooks/calls/useMyCalls';
import { useUserRole } from '@/hooks/system/useUserRole';
import { dispatchStartCall } from '@/lib/calls/events';
import { formatClock, talkSeconds } from '@/lib/calls/duration';
import { CallsKpiGrid } from './CallsKpiGrid';
import { CallRowMobile } from './CallRowMobile';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useTelefoniaFilters } from '@/hooks/calls/useTelefoniaFilters';
import type { PeriodoValue } from './periodos';

/**
 * T77 — os dois cortes de largura desta tela:
 *   · abaixo de 1280 (`xl`) o painel lateral não cabe na grade ao lado do histórico: ele
 *     passa a ser um `Sheet`, aberto pelo botão do topRight e pela seleção de uma linha;
 *   · abaixo de 768 (`md`) a tabela de 7 colunas vira a lista `CallRowMobile`.
 *
 * Ambos vêm do `matchMedia` (é o breakpoint), lido por `useSyncExternalStore` e NÃO por
 * `useState` + efeito: a guarda da casa (`react-hooks/set-state-in-effect`) reprova
 * `setState` no corpo do efeito — e o estado inicial `undefined` do `useIsMobile` custa um
 * render a mais depois da montagem (que a view não precisa pagar).
 */
const QUERY_PAINEL_EM_SHEET = '(max-width: 1279px)';
const QUERY_HISTORICO_EM_CARTOES = '(max-width: 767px)';

function useConsultaDeLargura(consulta: string): boolean {
  const assinar = useCallback((notificar: () => void) => {
    const alvo = window.matchMedia(consulta);
    alvo.addEventListener('change', notificar);
    return () => alvo.removeEventListener('change', notificar);
  }, [consulta]);

  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}

const DIRECTION_OPTIONS: { value: 'all' | 'inbound' | 'outbound'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'inbound', label: 'Recebidas' },
  { value: 'outbound', label: 'Realizadas' },
];

const CHANNEL_OPTIONS: { value: 'all' | 'voip' | 'whatsapp'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'voip', label: 'VoIP' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const RESULT_OPTIONS: { value: 'all' | string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'ended_answered', label: 'Concluída' },
  { value: 'ended_missed', label: 'Não atendida' },
  { value: 'missed', label: 'Perdida' },
  { value: 'busy', label: 'Ocupado' },
  { value: 'failed', label: 'Falhou' },
];

export function TelefoniaView() {
  const { profile } = useAuth();
  // T36: os filtros vivem na URL; o periodo da tela e o da URL.
  const { filtros, setFilter, limpar } = useTelefoniaFilters();
  const period = filtros.period as PeriodoValue;
  const sip = useCallSession();
  // T62: enquanto a sessao nao volta para `idle`, o slot lateral mostra a LIGACAO -
  // nao faz sentido oferecer "digite um numero" com uma chamada de pe.
  const sessaoAtiva = Boolean(sip.session && sip.session.status !== 'idle');
  // T20: o motivo da linha VoIP (é o `line_in_use_other_tab` que importa aqui)
  // vem do `useSipClient` e é repassado pelo `CallSessionApi` — acesso direto,
  // já tipado pelo domínio (`CapabilityReason | null`).
  const sipReason = sip.sipReason ?? null;
  const { addCallNotes } = useCalls();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [channel, setChannel] = useState<'all' | 'voip' | 'whatsapp'>('all');
  const [result, setResult] = useState<'all' | string>('all');
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  // T77: a largura decide o layout — abaixo de 1280 o painel é `Sheet`; abaixo de 768 o
  // histórico vira cartões (`CallRowMobile`).
  const painelEmSheet = useConsultaDeLargura(QUERY_PAINEL_EM_SHEET);
  const historicoEmCartoes = useConsultaDeLargura(QUERY_HISTORICO_EM_CARTOES);
  const [painelAberto, setPainelAberto] = useState(false);

  // T20: a eleição de aba líder COMEÇA aqui. Sem esta reivindicação nenhuma aba
  // assume a sessão, `isLeader()` fica falso e o portão de `connect()`
  // (useSipConnection) recusaria o REGISTER em TODAS elas — a telefonia nunca
  // registraria a linha. Roda uma vez só: `claimLeadership()` é idempotente
  // (o StrictMode monta duas vezes) e o cleanup NÃO solta a liderança — quem
  // reivindica no boot não pode derrubar quem já segura a linha.
  useEffect(() => {
    claimLeadership();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters: Record<string, unknown> = {
    ...(direction !== 'all' ? { direction } : {}),
    ...(channel !== 'all' ? { channel } : {}),
    ...(result !== 'all' ? { result } : {}),
    ...(searchDebounced ? { search: searchDebounced } : {}),
  };

  const historicos = useMyCalls({
    page: Number(filtros.page) || 1,
    period: filtros.period,
    channel: filtros.channel,
    direction: filtros.dir,
    result: filtros.result,
    q: filtros.q,
    scope: filtros.scope,
  });

  const { hasRole } = useUserRole();
  // Escopo so para quem enxerga a operacao inteira (T43); agente comum ve
  // apenas as proprias ligacoes.
  const podeEscolherEscopo = hasRole('admin') || hasRole('supervisor');

  const temFiltro =
    filtros.q !== '' || filtros.dir !== 'all' || filtros.result !== 'all' || filtros.channel !== 'all';

  // "Ligar de volta" usa a MESMA origem de discagem do click-to-call (evento zapp:start-call),
  // porque o `openDialer` do provider nao recebe argumentos - a assinatura que o plano
  // sugeria nao existe no codigo.
  const ligarDeVolta = useCallback((row: SearchMyCallsRow) => {
    const phone = row.contact_phone || row.peer_number;
    if (!phone) return;
    dispatchStartCall({
      channel: row.channel === 'whatsapp' ? 'whatsapp' : 'voip',
      phone,
      contactId: row.contact_id || undefined,
      name: row.peer_name || row.contact_name || undefined,
      source: 'history',
    });
  }, []);

  // A linha selecionada vem da pagina atual do historico. Deep link para uma
  // linha de outra pagina e o T68 (Fase 6); aqui e so a selecao visivel.
  const selectedCall = historicos.rows.find((c) => c.id === (filtros.call || selectedCallId)) ?? null;

  // T77: abaixo de 1280 o painel só existe dentro do `Sheet`, então ele tem de estar
  // aberto quando existe uma linha selecionada — inclusive via deep link (`?call=`).
  const sheetAberto = painelEmSheet && (painelAberto || Boolean(filtros.call));

  useEffect(() => {
    // T16 (D7): a anotação do agente mora em `agent_notes` (T13 grava ali, via
    // RPC); `notes` é metadado do provedor — ler `notes` deixava o campo vazio
    // no ciclo salvar → fechar → reabrir.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega o rascunho da anotação só quando a chamada selecionada muda, não a cada render.
    setNoteDraft(selectedCall?.agent_notes ?? '');
  }, [selectedCall?.id, selectedCall?.agent_notes]);

  // A linha selecionada vive na URL (T36/T47). Fechar o detalhe limpa o parametro -
  // um estado local paralelo deixaria o painel aberto depois do clique.
  const resetSelection = () => setFilter('call', '');

  const getDirectionIcon = (direction: string, status: string) => {
    if (status === 'missed') return <PhoneMissed className="w-4 h-4 text-destructive" />;
    if (direction === 'inbound') return <PhoneIncoming className="w-4 h-4 text-success" />;
    return <PhoneOutgoing className="w-4 h-4 text-primary" />;
  };

  const formatCallDuration = (seconds: number | null) => {
    if (!seconds) return '—';
    const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
    return formatDuration(duration, { format: ['hours', 'minutes', 'seconds'], locale: ptBR });
  };

  const getChannelLabel = (call: SearchMyCallsRow) => (call.channel === 'whatsapp' ? 'WhatsApp' : 'VoIP');

  const getContactLabel = (call: SearchMyCallsRow) =>
    call.peer_name || call.contact_name || call.peer_number || (call.direction === 'inbound' ? 'Chamada recebida' : 'Chamada realizada');

  const getStatusBadge = (call: SearchMyCallsRow) => {
    if (call.status === 'ended') {
      return call.answered_at
        ? <Badge className="text-3xs">Concluída</Badge>
        : <Badge variant="destructive" className="text-3xs">Não atendida</Badge>;
    }
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      ringing: { variant: 'outline', label: 'Tocando' },
      answered: { variant: 'default', label: 'Em andamento' },
      missed: { variant: 'destructive', label: 'Perdida' },
      busy: { variant: 'secondary', label: 'Ocupado' },
      failed: { variant: 'destructive', label: 'Falhou' },
    };
    const s = map[call.status] || { variant: 'secondary' as const, label: call.status };
    return <Badge variant={s.variant} className="text-3xs">{s.label}</Badge>;
  };


  const handleSaveNote = async () => {
    if (!selectedCall) return;
    setNoteSaving(true);
    const salvou = await addCallNotes(selectedCall.id, noteDraft);
    setNoteSaving(false);
    // T16 (D7): sem invalidar, o detalhe reaberto lê o cache antigo (anotação
    // vazia). T83 do plano: `set_call_agent_notes` → `invalidateQueries(['calls'])`.
    if (salvou) await queryClient.invalidateQueries({ queryKey: ['calls-history'] });
  };

  // T77: o mesmo painel (discador, chamada em andamento ou detalhe) é o conteúdo da
  // coluna lateral (>=1280) e do Sheet (<1280). Um só lugar para os dois — nunca os dois.
  const painel = selectedCall ? (
    <SelectedCallPanel call={selectedCall} onClose={resetSelection} />
  ) : sessaoAtiva ? (
    <ActiveCallPanel segundos={sip.callDuration} />
  ) : (
    <NewCallPanel />
  );

  return (
    <div data-testid="tel-view" className="w-full flex flex-col gap-4 min-w-0">
      {/* T34: header da tela passa a ser o PageHeader do app, na variante plain, com o icone
          que o T34 acrescentou la. O motion.div local saiu. O topRight entra no T35. */}
      <PageHeader
        variant="plain"
        icon={<Phone className="w-6 h-6 text-primary" />}
        title="Telefonia"
        subtitle="Suas ligações por VoIP e WhatsApp"
        topRight={
          <div className="flex items-center gap-2">
            {/* T77: abaixo de 1280 o painel não tem coluna — o botão do aceite o abre. */}
            {painelEmSheet && (
              <Button variant="outline" size="sm" onClick={() => setPainelAberto(true)} data-testid="tel-abrir-painel">
                <PhoneCall className="mr-2 h-4 w-4" />
                Nova ligação
              </Button>
            )}
            <TelefoniaTopActions period={period} onPeriodChange={(v) => setFilter('period', v)} />
          </div>
        }
      />

      {/* T38/T39: KPIs do periodo/canal/escopo que estao na URL. */}
      <CallsKpiGrid period={filtros.period} channel={filtros.channel} scope={filtros.scope} />


      <div className="grid grid-cols-1 gap-4 items-start xl:grid-cols-[minmax(0,1fr)_408px]">
        {/* Fase 4 (T43-T53): o historico agora vem da RPC `search_my_calls`, paginado no
            servidor (8 por pagina). Os filtros continuam sendo os da URL (T36), entao
            trocar busca, direcao, resultado, aba de canal, escopo ou pagina refaz a
            consulta e o link compartilhado abre no mesmo recorte. */}
        <CallHistoryCard
          total={historicos.total}
          escopo={filtros.scope}
          onEscopoChange={(v) => setFilter('scope', v)}
          podeEscolherEscopo={podeEscolherEscopo}
        >
          <CallHistoryTabs canal={filtros.channel} onCanalChange={(v) => setFilter('channel', v)} />
          <CallHistoryToolbar
            busca={filtros.q}
            direcao={filtros.dir}
            resultado={filtros.result}
            onBuscaChange={(v) => setFilter('q', v)}
            onDirecaoChange={(v) => setFilter('dir', v)}
            onResultadoChange={(v) => setFilter('result', v)}
          />

          {historicos.isError ? (
            <CallHistoryError onTentarNovamente={() => historicos.refetch()} />
          ) : historicos.isLoading ? (
            <CallHistorySkeleton />
          ) : historicos.rows.length === 0 ? (
            <CallHistoryEmpty
              porFiltro={temFiltro}
              onLimparFiltros={() => limpar()}
              onNovaLigacao={() => limpar()}
            />
          ) : historicoEmCartoes ? (
            /* T77: 390 — a tabela de 7 colunas não cabe; cada ligação vira um cartão. */
            <CallRowMobile
              rows={historicos.rows}
              selecionadaId={filtros.call || null}
              onSelecionar={(id) => setFilter('call', id)}
              onLigarDeVolta={ligarDeVolta}
            />
          ) : (
            <CallHistoryTable
              rows={historicos.rows}
              selecionadaId={filtros.call || null}
              onSelecionar={(id) => setFilter('call', id)}
              onLimparSelecao={resetSelection}
              onLigarDeVolta={ligarDeVolta}
            />
          )}

          <CallsPagination
            page={historicos.page}
            pages={historicos.pages}
            onPageChange={(p) => setFilter('page', String(p))}
          />
        </CallHistoryCard>
        {/* Painel lateral: discador ou detalhe da chamada selecionada. Acima de 1280 ele
            fica na coluna da grade; abaixo disso quem existe é o Sheet (ver abaixo). */}
        {!painelEmSheet && (
          <div className="xl:sticky xl:top-4" data-testid="tel-side-panel">
            <Card className="border-secondary/30">
              <CardContent className="p-6">{painel}</CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* T77: <1280 — o painel vira Sheet lateral, aberto pelo botão do topRight ou pela
          seleção de uma linha. Fechar o Sheet limpa a seleção, como o "X" do detalhe. */}
      {painelEmSheet && (
        <Sheet
          open={sheetAberto}
          onOpenChange={(aberto) => {
            setPainelAberto(aberto);
            if (!aberto) resetSelection();
          }}
        >
          {/* Largura padrão do Sheet (w-3/4, sm:max-w-sm): é a largura em que o painel
              lateral já vive no desktop; aqui só o transbordo vertical é ajustado. */}
          <SheetContent
            side="right"
            className="overflow-y-auto"
            data-testid="tel-side-sheet"
          >
            <SheetHeader>
              <SheetTitle className="sr-only">Painel de ligações</SheetTitle>
              <SheetDescription className="sr-only">
                Discador, ligação em andamento e detalhe da chamada selecionada.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">{painel}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
