import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Pause, Play, Square, Send, XCircle, AlertTriangle, Clock, BarChart3, ArrowLeft, CheckCircle2, MessageCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import {
  useMultiplixDispatch, useMultiplixRecipients, useMultiplixDispatchAction,
  useConfirmMultiplixDispatch, MultiplixDispatchEdgeError,
  fetchMultiplixRecipientsTotal, useMultiplixEstimate,
  type MultiplixRecipientRow,
} from '@/hooks/integrations/useMultiplixDispatches';
import { useMultiplixReplies, type MultiplixReplyAttribution } from '@/hooks/integrations/useMultiplixReplies';
import { openContactChat } from '@/components/catalog/useSendProduct';
import {
  IconTile, StatusPill, fmtInt, pct, fmtDateTime,
} from '@/components/talkx/talkxShared';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

const RECIPIENT_STATUS: Record<string, { label: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'violet' | 'muted' }> = {
  pending: { label: 'Na fila', tone: 'muted' },
  sending: { label: 'Enviando', tone: 'info' },
  sent: { label: 'Enviada', tone: 'success' },
  delivered: { label: 'Entregue', tone: 'success' },
  failed: { label: 'Falha', tone: 'danger' },
  outcome_unknown: { label: 'A confirmar', tone: 'warning' },
  skipped: { label: 'Sem WhatsApp', tone: 'muted' },
};

/**
 * F80: texto legivel das falhas de LEITURA do disparo. A consulta devolve o erro
 * NOMEADO da edge (`MultiplixDispatchEdgeError.code`) nos casos que ela mesma
 * decide; sem a traducao o operador leria o codigo cru
 * ("multiplix_dispatch_not_found") em vez de entender o que aconteceu.
 */
const DISPATCH_LOAD_ERROR_TEXT: Record<string, string> = {
  multiplix_dispatch_not_found: 'O disparo não foi encontrado. Ele pode ter sido removido ou pertencer a outro usuário.',
  multiplix_list_shape: 'O servidor respondeu num formato inesperado. Tente de novo em instantes.',
  rate_limited: 'Muitas consultas seguidas. Aguarde alguns instantes e tente de novo.',
  'Not authenticated': 'Sua sessão expirou. Entre novamente para abrir o disparo.',
};

function dispatchLoadErrorText(error: unknown): string {
  if (error instanceof MultiplixDispatchEdgeError) {
    return DISPATCH_LOAD_ERROR_TEXT[error.code] ?? error.message;
  }
  if (error instanceof Error) {
    return DISPATCH_LOAD_ERROR_TEXT[error.message] ?? error.message;
  }
  return 'Falha ao ler o disparo.';
}

/**
 * F49 — a revalidacao que o `confirm` roda ANTES de congelar devolve erro
 * NOMEADO (a RPC recusa a materializacao inteira, nunca deixa fila pela metade).
 * Sem esta traducao o operador leria o codigo cru da edge
 * ("multiplix_confirm_no_blocks") e nao saberia o que corrigir — e o disparo
 * continua sem enviar nada enquanto isso.
 */
const CONFIRM_BLOCKERS: Record<string, string> = {
  multiplix_confirm_no_recipients: 'o disparo ficou sem destinatário',
  multiplix_confirm_no_eligible_recipients: 'nenhum destinatário está apto a receber',
  multiplix_confirm_no_blocks: 'o disparo ainda não tem bloco de mensagem',
  multiplix_confirm_connection_required: 'o disparo não tem conexão de envio definida',
  multiplix_confirm_connection_unavailable: 'a conexão de envio do disparo está desconectada',
};

function confirmErrorMessage(error: unknown): string {
  const code = error instanceof MultiplixDispatchEdgeError ? error.code : null;
  const blocker = code ? CONFIRM_BLOCKERS[code] : undefined;
  if (blocker) return `Não foi possível iniciar: ${blocker}.`;
  return error instanceof Error ? error.message : 'Erro ao confirmar disparo';
}

const REPLY_ATTRIBUTION_TEXT: Record<MultiplixReplyAttribution, string> = {
  linked: 'Respondeu à mensagem do disparo',
  inferred: 'Resposta associada pelo telefone e pela janela de tempo',
};

