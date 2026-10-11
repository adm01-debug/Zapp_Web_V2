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
 * Esc escopado: o banner é focável (tabIndex -1, foco inicial só quando o usuário não está
 * digitando) e o Esc só dispensa com o foco dentro dele — nunca listener global em `window`.
 * Saída animada de verdade: o `AnimatePresence` fica sempre montado e o conteúdo condicional
 * mora DENTRO dele, com `key` estável.
 *
 * Movimento: mola curta, só transform/opacity. Com "reduzir movimento" o banner já nasce no lugar
 * (sem estado inicial) e a saída é só por opacidade.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as TecladoBanner } from 'react';
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

/**
 * Só falha de TEXTO tem reenvio: `onSendMessage(content)` cria uma mensagem nova de texto
 * (assinatura em `ChatPanel`: `(content: string) => ...`). Os outros tipos reais de
 * `Message['type']` (`image`, `video`, `audio`, `file`, `document`, `location`,
 * `interactive`, `sticker`) não têm como reenviar o binário por aqui — mostram só o aviso.
 */
function podeReenviarComoTexto(mensagem: Message | null | undefined): boolean {
  return mensagem?.type === 'text';
}

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
  const montado = useRef(true);
  const ocupado = useRef(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  const ultima = falhas.length > 0 ? falhas[falhas.length - 1] : null;
  const podeReenviar = podeReenviarComoTexto(ultima);
  const visivel = falhas.length > 0 && dispensada !== assinatura;

  const dispensar = useCallback(() => setDispensada(assinatura), [assinatura]);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, []);

  // Foco inicial só quando o usuário não está digitando — nunca rouba o campo de texto.
  useEffect(() => {
    if (!visivel) return;
    const el = bannerRef.current;
    if (!el) return;
    const ativo = document.activeElement;
    if (
      ativo instanceof HTMLElement &&
      (ativo.tagName === 'INPUT' || ativo.tagName === 'TEXTAREA' || ativo.isContentEditable)
    ) {
      return;
    }
    if (ativo !== el && !el.contains(ativo)) el.focus({ preventScroll: true });
  }, [visivel]);

  const agendar = useCallback((fn: () => void, ms: number) => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      fn();
    }, ms);
  }, []);

  const reenviar = async () => {
    if (!ultima || reenvio !== 'parado' || ocupado.current) return;
    ocupado.current = true;
    setReenvio('enviando');
    try {
      await onSendMessage(ultima.content);
      if (!montado.current) return;
      setReenvio('concluido');
      agendar(() => {
        if (montado.current) setReenvio('parado');
      }, 1200);
    } catch {
      if (montado.current) setReenvio('parado');
    } finally {
      ocupado.current = false;
    }
  };

  // Esc escopado: só dispensa com o foco dentro do banner.
  const aoTeclarBanner = (evento: TecladoBanner<HTMLDivElement>) => {
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      dispensar();
    }
  };

  // O componente NUNCA sai antes do `AnimatePresence`: com falhas zerando o banner ainda precisa
  // rodar o `exit`. `visivel` (falhas > 0 e não dispensado) é quem controla o filho.
  const dispensado = falhas.length > 0 && !visivel && (
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

  const acao = podeReenviar ? (
    <Button type="button" variant="outline" size="default" onClick={() => void reenviar()} disabled={reenvio === 'enviando'}>
      {reenvio === 'enviando' ? (
        <>
          <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
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

  return (
    <>
      <AnimatePresence>
        {visivel && (
          <motion.div
            key="send-error-banner"
            ref={bannerRef}
            tabIndex={-1}
            onKeyDown={aoTeclarBanner}
            role="alert"
            data-testid="send-error-banner"
            className={classe}
            initial={reduzido ? false : { opacity: 0, y: -zappMotion.distance.medium }}
            animate={reduzido ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduzido ? { opacity: 0 } : { opacity: 0, y: -zappMotion.distance.medium }}
            transition={
              reduzido
                ? { duration: zappMotion.duration.fast }
                : { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 }
            }
          >
            {conteudo}
          </motion.div>
        )}
      </AnimatePresence>
      {dispensado}
    </>
  );
}
