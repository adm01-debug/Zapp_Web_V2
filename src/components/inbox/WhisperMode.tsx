import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/auth/useAuth';
import { useAgents, type AgentWithStats } from '@/hooks/crm/useAgents';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, EyeOff, Loader2, Mic, Pause, Play, RotateCcw, Send, Square, Trash2, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { WhisperAudioPlayer } from './WhisperAudioPlayer';
import { useAudioRecorder } from '@/hooks/communication/useAudioRecorder';
import { useMediaElementVolume } from '@/hooks/communication/useMediaElementVolume';
import { createStorageObjectId, removeStoredObjectBestEffort } from '@/lib/storage_object_upload';
import { cn } from '@/lib/utils';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { zappMotion, zappTransition, zappPopoverVariants } from '@/lib/motion';
import { log } from '@/lib/logger';
import { notificarSussurroEnviado, useWhisperCount, whisperCountKey } from '@/hooks/chat/useWhisperCount';

interface WhisperModeProps {
  contactId: string;
  /** Destinatário padrão do sussurro (ex.: o responsável atual da conversa). */
  targetAgentId?: string;
  className?: string;
}

interface WhisperMessage {
  id: string;
  content: string;
  sender_id: string;
  sender_name?: string;
  /** Perfil destinatário — só ele pode marcar a linha como lida. */
  target_agent_id: string;
  is_read: boolean;
  created_at: string;
  /** Caminho no bucket `audio-messages` (`<uid>/<conversa>/<uuid>`), quando a nota é por voz. */
  audio_path: string | null;
}

/** Mensagem de erro do upload de áudio (o INSERT tem tradução própria). */
const ERRO_UPLOAD_AUDIO = 'Não foi possível enviar o áudio do sussurro. Tente de novo.';

/** Mola curta (180–260 ms) para o painel do seletor de destinatário. */
const MOLA_CURTA = { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 } as const;

/**
 * O painel do seletor reaproveita as variantes do kit de popover e troca a
 * transição de entrada pela mola curta.
 */
const VARIANTES_DESTINO = {
  hidden: zappPopoverVariants.hidden,
  visible: { ...zappPopoverVariants.visible, transition: MOLA_CURTA },
  exit: zappPopoverVariants.exit,
} as const;

/** Traduz o erro do INSERT em algo que o atendente entende. */
function traduzirErroWhisper(error: { code?: string | null; message?: string | null }): string {
  const mensagem = (error.message ?? '').toLowerCase();
  const codigo = error.code ?? '';

  if (codigo === '42501' || mensagem.includes('row-level security') || mensagem.includes('permission') || mensagem.includes('permissão')) {
    return 'Sem permissão para enviar sussurro nesta conversa.';
  }
  if (codigo === 'PGRST116' || mensagem.includes('inaccessible') || mensagem.includes('not found') || mensagem.includes('contato')) {
    return 'Contato inacessível para sussurro.';
  }
  return 'Não foi possível enviar o sussurro. Tente de novo.';
}

/** Anel de presença do avatar: success quando online. */
function anelPresenca(status: AgentWithStats['status']): string {
  if (status === 'online') return 'ring-2 ring-success';
  if (status === 'away') return 'ring-2 ring-warning';
  return 'ring-2 ring-border';
}

interface SeletorDestinoProps {
  agents: AgentWithStats[];
  carregando: boolean;
  /** id do perfil escolhido (pode vir do responsável atual da conversa). */
  valor: string;
  onSelecionar: (id: string) => void;
  reduzido: boolean;
}