/**
 * F84 — Sala de retornos: visao filtrada do Chat com SO quem respondeu ao disparo.
 * Decide pelo `status` do hook, nunca por `replies.length === 0`: erro de contrato
 * da edge e carregando NAO sao "ninguem respondeu". Linha sem `contact_id` (telefone
 * sem contato unico) nao tem botao — nunca abre a conversa de outro contato.
 */
function ReturnsRoom({ dispatchId }: { dispatchId: string }) {
  const { replies, status, error, isRefreshing, refetch } = useMultiplixReplies(dispatchId);
  return (
    <section aria-label="Retornos" className="rounded-2xl bg-card border border-border/70 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <MessageCircle className="w-4 h-4" />Retornos
          {status === 'ready' && (
            <span className="ml-1.5 text-xs font-normal text-foreground-secondary tabular-nums">{fmtInt(replies.length)}</span>
          )}
        </p>
        <button
          type="button"
          onClick={refetch}
          disabled={isRefreshing}
          className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium text-foreground-secondary hover:bg-muted/50 disabled:opacity-60"
        >
          {isRefreshing ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>
      {status === 'loading' && (
        <p role="status" className="text-center py-8 text-muted-foreground text-xs motion-safe:animate-pulse">Carregando retornos…</p>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-1.5 px-4 py-2 text-2xs text-dash-red border-b border-dash-red/20 bg-dash-red/5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">Não foi possível carregar os retornos: {error.message}</span>
          {status === 'error' && (
            <button type="button" onClick={refetch} className="ml-auto shrink-0 underline font-medium">Tentar de novo</button>
          )}
        </div>
      )}
      {status === 'empty' && (
        <p className="text-center py-8 text-muted-foreground text-xs">Nenhum retorno neste disparo ainda</p>
      )}
      {status === 'ready' && (
        <div role="region" aria-label="Lista de retornos" tabIndex={0} className="max-h-[30rem] overflow-auto divide-y divide-border/40">
          {replies.map((r) => (
            <div key={r.recipient_id} data-testid="reply-row" className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{r.company_name || 'Empresa'}</p>
                <p className="text-2xs text-foreground-secondary truncate">{r.destino_e164 ?? 'sem WhatsApp'}</p>
                {r.reply_attribution && (
                  <p className="text-3xs text-muted-foreground truncate">{REPLY_ATTRIBUTION_TEXT[r.reply_attribution]}</p>
                )}
              </div>
              <span className="text-3xs text-muted-foreground shrink-0">{fmtDateTime(r.replied_at)}</span>
              {r.contact_id && (
                <button
                  type="button"
                  onClick={() => openContactChat(r.contact_id as string)}
                  className="h-8 px-3 rounded-lg border border-primary/40 bg-primary/10 text-[hsl(var(--primary-text))] text-xs font-semibold shrink-0 transition-colors motion-safe:duration-150 hover:bg-primary/20"
                >
                  Abrir conversa
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface Props { dispatchId: string; onBack: () => void }

/**
 * F87 — render isolado por linha. A linha da lista de destinatarios tem
 * componente proprio + `React.memo`: o monitor re-renderiza a cada interacao
 * local (AlertDialog de pausar/cancelar) e a cada atualizacao de dados (canal
 * realtime debounced + contagem de pulados a cada 5s), e a lista carrega em
 * blocos de 500. Com o JSX inline, cada um desses eventos re-renderizava TODA a
 * lista carregada. Com `React.memo`, a linha so re-renderiza quando o proprio
 * objeto de dado muda (comparacao rasa das props — uma leitura nova cria
 * objetos novos e re-renderiza; um re-render da tela sem dado novo, nao).
 */
const RecipientRow = React.memo(function RecipientRow({ r }: { r: MultiplixRecipientRow }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{r.company_name_snapshot || 'Empresa'}</p>
        <p className="text-2xs text-foreground-secondary truncate">{r.destino_e164 ?? 'sem WhatsApp'}</p>
        {r.error_message && <p className="text-2xs text-dash-red truncate">{r.error_message}</p>}
        {((r.attempt_count ?? 0) > 0 || r.external_id) && (
          <p className="text-3xs text-muted-foreground truncate">
            {(r.attempt_count ?? 0) > 0 && <span data-testid="recipient-attempts">{r.attempt_count} {r.attempt_count === 1 ? 'tentativa' : 'tentativas'}</span>}
            {(r.attempt_count ?? 0) > 0 && r.external_id && ' · '}
            {r.external_id && <span data-testid="recipient-external-id">ID {r.external_id}</span>}
          </p>
        )}
      </div>
      <StatusPill status={r.status} map={RECIPIENT_STATUS} />
      {r.sent_at && <span className="text-3xs text-muted-foreground shrink-0">{fmtDateTime(r.sent_at)}</span>}
    </div>
  );
});


export function MultiplixMonitor({ dispatchId, onBack }: Props) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmPause, setConfirmPause] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);

  // F80: a leitura do disparo tem TRES estados na tela — carregando, erro e pronto.
  // Antes so o `data` era lido: qualquer falha (disparo removido, sem permissao,
  // edge/rede fora) deixava `dispatch` indefinido e a tela ficava no skeleton para
  // sempre, sem dizer o que houve nem oferecer saida.
  const {
    data: dispatch,
    error: dispatchError,
    isError: dispatchFailed,
    isFetching: dispatchRefetching,
    refetch: refetchDispatch,
  } = useMultiplixDispatch(dispatchId);
  // R2-MOD-022: FALHA e VAZIO sao estados diferentes. O default `= []` engolia a
  // rejeicao da consulta e a tela anunciava "Nenhum destinatario encontrado" numa
  // leitura que falhou — o operador lia um disparo sem destinatarios onde havia erro.
  // F80: CARREGANDO tambem nao e vazio — a primeira pagina em andamento nao pode
  // ser anunciada como lista vazia confirmada.
  const {
    data: recipientsData,
    isError: recipientsFailed,
    error: recipientsError,
    isPending: recipientsLoading,
  } = useMultiplixRecipients(dispatchId, statusFilter);
  const recipients = recipientsData?.rows ?? [];
  const recipientsTotal = recipientsData?.total ?? null;
  const action = useMultiplixDispatchAction();
  // F51: o confirm e a transacao que gera a fila por itens; sem ela o worker
  // (`multiplix-send`, que processa `multiplix_delivery_items`) nao tem o que enviar.
  const confirmDispatch = useConfirmMultiplixDispatch();

  // total_recipients/sent_count/failed_count/outcome_unknown_count nao contam
  // 'skipped' (empresa sem WhatsApp) -- sem isso, um disparo com destinatarios
  // pulados nunca chega a 100% e "Restantes" fica preso contando quem ja foi
  // resolvido como sem destino.
  // F80: `fetchMultiplixRecipientsTotal` FALHA ALTO quando o servidor nao devolve
  // o total exato (ver o hook). Engolir essa falha no default `= 0` desfazia o que
  // a funcao promete: o progresso fechava abaixo do real, com "Restantes" inflado,
  // sem nenhum aviso. Aqui a falha da contagem e um estado proprio da tela.
  const { data: skippedCount = 0, isError: skippedCountFailed } = useQuery({
    queryKey: ['multiplix-skipped-count', dispatchId],
    queryFn: () => fetchMultiplixRecipientsTotal(dispatchId, 'skipped'),
    enabled: !!dispatchId,
    refetchInterval: 5_000,
  });

  // F50: os TRES numeros da estimativa do disparo — mensagens (aptos x blocos),
  // versoes de roteiro (distintas entre os roteiros finais) e consumo de voz —
  // vem do SERVIDOR (acao `estimate`); a tela nao recalcula nem arredonda.
  const { data: estimate, isError: estimateFailed } = useMultiplixEstimate(dispatchId);

  const dispatchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recipientsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // F86 (TL-045): a lista de disparos e desmontada quando o monitor abre; sem
  // mover o foco, quem navega por teclado volta para o <body> e perde o lugar
  // na troca lista<->monitor. O titulo (tabIndex -1) recebe o foco quando o
  // disparo chega -- o efeito roda de novo por id, nao a cada re-render do
  // realtime.
  useEffect(() => {
    headingRef.current?.focus();
  }, [dispatch?.id]);

  useEffect(() => {
    // Debounce 500ms nos dois handlers: durante envio ativo cada destinatario
    // processado gera 1 UPDATE em multiplix_dispatches (contadores) + 1 em
    // multiplix_recipients -- sem debounce, um disparo de centenas de
    // destinatarios dispara uma invalidateQueries por linha (mesmo padrao de
    // rajada ja tratado em useTalkX.ts).
    const ch = supabase.channel(`multiplix-mon-${dispatchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'multiplix_dispatches', filter: `id=eq.${dispatchId}` }, () => {
        if (dispatchDebounceRef.current) clearTimeout(dispatchDebounceRef.current);
        dispatchDebounceRef.current = setTimeout(() => qc.invalidateQueries({ queryKey: ['multiplix-dispatch', dispatchId] }), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplix_recipients', filter: `dispatch_id=eq.${dispatchId}` }, () => {
        if (recipientsDebounceRef.current) clearTimeout(recipientsDebounceRef.current);
        recipientsDebounceRef.current = setTimeout(() => qc.invalidateQueries({ queryKey: ['multiplix-recipients', dispatchId, statusFilter] }), 500);
      })
      .subscribe();
    return () => {
      if (dispatchDebounceRef.current) clearTimeout(dispatchDebounceRef.current);
      if (recipientsDebounceRef.current) clearTimeout(recipientsDebounceRef.current);
      supabase.removeChannel(ch);
    };
  }, [dispatchId, statusFilter, qc]);

  const runAction = async (a: 'start' | 'pause' | 'cancel') => {
    try {
      await action.mutateAsync({ dispatchId, action: a });
      qc.invalidateQueries({ queryKey: ['multiplix-dispatch', dispatchId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar disparo');
    }
  };

  // F80: LER o disparo pode falhar (removido, de outro usuario, edge/rede fora) —
  // e falha explicada na tela, com saida. Antes este caminho caia no skeleton
  // abaixo e ficava nele para sempre: o operador esperava uma resposta que nunca
  // vinha, sem mensagem e sem botao.
  // `!dispatch` no teste de proposito: o refetch de 5s pode falhar num soluco de
  // rede DEPOIS de a tela ja estar carregada — nesse caso o disparo continua na
  // tela (dado bom e mais recente que o erro) e so a leitura sem NENHUM dado vira
  // a tela de erro.
  if (dispatchFailed && !dispatch) {
    return (
      <div className="space-y-4 min-w-0">
        <button type="button" onClick={onBack} className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:bg-muted/50 w-fit">
          <ArrowLeft className="w-4 h-4" />Voltar aos disparos
        </button>
        <div className="rounded-2xl bg-card border border-dash-red/40 bg-dash-red/5 p-4 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-dash-red shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Não foi possível carregar o disparo</p>
            <p role="status" className="text-xs text-foreground-secondary break-words mt-0.5">{dispatchLoadErrorText(dispatchError)}</p>
            <button
              type="button"
              onClick={() => void refetchDispatch()}
              disabled={dispatchRefetching}
              className="mt-2 h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium text-foreground-secondary hover:bg-muted/50 disabled:opacity-60"
            >
              {dispatchRefetching ? 'Tentando de novo…' : 'Tentar de novo'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!dispatch) {
    return (
      // motion-safe: o pulso do placeholder so anima com movimento permitido
      // (`prefers-reduced-motion` desliga) — regra de efeito sutil do projeto.
      <div role="status" className="space-y-4 motion-safe:animate-pulse">
        <span className="sr-only">Carregando disparo…</span>
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-2xl" />)}
      </div>
    );
  }

  const outcomeUnknown = dispatch.outcome_unknown_count ?? 0;
  const processed = dispatch.sent_count + dispatch.failed_count + outcomeUnknown + skippedCount;
  const progress = dispatch.total_recipients > 0 ? pct(processed, dispatch.total_recipients) : 0;
  const remaining = Math.max(0, dispatch.total_recipients - processed);
  const successRate = processed > 0 ? pct(dispatch.sent_count, processed) : 0;
  const isRunning = dispatch.status === 'sending';
  const isPaused = dispatch.status === 'paused';
  // F10: 'scheduled' nao mostra "Iniciar" — quem inicia e o cron quando o
  // horario chega; antes disso o operador so cancela.
  const isDraft = dispatch.status === 'draft';
  const canStart = isPaused || isDraft;
  const isDone = dispatch.status === 'completed' || dispatch.status === 'completed_with_failures'
    || dispatch.status === 'cancelled' || dispatch.status === 'failed';

  /**
   * F51/MX01: rascunho NAO se inicia pelo worker. `multiplix-send/start` so
   * promove o status e chama o motor, que processa `multiplix_delivery_items` —
   * um rascunho que nunca passou pelo `confirm` tem fila VAZIA: o disparo entra
   * em 'sending', os destinatarios ficam pendentes e nada e enviado.
   *
   * O confirm revalida (F49), congela publico e blocos e materializa os itens na
   * MESMA transacao; como ele ja deixa o disparo em 'sending' (ou 'scheduled',
   * quando ha agendamento), o cron leva a fila ao worker — nao ha um segundo
   * passo de start depois dele. Cliques repetidos mandam a MESMA dispatch_version
   * revisada: a RPC responde `created: false` e a fila e materializada uma vez so.
   */
  const startDraft = async () => {
    try {
      await confirmDispatch.mutateAsync({ dispatchId, dispatchVersion: dispatch.dispatch_version });
      qc.invalidateQueries({ queryKey: ['multiplix-dispatch', dispatchId] });
    } catch (e) {
      toast.error(confirmErrorMessage(e));
    }
  };

  return (
    <div className="space-y-4 min-w-0" data-testid="multiplix-monitor">
      <button type="button" onClick={onBack} className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:bg-muted/50 w-fit">
        <ArrowLeft className="w-4 h-4" />Voltar aos disparos
      </button>

      <div className="rounded-2xl bg-card border border-border/70 p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <IconTile icon={isRunning ? Send : isPaused ? Pause : XCircle} color={isRunning ? 'blue' : isPaused ? 'amber' : dispatch.status === 'completed' ? 'green' : 'red'} size={48} />
            <div className="min-w-0">
              <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-foreground truncate">{dispatch.name}</h2>
              <p className="text-xs text-foreground-secondary line-clamp-1">{dispatch.message_template}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <StatusPill status={dispatch.status} map={DISPATCH_STATUS} />
            {!isDone && (<>
              {isRunning && <button type="button" onClick={() => setConfirmPause(true)} className="h-9 px-3.5 rounded-lg border border-dash-amber/40 bg-dash-amber/10 text-dash-amber text-xs font-semibold flex items-center gap-1.5 hover:bg-dash-amber/20"><Pause className="w-4 h-4" />Pausar</button>}
              {canStart && <button type="button" onClick={() => setConfirmResume(true)} className="h-9 px-3.5 rounded-lg border border-primary/40 bg-primary/10 text-[hsl(var(--primary-text))] text-xs font-semibold flex items-center gap-1.5 hover:bg-primary/20"><Play className="w-4 h-4" />{isPaused ? 'Retomar' : 'Iniciar'}</button>}
              <button type="button" onClick={() => setConfirmCancel(true)} className="h-9 px-3.5 rounded-lg border border-dash-red/40 bg-dash-red/10 text-dash-red text-xs font-semibold flex items-center gap-1.5 hover:bg-dash-red/20"><Square className="w-4 h-4" />Cancelar</button>
            </>)}
          </div>
        </div>
        <Progress value={progress} aria-label="Progresso do disparo" className="h-3 mb-1.5" />
        {/* F86 (TL-045): os contadores e a barra mudam sozinhos (realtime) sem
            ninguem tocar na tela -- este texto e o que a regiao aria-live
            anuncia; sai dos mesmos numeros que a tela mostra. */}
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          data-testid="multiplix-progresso-live"
        >
          {`${progress}% concluído · ${fmtInt(processed)} de ${fmtInt(dispatch.total_recipients)} processados · ${fmtInt(dispatch.failed_count)} falha(s) · ${fmtInt(remaining)} restantes`}
        </span>
        <div className="flex items-center justify-between text-2xs text-foreground-secondary">
          <span>{progress}% concluído · {fmtInt(processed)} de {fmtInt(dispatch.total_recipients)}</span>
          {isRunning && <span className="text-[hsl(var(--primary-text))] font-medium motion-safe:animate-pulse">Enviando agora…</span>}
          {dispatch.completed_at && <span>Concluído em {fmtDateTime(dispatch.completed_at)}</span>}
        </div>
        {/* F80: a contagem de "sem WhatsApp" pode falhar sozinha (o servidor sem o
            total exato) — e o progresso/restantes saem errados. Falha silenciosa
            nao: o operador precisa saber que o numero esta incompleto. */}
        {skippedCountFailed && (
          <p className="text-2xs text-dash-amber flex items-center gap-1.5 mt-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Não foi possível contar os contatos sem WhatsApp; o progresso e o total de restantes podem estar incompletos.
          </p>
        )}
        {/* F10c: o worker grava o motivo da pausa automatica — sem isto o
            operador ve "Pausado" sem saber se pode retomar (cota/window) ou se
            precisa religar a conexao. */}
        {isPaused && dispatch.pause_reason && (
          <p className="text-2xs text-dash-amber flex items-center gap-1.5 mt-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {dispatch.pause_reason === 'daily_limit'
              ? 'Pausado automaticamente: limite diário da conexão atingido'
              : dispatch.pause_reason === 'connection_lost'
                ? 'Pausado automaticamente: conexão do WhatsApp caiu'
                : dispatch.pause_reason === 'outside_window'
                  ? 'Pausado automaticamente: fora da janela de envio'
                  : `Pausado automaticamente: ${dispatch.pause_reason}`}
          </p>
        )}
      </div>

      {/* F50: o que o disparo VAI produzir, conforme o servidor calcula. Os
          numeros de baixo (Enviadas/Falhas/...) sao o que ja aconteceu; estes
          sao o previsto — por isso vem antes. Falha de leitura AVISA: zero aqui
          significa "nada a enviar", nunca "nao deu para saber". */}
      {(estimate || estimateFailed) && (
        <section aria-label="Estimativa do disparo" className="rounded-2xl bg-card border border-border/70 p-4">
          <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" />Estimativa do disparo
          </p>
          {estimateFailed ? (
            <p className="mt-2 text-2xs text-dash-red flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Não foi possível calcular a estimativa deste disparo.</span>
            </p>
          ) : estimate && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              {[
                { l: 'Mensagens', v: fmtInt(estimate.messages), d: `${fmtInt(estimate.eligible_recipients)} aptos × ${fmtInt(estimate.blocks)} blocos` },
                { l: 'Versões de roteiro', v: fmtInt(estimate.script_versions), d: 'roteiros finais distintos' },
                { l: 'Caracteres de voz', v: fmtInt(estimate.voice.characters), d: `${fmtInt(estimate.voice.renderings)} renderizações de voz` },
              ].map(({ l, v, d }) => (
                <div key={l} className="rounded-xl bg-input/40 border border-border/70 p-3 min-w-0">
                  <p className="text-lg font-bold text-foreground tabular-nums">{v}</p>
                  <p className="text-3xs text-foreground-secondary">{l}</p>
                  <p className="text-3xs text-muted-foreground truncate">{d}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { l: 'Enviadas', v: fmtInt(dispatch.sent_count), I: Send, c: 'text-primary' },
          { l: 'Entregues', v: fmtInt(dispatch.delivered_count), I: CheckCircle2, c: 'text-dash-green' },
          { l: 'Falhas', v: fmtInt(dispatch.failed_count), I: XCircle, c: 'text-dash-red' },
          { l: 'A confirmar', v: fmtInt(outcomeUnknown), I: AlertTriangle, c: 'text-dash-amber' },
          { l: 'Restantes', v: fmtInt(remaining), I: Clock, c: 'text-foreground-secondary' },
        ].map(({ l, v, I, c }) => (
          <div key={l} className="rounded-xl bg-card border border-border/70 p-3 flex items-center gap-2">
            <I className={`w-4 h-4 shrink-0 ${c}`} /><div className="min-w-0"><p className="text-lg font-bold text-foreground tabular-nums">{v}</p><p className="text-3xs text-foreground-secondary truncate">{l}</p></div>
          </div>
        ))}
      </div>
      {processed > 0 && (
        <p className="text-xs text-foreground-secondary flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Taxa de sucesso: <strong className="text-foreground">{successRate}%</strong></p>
      )}

      <ReturnsRoom dispatchId={dispatchId} />

      <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <p className="text-sm font-bold text-foreground">
            Destinatários
            {recipientsTotal !== null && (
              <span className="ml-1.5 text-xs font-normal text-foreground-secondary tabular-nums">
                {fmtInt(recipients.length)} de {fmtInt(recipientsTotal)}
              </span>
            )}
          </p>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Filtrar destinatários por status" className="h-8 w-auto bg-input/40 border-border/70 text-xs min-w-[8.125rem]"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(RECIPIENT_STATUS).map(([v, m]) => <SelectItem key={v} value={v}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {/* R2-MOD-022: a leitura que falhou aparece como FALHA — nunca como lista
            vazia confirmada ("Nenhum destinatario encontrado"). */}
        {recipientsFailed && (
          <p className="flex items-center gap-1.5 px-4 py-2 text-2xs text-dash-red border-b border-dash-red/20 bg-dash-red/5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Não foi possível carregar os destinatários{recipientsError instanceof Error ? `: ${recipientsError.message}` : ''}. A lista abaixo pode estar incompleta.</span>
          </p>
        )}
        {/* R2-MOD-022: teto de paginas atingido — a amostra e rotulada em vez de
            passar por lista completa. */}
        {recipientsData?.truncated && (
          <p className="px-4 py-2 text-2xs text-dash-amber border-b border-dash-amber/20 bg-dash-amber/5">
            Mostrando os primeiros {fmtInt(recipients.length)} destinatários (amostra do total, veja o filtro de status).
          </p>
        )}
        {/* F86 (TL-045): a lista rola em `overflow-auto`; sem foco proprio o
            teclado nao alcanca a rolagem (os itens nao sao focaveis) e quem
            nao usa mouse fica sem ver os destinatarios alem do corte. */}
        <div
          role="region"
          aria-label="Lista de destinatários"
          tabIndex={0}
          className="max-h-[30rem] overflow-auto divide-y divide-border/40"
        >
          {recipients.map((r) => <RecipientRow key={r.id} r={r} />)}
          {/* F80: CARREGANDO nao e VAZIO — a primeira pagina em andamento espera em
              vez de confirmar "nenhum destinatario". */}
          {!recipientsFailed && recipientsLoading && (
            <p role="status" className="text-center py-8 text-muted-foreground text-xs">Carregando destinatários…</p>
          )}
          {!recipientsFailed && !recipientsLoading && recipients.length === 0 && <p className="text-center py-8 text-muted-foreground text-xs">Nenhum destinatário encontrado</p>}
        </div>
      </section>

      <AlertDialog open={confirmPause} onOpenChange={setConfirmPause}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Pausar disparo?</AlertDialogTitle><AlertDialogDescription>Envios em andamento serão concluídos, mas novos não serão iniciados.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => { await runAction('pause'); setConfirmPause(false); }}>Pausar agora</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancelar disparo?</AlertDialogTitle><AlertDialogDescription>O envio será interrompido e destinatários pendentes não receberão mensagens.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction onClick={async () => { await runAction('cancel'); setConfirmCancel(false); }}>Cancelar disparo</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmResume} onOpenChange={setConfirmResume}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{isPaused ? 'Retomar disparo?' : 'Iniciar disparo?'}</AlertDialogTitle><AlertDialogDescription>{isPaused ? 'O envio continua de onde parou.' : 'Isso congela o público e os blocos revisados, gera a fila do disparo e envia mensagens reais no WhatsApp para os destinatários — sem volta.'}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={action.isPending || confirmDispatch.isPending} onClick={async () => { if (isDraft) { await startDraft(); } else { await runAction('start'); } setConfirmResume(false); }}>{isPaused ? 'Retomar' : 'Iniciar agora'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
