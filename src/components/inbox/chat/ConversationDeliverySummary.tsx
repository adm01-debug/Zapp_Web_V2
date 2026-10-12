/**
 * Paridade V3 -> V2 (auditoria de 11/10/2026, parte 1 do chat): pílulas de entrega da conversa.
 *
 * `summarizeDeliveryProgress` já existia (`./messageSendTimeline`), mas nada o mostrava na conversa.
 * Agora: uma pílula por estado com valor > 0 — "N na fila" (info), "N enviando" (primary, com pulso
 * suave) e "N com falha" (destructive). Só tokens do sistema, nenhuma cor literal.
 *
 * Interação: cada pílula é um <button> (alvo de 40 px, foco visível); clicar pede ao painel que role
 * até a primeira mensagem daquele estado (`onFocusState`) — o painel é quem tem o scroll.
 *
 * Movimento: mola curta (zappMotion), só transform/opacity, escalonamento de 40 ms por pílula.
 * Com "reduzir movimento" (useReducedMotion) nada se desloca: renderiza estático, já no estado final.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';
import { zappMotion } from '@/lib/motion';
import { estadoDeEnvio, summarizeDeliveryProgress, type EstadoDeEnvio, type MessageSendFields } from './messageSendTimeline';

export interface ConversationDeliverySummaryProps {
  messages: readonly MessageSendFields[];
  /** Clicar numa pílula pede o foco na primeira mensagem daquele estado. */
  onFocusState?: (estado: EstadoDeEnvio) => void;
  className?: string;
}

interface Pilula {
  estado: EstadoDeEnvio;
  rotulo: string;
  /** Rótulo acessível de AÇÃO (o que o clique faz), com a contagem anexada em `aria-label`. */
  acao: string;
  ponto: string;
  texto: string;
  pulso?: boolean;
}

const PILULAS: readonly Pilula[] = [
  {
    estado: 'queued',
    rotulo: 'na fila',
    acao: 'Ir para a primeira mensagem na fila',
    ponto: 'bg-info',
    texto: 'text-[hsl(var(--info))]',
  },
  {
    estado: 'inFlight',
    rotulo: 'enviando',
    acao: 'Ir para a primeira mensagem enviando',
    ponto: 'bg-primary',
    texto: 'text-primary',
    pulso: true,
  },
  {
    estado: 'failed',
    rotulo: 'com falha',
    acao: 'Ir para a primeira mensagem com falha',
    ponto: 'bg-destructive',
    texto: 'text-[hsl(var(--destructive-text))]',
  },
];

/** Nome acessível da pílula: a AÇÃO pedida pelo cartão + a contagem entre parênteses. */
const nomeAcessivel = (p: Pilula, quantidade: number): string => `${p.acao} (${quantidade})`;

/** Número que conta com mola (sem animação quando o movimento é reduzido). */
function NumeroAnimado({ valor }: { valor: number }) {
  const reduzido = useReducedMotion();
  const mola = useSpring(valor, { stiffness: 320, damping: 28, mass: 0.6 });
  const [mostrado, setMostrado] = useState(valor);

  // O callback do MotionValue atualiza o texto; nenhum setState solto no corpo de efeito.
  useMotionValueEvent(mola, 'change', (v) => {
    if (!reduzido) setMostrado(Math.round(v));
  });

  useEffect(() => {
    if (!reduzido) mola.set(valor);
  }, [valor, reduzido, mola]);

  return <span data-testid="contador-entrega">{reduzido ? valor : mostrado}</span>;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const pilulaVariants = {
  hidden: { opacity: 0, y: zappMotion.distance.small },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 380, damping: 30, mass: 0.7 },
  },
};

export function ConversationDeliverySummary({ messages, onFocusState, className }: ConversationDeliverySummaryProps) {
  const reduzido = useReducedMotion();
  const grupoRef = useRef<HTMLDivElement>(null);
  const { queued, inFlight, failed } = summarizeDeliveryProgress(messages);
  const valores: Record<EstadoDeEnvio, number> = { queued, inFlight, failed };
  const visiveis = PILULAS.filter((p) => valores[p.estado] > 0);

  // Teclado: setas movem o foco entre as pílulas; Enter/Espaço já clicam (são <button>).
  const aoTeclarNoGrupo = (evento: React.KeyboardEvent<HTMLDivElement>) => {
    if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return;
    const botoes = Array.from(grupoRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    if (botoes.length === 0) return;
    const atual = botoes.findIndex((b) => b === document.activeElement);
    const passo = evento.key === 'ArrowRight' ? 1 : -1;
    botoes[(atual + passo + botoes.length) % botoes.length]?.focus();
    evento.preventDefault();
  };

  if (visiveis.length === 0) return null;

  const classePilula = cn(
    'inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm',
    'transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  );

  const conteudo = (p: Pilula) => {
    const ponto = (
      <span className={cn('h-2 w-2 shrink-0 rounded-full', p.ponto)} aria-hidden="true" />
    );
    return (
      <>
        {p.pulso && !reduzido ? (
          <motion.span
            className={cn('h-2 w-2 shrink-0 rounded-full', p.ponto)}
            aria-hidden="true"
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        ) : (
          ponto
        )}
        <span className={cn('font-semibold tabular-nums', p.texto)}>
          <NumeroAnimado valor={valores[p.estado]} />
        </span>
        <span className="text-muted-foreground">{p.rotulo}</span>
      </>
    );
  };

  if (reduzido) {
    return (
      <div
        ref={grupoRef}
        role="status"
        aria-live="polite"
        data-testid="conversation-delivery-summary"
        className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2', className)}
        onKeyDown={aoTeclarNoGrupo}
      >
        {visiveis.map((p) => (
          <button
            key={p.estado}
            type="button"
            aria-label={nomeAcessivel(p, valores[p.estado])}
            className={classePilula}
            onClick={() => onFocusState?.(p.estado)}
          >
            {conteudo(p)}
          </button>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      ref={grupoRef}
      role="status"
      aria-live="polite"
      data-testid="conversation-delivery-summary"
      className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2', className)}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      onKeyDown={aoTeclarNoGrupo}
    >
      {visiveis.map((p) => (
        <motion.button
          key={p.estado}
          type="button"
          aria-label={nomeAcessivel(p, valores[p.estado])}
          variants={pilulaVariants}
          className={classePilula}
          onClick={() => onFocusState?.(p.estado)}
        >
          {conteudo(p)}
        </motion.button>
      ))}
    </motion.div>
  );
}
