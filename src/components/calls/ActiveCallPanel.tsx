import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, Grid3X3, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Keypad } from './Keypad';
import { PostCallSummary } from './PostCallSummary';
import { CallChannelBadge } from './CallChannelBadge';
import { formatClock } from '@/lib/calls/duration';
import { getInitials } from '@/lib/formatters';
import { useCallSession } from '@/providers/CallSessionProvider';
import { useCallChannels } from '@/hooks/calls/useCallChannels';
import type { CallSessionStatus } from '@/lib/calls/session';

/**
 * Rotulo operacional de cada estado da sessao (T62). A ordem e a da maquina em
 * `session.ts` - nenhum estado inventado aqui, e nenhum rotulo solto na view.
 */
const ESTADO_LABEL: Record<CallSessionStatus, string> = {
  idle: 'Livre',
  dialing: 'Chamando...',
  ringing_out: 'Tocando...',
  ringing_in: 'Chamada recebida',
  connecting: 'Conectando...',
  active: 'Em ligação',
  ending: 'Encerrando...',
  ended: 'Encerrada',
};

interface ActiveCallPanelProps {
  /** Inicio da contagem, em segundos ja contados pela sessao. */
  segundos: number;
}

/**
 * Painel da chamada em curso (T62/T63), no mesmo slot do `NewCallPanel`.
 *
 * Aparece quando a sessao sai de `idle` e sai quando ela volta - o agente nao escolhe
 * entre ver a ligacao e digitar outro numero: durante a ligacao, digitar so faz sentido
 * como tom (DTMF). Por isso o teclado aqui nasce em modo `dtmf`.
 */
export function ActiveCallPanel({ segundos }: ActiveCallPanelProps) {
  const sessao = useCallSession();
  const { voip } = useCallChannels();
  const [tecladoAberto, setTecladoAberto] = useState(false);

  const estado = sessao.session.status;
  const recebendo = estado === 'ringing_in';
  const ativa = estado === 'active';
  const numero = sessao.session.phone || sessao.currentNumber || '';
  const nome = sessao.session.name;

  // T64: encerrada a ligacao, o lugar da chamada passa a ser o resumo pos-chamada.
  if (estado === 'ended') {
    return <PostCallSummary segundos={segundos} />;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="active-call"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.12 }}
      >
        <Card className="border-primary/30 bg-card" data-testid="tel-active-panel">
          <CardContent className="flex flex-col items-center gap-4 p-4">
            {/* Estado (T62) */}
            <p
              className="text-sm font-medium text-muted-foreground"
              aria-live="polite"
              data-testid="tel-active-status"
            >
              {ESTADO_LABEL[estado]}
              {/* O relogio so corre na ligacao atendida: em `dialing`/`ringing_out`
                  ainda nao existe conversa para cronometrar. */}
              {ativa ? ` · ${formatClock(segundos)}` : ''}
            </p>

            {/* Contato (T62) */}
            <div className="flex flex-col items-center gap-2">
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
                data-testid="tel-active-avatar"
              >
                {getInitials(nome ?? '') || <User className="h-6 w-6" />}
              </span>
              {nome && <p className="max-w-full truncate text-base font-semibold text-foreground">{nome}</p>}
              <p className="font-mono text-sm text-muted-foreground" data-testid="tel-active-number">
                {numero || 'Chamada'}
              </p>
              <CallChannelBadge channel={sessao.session.channel} />
            </div>

            {/* Teclado DTMF (T63) */}
            {tecladoAberto && ativa && (
              <Keypad onKey={sessao.sendDTMF} mode="dtmf" />
            )}

            {/* Controles (T63) */}
            <div className="flex items-center justify-center gap-3">
              {recebendo ? (
                <>
                  <Button
                    size="icon"
                    className="h-12 w-12 rounded-full bg-success hover:bg-success/90"
                    onClick={sessao.accept}
                    aria-label="Atender"
                    data-testid="tel-accept"
                  >
                    <Phone className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-12 w-12 rounded-full"
                    onClick={sessao.reject}
                    disabled={!voip.canReject}
                    aria-label="Recusar"
                    data-testid="tel-reject"
                  >
                    <PhoneOff className="h-5 w-5" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-full"
                    onClick={sessao.toggleMute}
                    disabled={!ativa}
                    aria-pressed={sessao.isMuted}
                    aria-label={sessao.isMuted ? 'Ativar microfone' : 'Silenciar'}
                    data-testid="tel-mute"
                  >
                    {sessao.isMuted ? <MicOff className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-full"
                    onClick={() => setTecladoAberto((v) => !v)}
                    disabled={!ativa}
                    aria-pressed={tecladoAberto}
                    aria-label="Teclado"
                    data-testid="tel-dtmf-toggle"
                  >
                    <Grid3X3 className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-12 w-12 rounded-full"
                    onClick={sessao.hangup}
                    aria-label="Encerrar"
                    data-testid="tel-hangup"
                  >
                    <PhoneOff className="h-5 w-5" />
                  </Button>
                </>
              )}
            </div>

            {/* Linha de origem (T62) */}
            <p className="text-center text-xs text-muted-foreground" data-testid="tel-active-origin">
              {sessao.session.channel === 'whatsapp' ? 'Pela linha WhatsApp' : 'Pela linha VoIP'}
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
