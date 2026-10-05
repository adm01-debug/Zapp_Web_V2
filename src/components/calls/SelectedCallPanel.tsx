import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Save, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { CallStatusBadge } from './CallStatusBadge';
import { CallChannelBadge } from './CallChannelBadge';
import { RecordingPlayer } from './RecordingPlayer';
import { getContactLabel } from '@/lib/calls/historyLabels';
import { END_REASON_LABEL, type EndReason } from '@/lib/calls/callStatus';
import { formatClock, talkSeconds } from '@/lib/calls/duration';
import { useCalls } from '@/hooks/communication/useCalls';
import { useUserRole, type AppRole } from '@/hooks/system/useUserRole';
import { useAuth } from '@/hooks/auth/useAuth';
import type { SearchMyCallsRow } from '@/hooks/calls/useMyCalls';

const PAPEIS_QUE_ANOTAM: AppRole[] = ['admin', 'supervisor'];

interface SelectedCallPanelProps {
  call: SearchMyCallsRow | null;
  onClose: () => void;
}

/** Rascunho da anotacao amarrado ao id do registro a que pertence. */
interface Rascunho {
  callId: string;
  texto: string;
}

/**
 * Detalhe da ligacao selecionada (T65) e a anotacao do agente (T66).
 *
 * `agent_notes` e o que o agente escreve; `notes` (quando existe) e metadado do
 * provedor e aparece como LEITURA, nunca como campo - juntar os dois faria o agente
 * apagar dado de origem sem perceber.
 */
export function SelectedCallPanel({ call, onClose }: SelectedCallPanelProps) {
  const { addCallNotes } = useCalls();
  const { hasRole } = useUserRole();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  // R2-MOD-013: o rascunho pertence a UMA chamada. Antes era um estado solto
  // (`useState<string | null>`): ao trocar a chamada selecionada com o painel ainda
  // MONTADO (o pai nao da `key` por chamada), o texto digitado na chamada anterior
  // continuava valendo e `salvar` gravava o texto de A no id de B. Guardando o id
  // junto do texto, cada chamada so enxerga o proprio rascunho - o de A fica
  // preservado (e reaparece se A voltar a ser selecionada) e B mostra as notas reais
  // de B. O rascunho nunca e derivado do estado de outra chamada.
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);

  // T66: anota quem supervisiona E o dono da chamada. "Dono" aqui e o dono DO REGISTRO
  // (`calls.agent_id`), nao um papel - o dominio nao tem papel "owner". A RPC confere isso
  // de novo do lado do banco, entao a tela nao e a unica guarda.
  // `calls.agent_id` aponta para o PROFILE, nao para o id de auth: comparar com
  // `user.id` deixaria o proprio dono da chamada sem poder anotar (bug que o teste pegou).
  const souODono = Boolean(call?.agent_id && profile?.id && call.agent_id === profile.id);
  const podeAnotar = PAPEIS_QUE_ANOTAM.some((papel) => hasRole(papel)) || souODono;
  const rascunhoDaChamada = rascunho && call && rascunho.callId === call.id ? rascunho.texto : null;
  const valor = rascunhoDaChamada ?? call?.agent_notes ?? '';

  const salvar = useCallback(async () => {
    if (!call) return;
    setSalvando(true);
    try {
      const salvou = await addCallNotes(call.id, valor);
      // O historico le a RPC por cache: sem invalidar, a linha continuaria mostrando a
      // anotacao velha depois de salvar - o aceite do T66 pede a linha atualizada.
      if (salvou) await queryClient.invalidateQueries({ queryKey: ['calls'] });
    } finally {
      setSalvando(false);
    }
  }, [call, valor, addCallNotes, queryClient]);

  if (!call) {
    return (
      <div className="py-8 text-center" data-testid="tel-selected-panel">
        <p className="text-sm text-muted-foreground">Selecione uma ligação no histórico para ver os detalhes.</p>
      </div>
    );
  }

  const duracao = talkSeconds(call);
  const motivo = call.end_reason ? END_REASON_LABEL[call.end_reason as EndReason] : null;

  return (
    <div className="space-y-4" data-testid="tel-selected-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Detalhe da chamada</h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Fechar detalhe">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <p className="text-base font-medium text-foreground">{getContactLabel(call)}</p>
        {(call.contact_phone || call.peer_number) && (
          <p className="text-sm text-muted-foreground">{call.contact_phone || call.peer_number}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CallChannelBadge channel={call.channel as 'voip' | 'whatsapp'} />
        <CallStatusBadge call={call} />
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Início: {format(new Date(call.started_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}</p>
        {call.answered_at && <p>Atendida: {format(new Date(call.answered_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}</p>}
        {call.ended_at && <p>Fim: {format(new Date(call.ended_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}</p>}
        {duracao != null && <p>Duração: {formatClock(duracao)}</p>}
        {motivo && (
          <p data-testid="tel-end-reason">
            Desfecho: {motivo}
          </p>
        )}
      </div>

      {/* T67: o player so aparece quando a chamada diz que tem gravacao. */}
      <RecordingPlayer callId={call.id} recordingStatus={call.recording_status} />

      {call.notes && (
        <div className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground" data-testid="tel-provider-notes">
          <p className="mb-1 flex items-center gap-1 font-medium">
            <Lock className="h-3 w-3" /> Registro do provedor (somente leitura)
          </p>
          <p>{call.notes}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">Anotações</p>
        <Textarea
          value={valor}
          onChange={(e) => setRascunho({ callId: call.id, texto: e.target.value })}
          placeholder={podeAnotar ? 'Adicionar anotação sobre esta chamada...' : 'Somente supervisores podem anotar'}
          disabled={!podeAnotar}
          className="min-h-20 text-sm"
          data-testid="tel-notes"
        />
        <Button size="sm" onClick={salvar} disabled={!podeAnotar || salvando} data-testid="tel-save-notes">
          {salvando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}
