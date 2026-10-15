/**
 * Paridade V3 -> V2 (auditoria de 11/10/2026, parte 1 do chat): aviso de mensagem não enviada.
 *
 * Antes, uma mensagem com status 'failed' só ganhava o ícone vermelho no balão — a conversa não
 * avisava nada. Agora o banner aparece quando há falha do agente, entra deslizando (mola curta) e
 * tem "Enviar de novo" (spinner -> check) e "Dispensar" (também por Esc, com "Desfazer").
 *
 * Autoria e idade (PK-23, paridade com o varredor do PD-78): o banner só age no que o atendente
 * pode agir. `messages.agent_id` aponta para `profiles.id` (ver RLS de insert em messages), então:
 *  - atendente comum: só as falhas DELE entram (contador e reenvio) — texto antigo de outro
 *    atendente nunca é reenviado por aqui;
 *  - admin/supervisor: vê as de todos, mas reenviar a de outro exige confirmação explícita;
 *  - perfil ainda não carregado (`profiles.id` desconhecido): nada é escondido — a falha aparece
 *    e o reenvio pede confirmação, porque a autoria não pode ser atribuída ainda.
 * Idade: a partir de 1 h o reenvio pede confirmação (pode não fazer sentido agora) e acima de 24 h
 * a falha é rotulada "Falha antiga" — nunca sai reenvio automático.
 *
 * Retentativa = mensagem NOVA: o cartão diz que não há RPC para recolocar a MESMA linha na fila, então
 * o botão chama `onSendMessage` com o texto da falha ESCOLHIDA (com mais de uma, o atendente escolhe
 * no seletor; sem seletor vale a mais recente). Falha de mídia/interativa não tem como reenviar o
 * binário por aqui: mostra só o aviso, sem botão.
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
import { useAuth } from '@/hooks/auth/useAuth';
import { zappMotion } from '@/lib/motion';
import type { Message } from '@/types/chat';
import type { Profile } from '@/types/auth';

export interface SendErrorBannerProps {
  messages: readonly Message[];
  onSendMessage: (content: string) => void | Promise<void>;
  className?: string;
}

type EstadoReenvio = 'parado' | 'enviando' | 'concluido';

/**
 * Relógio do banner. Fica FORA do corpo do componente de propósito: `Date.now()` direto no render
 * é impuro (`react-hooks/purity`) e o valor mudaria a cada re-render sem motivo. Aqui o tempo só
 * serve para rotular a idade da falha ("Falha antiga") e decidir se o reenvio pede confirmação.
 * É lido a cada render — a conversa re-renderiza a cada mensagem, então a idade acompanha o painel.
 */
function agoraMs(): number {
  return Date.now();
}

/** Acima disso a falha é "antiga": aparece rotulada e nunca reenvia sem confirmação. */
export const LIMITE_FALHA_ANTIGA_MS = 24 * 60 * 60 * 1000;
/** Acima disso o reenvio pede confirmação (o texto pode não fazer sentido agora). */
export const LIMITE_CONFIRMACAO_MS = 60 * 60 * 1000;

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

/** Criada há quantos ms (0 quando não há data utilizável). */
function idadeMs(mensagem: Message, agora: number): number {
  const referencia = mensagem.created_at ?? mensagem.timestamp?.toISOString();
  if (!referencia) return 0;
  const t = Date.parse(referencia);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, agora - t);
}

const ROTULO_TIPO: Record<string, string> = {
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  file: 'Arquivo',
  document: 'Documento',
  location: 'Localização',
  interactive: 'Interativa',
  sticker: 'Figurinha',
  unsupported: 'Não suportada',
};

/** Resumo curto para o seletor: o atendente precisa reconhecer a mensagem que vai reenviar. */
function resumoDaFalha(mensagem: Message): string {
  if (mensagem.type === 'text') {
    const texto = mensagem.content.replace(/\s+/g, ' ').trim();
    return texto.length > 40 ? `${texto.slice(0, 40)}…` : texto || '(texto vazio)';
  }
  return ROTULO_TIPO[mensagem.type] ?? mensagem.type;
}

