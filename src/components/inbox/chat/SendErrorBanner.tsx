/**
 * Paridade V3 -> V2 (auditoria de 11/10/2026, parte 1 do chat): aviso de mensagem não enviada.
 *
 * Antes, uma mensagem com status 'failed' só ganhava o ícone vermelho no balão — a conversa não
 * avisava nada. Agora o banner aparece quando há falha do agente, entra deslizando (mola curta) e
 * tem "Enviar de novo" (spinner -> check) e "Dispensar" (também por Esc, com "Desfazer").
 *
 * Retentativa = mensagem NOVA: o cartão diz que não há RPC para recolocar a MESMA linha na fila, então
 * o botão chama `onSendMessage` com o texto da última falha de texto. Falha de mídia/interativa não
 * tem como reenviar o binário por aqui: mostra só o aviso, sem botão.
 *
 * Movimento: mola curta, só transform/opacity. Com "reduzir movimento" o banner já nasce no lugar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { zappMotion } from '@/lib/motion';
import type { Message } from '@/types/chat';

export interface SendErrorBannerProps {
  messages: readonly Message[];
  onSendMessage: (content: string) => void | Promise<void>;
  className?: string;
}

type EstadoReenvio = 'parado' | 'enviando' | 'concluido';

const porHorario = (a: Message, b: Message) => (a.created_at ?? '').localeCompare(b.created_at ?? '');

export function SendErrorBanner({ messages, onSendMessage, className }: SendErrorBannerProps) {
  const reduzido = useReducedMotion();
  const falhas = useMemo(
    () => messages.filter((m) => m.sender === 'agent' && (m.status ?? 'sending') === 'failed').sort(porHorario),
    [messages],
  );
  const assinatura = falhas.map((m) => m.id).join('|');
  const [dispensada, setDispensada] = useState<string | null>(null);
  const [reenvio, setReenvio] = useState<EstadoReenvio>('parado');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ultima = falhas.length > 0 ? falhas[falhas.length - 1] : null;
  const podeReenviar = ultima?.type === 'text';
  const visivel = falhas.length > 0 && dispensada !== assinatura;

  const dispensar = useCallback(() => setDispensada(assinatura), [assinatura]);

  useEffect(() => {
    if (!visivel) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') dispensar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [visivel, dispensar]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const reenviar = async () => {
    if (!ultima || reenvio !== 'parado') return;
    setReenvio('enviando');
    try {
      await onSendMessage(ultima.content);
      setReenvio('concluido');
      timer.current = setTimeout(() => setReenvio('parado'), 1200);
    } catch {
      setReenvio('parado');
    }
  };

  if (falhas.length === 0) return null;

  if (!visivel) {
    return (
      <div
        data-testid="send-error-banner-dispensado"
        className={cn('mx-3 mt-2 flex items-center gap-2 text-2xs text-muted-foreground', className)}
      >
        <span>Aviso de envio dispensado.</span>
        <button
          type="button"
          className="min-h-10 rounded-md px-2 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setDispensada(null)}
        >
          Desfazer
        </button>
      </div>
    );
  }

  const acao = podeReenviar ? (
    <Button type="button" variant="outline" size="default" onClick={() => void reenviar()} disabled={reenvio === 'enviando'}>
      {reenvio === 'enviando' ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Enviando…
        </>
      ) : reenvio === 'concluido' ? (
        <>
          <Check className="text-[hsl(var(--success))]" aria-hidden="true" />
          Enviado
        </>
      ) : (
        'Enviar de novo'
      )}
    </Button>
  ) : null;

  const conteudo = (
    <>
      <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--destructive-text))]" aria-hidden="true" />
      <span className="text-[hsl(var(--destructive-text))]">
        {falhas.length} {falhas.length === 1 ? 'mensagem não foi enviada' : 'mensagens não foram enviadas'}
      </span>
      {acao}
      <Button
        type="button"
        variant="ghost"
        size="default"
        className="ml-auto"
        onClick={dispensar}
      >
        Dispensar
      </Button>
    </>
  );

  const classe = cn(
    'mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border border-l-4 border-l-destructive',
    'bg-destructive/10 px-3 py-2 shadow-[var(--glow-destructive-md)]',
    className,
  );

  if (reduzido) {
    return (
      <div role="alert" data-testid="send-error-banner" className={classe}>
        {conteudo}
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        role="alert"
        data-testid="send-error-banner"
        className={classe}
        initial={{ opacity: 0, y: -zappMotion.distance.medium }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -zappMotion.distance.medium }}
        transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.7 }}
      >
        {conteudo}
      </motion.div>
    </AnimatePresence>
  );
}