function SeletorDestino({ agents, carregando, valor, onSelecionar, reduzido }: SeletorDestinoProps) {
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const itensRef = useRef<Array<HTMLButtonElement | null>>([]);
  const focoInicialRef = useRef<{ agents: AgentWithStats[]; valor: string }>({ agents, valor });

  const selecionado = useMemo(() => agents.find((a) => a.id === valor) ?? null, [agents, valor]);

  // Ao abrir, foca o item já selecionado (ou o primeiro); recargas da lista não roubam foco.
  useEffect(() => {
    if (!aberto) return;
    const { agents: agentsAoAbrir, valor: valorAoAbrir } = focoInicialRef.current;
    const idx = agentsAoAbrir.findIndex((a) => a.id === valorAoAbrir);
    const alvo = idx >= 0 ? idx : 0;
    itensRef.current[alvo]?.focus();
  }, [aberto]);

  const abrirLista = () => {
    const idx = agents.findIndex((a) => a.id === valor);
    focoInicialRef.current = { agents, valor };
    setDestaque(idx >= 0 ? idx : 0);
    setAberto(true);
  };

  const fecharLista = (focarGatilho = false) => {
    setAberto(false);
    if (focarGatilho) gatilhoRef.current?.focus();
  };

  const moverDestaque = (dir: 1 | -1) => {
    const total = agents.length;
    if (total === 0) return;
    const proximo = (destaque + dir + total) % total;
    setDestaque(proximo);
    itensRef.current[proximo]?.focus();
  };

  const escolher = (id: string) => {
    onSelecionar(id);
    fecharLista(true);
  };

  const aoTeclar = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && aberto) {
      event.preventDefault();
      fecharLista(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (aberto) moverDestaque(1);
      else abrirLista();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (aberto) moverDestaque(-1);
      else abrirLista();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && aberto) {
      event.preventDefault();
      const agent = agents[destaque];
      if (agent) escolher(agent.id);
      return;
    }
    if (event.key === 'Tab' && aberto) {
      fecharLista();
    }
  };

  // Fecha ao sair do seletor (Tab ou clique fora), sem listener global.
  const aoPerderFoco = (event: React.FocusEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      fecharLista();
    }
  };

  const rotulo = selecionado?.name ?? (valor ? 'Responsável da conversa' : 'Escolher destinatário');

  const listaConteudo = carregando && agents.length === 0 ? (
    <div className="p-1 space-y-1.5" data-testid="sussurro-destino-carregando">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton variant="shimmer" className="h-7 w-7 rounded-full" />
          <Skeleton variant="shimmer" className="h-3 flex-1" style={{ animationDelay: `${i * 40}ms` }} />
        </div>
      ))}
    </div>
  ) : agents.length === 0 ? (
    <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum atendente disponível para receber o sussurro.</p>
  ) : (
    <div className="space-y-0.5" onKeyDown={aoTeclar}>
      {agents.map((agent, index) => {
        const ativo = agent.id === valor;
        return (
          <button
            key={agent.id}
            ref={(el) => { itensRef.current[index] = el; }}
            type="button"
            onClick={() => escolher(agent.id)}
            onFocus={() => setDestaque(index)}
            className={cn(
              'flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              index === destaque ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60 text-foreground',
            )}
          >
            <Avatar size="sm" className={anelPresenca(agent.status)}>
              {agent.avatar_url ? <AvatarImage src={agent.avatar_url} alt="" /> : null}
              <AvatarFallback className="bg-muted text-muted-foreground">{agent.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate">{agent.name}</span>
            {typeof agent.activeChats === 'number' && (
              <span className="text-3xs text-muted-foreground">{agent.activeChats} ativos</span>
            )}
            {ativo && <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={wrapperRef} className="relative" onBlur={aoPerderFoco}>
      <button
        ref={gatilhoRef}
        type="button"
        onClick={() => (aberto ? fecharLista(true) : abrirLista())}
        onKeyDown={aoTeclar}
        aria-expanded={aberto}
        aria-label={selecionado ? `Destinatário do sussurro: ${selecionado.name}` : 'Escolher destinatário do sussurro'}
        className={cn(
          'flex min-h-10 w-full items-center gap-2 rounded-md border border-border/60 bg-card-elevated px-2 py-1.5 text-xs text-foreground',
          'transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {selecionado ? (
          <Avatar size="xs" className={anelPresenca(selecionado.status)}>
            {selecionado.avatar_url ? <AvatarImage src={selecionado.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-muted text-muted-foreground">{selecionado.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
            <UserRound className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="flex-1 truncate text-left text-muted-foreground">{rotulo}</span>
        <ChevronDown
          data-testid="sussurro-destino-chevron"
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform', aberto && !reduzido && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {aberto &&
          (reduzido ? (
            <div
              key="sussurro-destino"
              data-testid="sussurro-destino-lista"
              className="mt-1 max-h-40 overflow-auto rounded-md border border-border/60 bg-card shadow-md"
            >
              {listaConteudo}
            </div>
          ) : (
            <motion.div
              key="sussurro-destino"
              data-testid="sussurro-destino-lista"
              variants={VARIANTES_DESTINO}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="mt-1 max-h-40 overflow-auto rounded-md border border-border/60 bg-card shadow-md"
            >
              {listaConteudo}
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}

export function WhisperMode({ contactId, targetAgentId, className }: WhisperModeProps) {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { agents, isLoading: carregandoAgentes } = useAgents();
  const reduzido = useReducedMotion() ?? false;

  const [message, setMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [enviadoOk, setEnviadoOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const enviadoTimerRef = useRef<number | null>(null);

  // Nota de voz: o gravador é o motor do PE-59/PE-24 (limite de 300 s e liberação de
  // microfone incluídos) e a prévia obedece ao volume único do app.
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [previaTocando, setPreviaTocando] = useState(false);
  const previaRef = useRef<HTMLAudioElement | null>(null);
  useMediaElementVolume(previaRef);

  const {
    isRecording,
    duration,
    audioUrl,
    startRecording,
    stopRecording,
    cancelRecording,
    formatDuration,
  } = useAudioRecorder({ onRecordingComplete: (blob) => setAudioBlob(blob) });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (enviadoTimerRef.current !== null) window.clearTimeout(enviadoTimerRef.current);
    };
  }, []);

  const isSupervisor = profile?.role === 'admin' || profile?.role === 'supervisor';

  // Estado próprio para o destino: a escolha do usuário vence; na falta dela,
  // vale o responsável atual da conversa (prop). Sem setState em efeito.
  const destinoId = escolhido ?? targetAgentId ?? '';

  // Fetch whisper messages for this contact
  const { data: whispers = [] } = useQuery({
    queryKey: ['whispers', contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from('whisper_messages')
        .select('id, content, sender_id, target_agent_id, is_read, created_at, audio_path')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!data) return [];

      // Get sender names
      const senderIds = [...new Set(data.map(w => w.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', senderIds);

      const nameMap = new Map((profiles || []).map(p => [p.id, p.name]));

      return data.map(w => ({
        ...w,
        sender_name: nameMap.get(w.sender_id) || 'Supervisor',
      })) as WhisperMessage[];
    },
    refetchInterval: 10000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(uniqueRealtimeTopic(`whisper-${contactId}`))
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whisper_messages',
        filter: `contact_id=eq.${contactId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['whispers', contactId] });
        setIsExpanded(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [contactId, queryClient]);

  // Selo: a fonte é o hook (contagem exata no banco dos sussurros endereçados a
  // MIM e não lidos) — a lista do painel é capada em 20 e conta o que eu enviei.
  const unreadCount = useWhisperCount(contactId);
  const meuPerfilId = profile?.id ?? null;

  // Marca como lido ao abrir o painel. Só invalida a contagem quando a gravação
  // passa: erro deixa o selo de pé (dado certo) e avisa a causa em pt-BR.
  useEffect(() => {
    if (!isExpanded || !contactId || !meuPerfilId || unreadCount <= 0) return;

    let cancelado = false;
    void (async () => {
      const { error } = await supabase
        .from('whisper_messages')
        .update({ is_read: true })
        .eq('contact_id', contactId)
        .eq('target_agent_id', meuPerfilId)
        .eq('is_read', false);

      if (cancelado) return;
      if (error) {
        // Falha ao marcar: o selo continua aceso para o destinatário tentar de novo.
        log.error('Failed to mark whispers as read:', error);
        toast.error('Não foi possível marcar os sussurros como lidos.');
        return;
      }
      void queryClient.invalidateQueries({ queryKey: whisperCountKey(contactId, meuPerfilId) });
      void queryClient.invalidateQueries({ queryKey: ['whispers', contactId] });
      notificarSussurroEnviado(contactId);
    })();

    return () => { cancelado = true; };
  }, [isExpanded, unreadCount, contactId, meuPerfilId, queryClient]);

  const podeEnviar = Boolean(message.trim()) && Boolean(destinoId) && !isSending;

  const sendWhisper = async () => {
    if (!message.trim() || !profile?.id || !destinoId || isSending) return;

    setErro(null);
    setIsSending(true);

    const { error } = await supabase.from('whisper_messages').insert({
      contact_id: contactId,
      sender_id: profile.id,
      target_agent_id: destinoId,
      content: message.trim(),
    });

    if (!isMountedRef.current) return;
    setIsSending(false);

    if (error) {
      // Falha: mantém o texto no campo e explica o motivo.
      setErro(traduzirErroWhisper(error));
      return;
    }

    setMessage('');
    setEnviadoOk(true);
    if (enviadoTimerRef.current !== null) window.clearTimeout(enviadoTimerRef.current);
    enviadoTimerRef.current = window.setTimeout(() => {
      if (isMountedRef.current) setEnviadoOk(false);
    }, 1500);
    queryClient.invalidateQueries({ queryKey: ['whispers', contactId] });
  };

  /** uid autenticado: a policy do bucket exige o objeto em `<auth.uid()>/...`. */
  const uidGravador = profile?.user_id ?? user?.id ?? '';

  const podeGravar = Boolean(destinoId) && Boolean(uidGravador) && !isSending && !isRecording;

  const iniciarGravacao = () => {
    if (!podeGravar) return;
    setErro(null);
    setPreviaTocando(false);
    void startRecording();
  };

  const descartarGravacao = () => {
    setAudioBlob(null);
    setPreviaTocando(false);
    cancelRecording();
  };

  const alternarPrevia = () => {
    const elemento = previaRef.current;
    if (!elemento) return;
    if (previaTocando) {
      elemento.pause();
      return;
    }
    const resultado = elemento.play();
    if (resultado && typeof resultado.catch === 'function') void resultado.catch(() => undefined);
  };

  const sendWhisperAudio = async () => {
    if (!audioBlob || !profile?.id || !destinoId || !uidGravador || isSending) return;

    setErro(null);
    setIsSending(true);

    // Contrato do cartão pai: exatamente três segmentos UUID (`<uid>/<conversa>/<uuid>`),
    // como a constraint `whisper_messages_audio_path_formato` exige.
    const caminho = `${uidGravador}/${contactId}/${createStorageObjectId()}`;
    const { error: erroUpload } = await supabase.storage
      .from('audio-messages')
      .upload(caminho, audioBlob, { contentType: 'audio/webm', metadata: { duration } });

    if (!isMountedRef.current) return;

    if (erroUpload) {
      setIsSending(false);
      setErro(ERRO_UPLOAD_AUDIO);
      return;
    }

    const { error } = await supabase.from('whisper_messages').insert({
      contact_id: contactId,
      sender_id: profile.id,
      target_agent_id: destinoId,
      content: '',
      audio_path: caminho,
    });

    if (!isMountedRef.current) return;
    setIsSending(false);

    if (error) {
      // A nota não virou linha: o objeto recém-enviado vira órfão, então sai (best-effort)
      // e a prévia continua na tela para o retry reenviar.
      setErro(traduzirErroWhisper(error));
      void removeStoredObjectBestEffort('audio-messages', caminho);
      return;
    }

    descartarGravacao();
    setEnviadoOk(true);
    if (enviadoTimerRef.current !== null) window.clearTimeout(enviadoTimerRef.current);
    enviadoTimerRef.current = window.setTimeout(() => {
      if (isMountedRef.current) setEnviadoOk(false);
    }, 1500);
    queryClient.invalidateQueries({ queryKey: ['whispers', contactId] });
  };

  const reenviarSussurro = () => {
    if (audioBlob) void sendWhisperAudio();
    else void sendWhisper();
  };

  if (!isSupervisor && whispers.length === 0) return null;

  const conteudoPainel = (
    <>
      <div className="p-2 bg-warning/10 border-b border-warning/20 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
          <EyeOff className="w-3 h-3" />
          Modo Sussurro — Invisível ao cliente
        </div>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setIsExpanded(false)} aria-label="Recolher">
          <X className="w-3 h-3" />
        </Button>
      </div>

      {/* Messages */}
      <div className="max-h-40 overflow-auto p-2 space-y-1.5">
        {whispers.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Nenhum sussurro ainda</p>
        ) : (
          whispers.slice().reverse().map(w => (
            <div key={w.id} className="text-xs p-1.5 rounded bg-muted/50">
              <span className="font-medium text-warning">{w.sender_name}:</span>{' '}
              {w.audio_path ? (
                <WhisperAudioPlayer audioPath={w.audio_path} autor={w.sender_name} className="mt-1" />
              ) : null}
              {w.content ? <span className="text-foreground">{w.content}</span> : null}
            </div>
          ))
        )}
      </div>

      {/* Input (supervisor only) */}
      {isSupervisor && (
        <div className="p-2 border-t border-border/30 space-y-1.5">
          <AnimatePresence>
            {erro && (
              <motion.div
                key="sussurro-erro"
                role="alert"
                data-testid="sussurro-erro"
                initial={reduzido ? { opacity: 0 } : { opacity: 0, y: -zappMotion.distance.small }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={zappTransition.fast}
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
              >
                <span className="flex-1">{erro}</span>
                <button
                  type="button"
                  onClick={reenviarSussurro}
                  disabled={isSending}
                  className="inline-flex shrink-0 items-center gap-1 rounded font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <RotateCcw className="h-3 w-3" />
                  Tentar de novo
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground" id="sussurro-destino-rotulo">Para</span>
            <div className="flex-1">
              <SeletorDestino
                agents={agents}
                carregando={carregandoAgentes}
                valor={destinoId}
                onSelecionar={(id) => { setEscolhido(id); setErro(null); }}
                reduzido={reduzido}
              />
            </div>
          </div>

          {isRecording ? (
            <div
              data-testid="sussurro-gravando"
              className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-destructive motion-safe:animate-pulse" aria-hidden="true" />
              <span
                role="timer"
                aria-label="Tempo de gravação do sussurro"
                className="flex-1 text-xs tabular-nums text-foreground"
              >
                {formatDuration(duration)}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={descartarGravacao}
                aria-label="Cancelar gravação do sussurro"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                className="h-8 w-8"
                onClick={() => stopRecording()}
                aria-label="Parar gravação do sussurro"
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ) : audioBlob ? (
            <div
              data-testid="sussurro-previa"
              className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/40 px-2 py-1.5"
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={alternarPrevia}
                aria-label={previaTocando ? 'Pausar prévia do sussurro por voz' : 'Ouvir prévia do sussurro por voz'}
              >
                {previaTocando ? (
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </Button>
              <span className="flex-1 text-xs tabular-nums text-muted-foreground">{formatDuration(duration)}</span>
              <audio
                ref={previaRef}
                src={audioUrl ?? undefined}
                preload="metadata"
                className="hidden"
                onPlay={() => setPreviaTocando(true)}
                onPause={() => setPreviaTocando(false)}
                onEnded={() => setPreviaTocando(false)}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={descartarGravacao}
                aria-label="Descartar gravação do sussurro"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                className="h-8 w-8"
                onClick={() => void sendWhisperAudio()}
                disabled={isSending}
                aria-label="Enviar nota de sussurro por voz"
              >
                {isSending ? (
                  <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </Button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Input
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Orientação para o agente..."
                aria-label="Mensagem do sussurro"
                className="h-10 text-xs"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (podeEnviar) void sendWhisper();
                }}
              />
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1.5" tabIndex={destinoId ? -1 : 0}>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-10 w-10 shrink-0"
                        onClick={iniciarGravacao}
                        disabled={!podeGravar}
                        aria-label="Gravar nota de sussurro por voz"
                      >
                        <Mic className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={sendWhisper}
                        disabled={!podeEnviar}
                        aria-label="Enviar sussurro"
                      >
                        {isSending ? (
                          <Loader2 data-testid="sussurro-enviando" className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                        ) : enviadoOk ? (
                          <Check data-testid="sussurro-enviado-ok" className="h-4 w-4 text-success" aria-hidden="true" />
                        ) : (
                          <Send className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!destinoId && (
                    <TooltipContent side="top">Escolha um destinatário para enviar o sussurro</TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className={cn("relative", className)}>
      {/* Whisper toggle button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="relative gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <EyeOff className="w-3.5 h-3.5" />
        Sussurro
        {unreadCount > 0 && (
          <Badge variant="destructive" className="h-4 w-4 p-0 text-3xs flex items-center justify-center">
            {unreadCount}
          </Badge>
        )}
      </Button>

      <AnimatePresence>
        {isExpanded &&
          (reduzido ? (
            <div
              key="sussurro-painel"
              data-testid="sussurro-painel"
              className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-card border border-dashed border-warning/50 rounded-lg shadow-lg overflow-hidden"
              style={{ minWidth: 300 }}
            >
              {conteudoPainel}
            </div>
          ) : (
            <motion.div
              key="sussurro-painel"
              data-testid="sussurro-painel"
              initial={{ opacity: 0, y: -zappMotion.distance.small }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -zappMotion.distance.small }}
              transition={zappTransition.normal}
              className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-card border border-dashed border-warning/50 rounded-lg shadow-lg overflow-hidden"
              style={{ minWidth: 300 }}
            >
              {conteudoPainel}
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}