function horaCurta(mensagem: Message): string {
  const t = Date.parse(mensagem.created_at ?? '');
  if (Number.isNaN(t)) return '--:--';
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Perfil atual sem exigir o `AuthProvider`. `useAuth` lança fora do provider — situação real dos
 * testes que montam o `ChatPanel` mockando import por import, e do primeiro render depois do login,
 * quando o perfil ainda não chegou. Sem autor conhecido a falha NÃO é escondida: ela entra com
 * confirmação obrigatória no reenvio (mesma regra da falha de colega vista por um gestor).
 */
function usePerfilAtual(): { profile: Profile | null } {
  try {
    return useAuth();
  } catch {
    return { profile: null };
  }
}

export function SendErrorBanner({ messages, onSendMessage, className }: SendErrorBannerProps) {
  const reduzido = useReducedMotion();
  const { profile } = usePerfilAtual();
  /** `messages.agent_id` referencia `profiles.id` (RLS de insert em messages). */
  const meuPerfilId = profile?.id ?? null;
  const gestor = profile?.role === 'admin' || profile?.role === 'supervisor';
  /** Sem perfil carregado a autoria não é atribuível: mostra com confirmação em vez de esconder. */
  const autoriaIndefinida = meuPerfilId === null;

  const falhas = useMemo(
    () => messages.filter((m) => m.sender === 'agent' && (m.status ?? 'sending') === 'failed').sort(porHorario),
    [messages],
  );

  const deOutroAtendente = useCallback(
    (mensagem: Message) => mensagem.agent_id != null && mensagem.agent_id !== meuPerfilId,
    [meuPerfilId],
  );

  // Atendente comum não vê (nem conta) falha de colega: só entra o que ele pode agir.
  const visiveis = useMemo(
    () => falhas.filter((m) => gestor || autoriaIndefinida || !deOutroAtendente(m)),
    [falhas, gestor, autoriaIndefinida, deOutroAtendente],
  );

  const assinatura = visiveis.map((m) => m.id).join('|');
  const [dispensada, setDispensada] = useState<string | null>(null);
  const [escolhidaId, setEscolhidaId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [reenvio, setReenvio] = useState<EstadoReenvio>('parado');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const montado = useRef(true);
  const ocupado = useRef(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  const agora = agoraMs();
  // Sem escolha explícita vale a falha mais recente; a escolha vence enquanto ela existir.
  const selecionada = visiveis.find((m) => m.id === escolhidaId) ?? visiveis[visiveis.length - 1] ?? null;
  const idadeSelecionada = selecionada ? idadeMs(selecionada, agora) : 0;
  const selecionadaAntiga = idadeSelecionada > LIMITE_FALHA_ANTIGA_MS;
  const selecionadaDeOutro = selecionada ? deOutroAtendente(selecionada) : false;
  const exigeConfirmacao = selecionadaAntiga || selecionadaDeOutro || idadeSelecionada > LIMITE_CONFIRMACAO_MS;
  const podeReenviar = podeReenviarComoTexto(selecionada);
  const visivel = visiveis.length > 0 && dispensada !== assinatura;

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

  const reenviar = async (mensagem: Message) => {
    if (reenvio !== 'parado' || ocupado.current) return;
    ocupado.current = true;
    setConfirmando(false);
    setReenvio('enviando');
    try {
      await onSendMessage(mensagem.content);
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

  const pedirReenvio = () => {
    if (!selecionada || !podeReenviar || reenvio !== 'parado') return;
    if (exigeConfirmacao) {
      setConfirmando(true);
      return;
    }
    void reenviar(selecionada);
  };

  const escolher = (id: string) => {
    setEscolhidaId(id);
    setConfirmando(false);
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
  const dispensado = visiveis.length > 0 && !visivel && (
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

  const seletor = visiveis.length > 1 && (
    <span className="flex items-center gap-1">
      <label className="sr-only" htmlFor="send-error-banner-escolha">
        Mensagem com falha
      </label>
      <select
        id="send-error-banner-escolha"
        value={selecionada?.id ?? ''}
        onChange={(e) => escolher(e.target.value)}
        className="max-w-[16rem] min-h-10 rounded-md border border-border bg-background px-2 text-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visiveis.map((m) => {
          const antiga = idadeMs(m, agora) > LIMITE_FALHA_ANTIGA_MS;
          const deOutro = deOutroAtendente(m);
          return (
            <option key={m.id} value={m.id}>
              {horaCurta(m)} — {resumoDaFalha(m)}
              {antiga ? ' · falha antiga' : ''}
              {deOutro ? ' · outro atendente' : ''}
            </option>
          );
        })}
      </select>
    </span>
  );

  const etiquetaAntiga = selecionada && selecionadaAntiga && (
    <span className="text-2xs text-muted-foreground">Falha antiga (mais de 24 h)</span>
  );

  const confirmacao = confirmando && selecionada && (
    <div
      role="group"
      aria-label="Confirmar reenvio"
      className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground"
    >
      <span>
        {selecionadaDeOutro
          ? 'Esta falha é de outro atendente.'
          : selecionadaAntiga
            ? 'Esta falha tem mais de 24 h.'
            : 'Esta falha tem mais de 1 h.'}{' '}
        Reenviar como mensagem nova?
      </span>
      <Button type="button" variant="outline" size="default" onClick={() => void reenviar(selecionada)}>
        Confirmar reenvio
      </Button>
      <Button type="button" variant="ghost" size="default" onClick={() => setConfirmando(false)}>
        Cancelar
      </Button>
    </div>
  );

  const acao = podeReenviar ? (
    <Button type="button" variant="outline" size="default" onClick={pedirReenvio} disabled={reenvio === 'enviando'}>
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
        {visiveis.length} {visiveis.length === 1 ? 'mensagem não foi enviada' : 'mensagens não foram enviadas'}
      </span>
      {seletor}
      {etiquetaAntiga}
      {acao}
      {confirmacao}
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
